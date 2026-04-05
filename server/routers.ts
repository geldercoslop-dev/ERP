import cookie from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS, ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { healthRouter } from "./routers/health.js";
import { publicProcedure, protectedProcedure, requireRole, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SQL } from "drizzle-orm";
import * as db from "./db/index.js";
import * as pdf from "./pdf.js";
import { roundToTwo, sumWithPrecision, subtractWithPrecision, multiplyWithPrecision } from "./utils/financialUtils.js";
import { nanoid } from "nanoid";
import { assertOwnership, resolveOwnerUserId } from "./_core/ownership.js";
import { executeCommand, commandResult } from "./_core/command.js";
import { isInProgress } from "../shared/idempotency.js";
import { checkRequestIdMemory, registerSuccessfulCreation, logDuplicationAttempt, generateConcurrencyReport } from "./concurrency/pedido-control.js";
import { requireTenant } from "./_core/tenant.js";
import { checkRateLimit, clearRateLimitForKey } from "./services/rateLimitService.js";
import { logAuth } from "./services/auditService.js";
import { leoRouter } from "./routers/leo.js";
import { resolveServiceActor } from "./_core/service-actor.js";
import { auditEntityChange } from "./_core/domain-audit.js";
import * as cachedClientes from "./services/cached-clientes.service.js";
import { logger } from "./_core/logger.js";
import { getPoolStatsSnapshot } from "./config/database.js";
import {
  isDuplicateKeyError,
  createPedidoSafe,
  listPedidosTrpcPage,
  getPedidoWithItensForActor,
  getPedidoByIdForActor,
  getItensPedido,
  PedidoAccessError,
} from "./services/orders.service.js";
import * as logisticaService from "./services/logistica.service.js";
import { buscarRegistros } from "./services/audit-service.js";

/**
 * Gerenciador de bcrypt robusto com fallback seguro e cache
 * 
 * Implementa:
 * 1. Carregamento dinâmico do bcryptjs
 * 2. Cache do módulo para evitar carregamentos repetidos
 * 3. Suporte para migração gradual de senhas em texto plano
 * 4. Fallback seguro para desenvolvimento
 */

// Cache do módulo bcrypt
let bcryptCache: {
  hash: (data: string, saltOrRounds: string | number) => Promise<string>;
  compare: (data: string, encrypted: string) => Promise<boolean>;
  isSecure: boolean; // indica se estamos usando bcryptjs real ou fallback
  migratePlaintext: (plaintext: string) => Promise<string>; // função para migrar senhas em texto plano
} | null = null;

async function getBcrypt(): Promise<{
  hash: (data: string, saltOrRounds: string | number) => Promise<string>;
  compare: (data: string, encrypted: string) => Promise<boolean>;
  isSecure: boolean;
  migratePlaintext: (plaintext: string) => Promise<string>;
}> {
  // Se já temos uma instância em cache, retorne-a
  if (bcryptCache) {
    return bcryptCache;
  }

  try {
    console.log("[getBcrypt] Tentando carregar bcryptjs...");
    
    // Importar bcryptjs de forma dinâmica
    const bcryptImported = await import("bcryptjs");
    const bcryptModule: any = (bcryptImported as any).default ?? bcryptImported;
    
    // Verificar se as funções necessárias estão disponíveis
    if (typeof bcryptModule.hash !== 'function' || typeof bcryptModule.compare !== 'function') {
      throw new Error("Funções bcrypt não encontradas no módulo importado");
    }
    
    // Testar as funções com um valor simples
    try {
      console.log("[getBcrypt] Testando funções bcrypt...");
      const testValue = "test-" + Date.now();
      const testHash = await bcryptModule.hash(testValue, 1); // Usar rounds=1 para teste rápido
      
      if (!testHash || typeof testHash !== 'string' || !testHash.startsWith('$2')) {
        throw new Error(`Hash inválido gerado: ${testHash}`);
      }
      
      const testCompare = await bcryptModule.compare(testValue, testHash);
      
      if (!testCompare) {
        throw new Error("Comparação de teste falhou");
      }
      
      console.log("[getBcrypt] bcryptjs carregado e testado com sucesso");
      
      // Criar e armazenar em cache o objeto bcrypt
      // Wrapper para adaptar bcryptjs à interface esperada
      const bcryptHash = async (data: string, saltOrRounds: string | number): Promise<string> => {
        if (typeof saltOrRounds === 'string') {
          // Se for string, assumir que é um salt gerado
          return await bcryptModule.hash(data, Number(saltOrRounds));
        } else {
          // Se for número, usar como rounds (número positivo)
          return await bcryptModule.hash(data, Math.abs(saltOrRounds as number));
        }
      };
      
      bcryptCache = {
        hash: bcryptHash,
        compare: bcryptModule.compare,
        isSecure: true,
        // Função para migrar senhas em texto plano para hash bcrypt
        migratePlaintext: async (plaintext: string) => {
          return await bcryptModule.hash(plaintext, 10); // Usar 10 rounds para produção
        }
      };
      
      return bcryptCache;
    } catch (testError) {
      console.error("[getBcrypt] Teste de bcrypt falhou:", testError);
      const msg = testError instanceof Error ? testError.message : String(testError);
      throw new Error(`Teste de bcrypt falhou: ${msg}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Bcrypt é obrigatório: sem fallback inseguro.
    throw new Error(`bcryptjs obrigatório e indisponível: ${msg}`);
  }
}

/** Retorna o vendedor do contexto (ctx.vendedor quando token "v:", senão busca por user). */
async function getVendedorFromContext(ctx: { user: { id: number; role: string } | null; vendedor?: db.Vendedor | null }) {
  if (ctx.vendedor) return ctx.vendedor;
  if (!ctx.user || ctx.user.role === "admin") return null;
  return (await db.getVendedorById(ctx.user.id)) ?? null;
}

function mapPedidoAccessError(e: unknown): never {
  if (e instanceof PedidoAccessError) {
    throw new TRPCError({
      code: e.code === "NOT_FOUND" ? "NOT_FOUND" : "FORBIDDEN",
      message: e.message,
    });
  }
  throw e;
}
import { notificarAdmin, notificarVendedor } from "./notifications.js";
import * as produtosRoutes from "./routes/produtos.js";
import * as clientesRoutes from "./routes/clientes.js";
import * as promocoesRoutes from "./routes/promocoes.js";

// Procedure apenas para admin
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado. Apenas administradores.' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  health: healthRouter,
  leo: leoRouter,
  api: router({
    clients: router({
      create: publicProcedure.mutation(() => ({ success: true, message: 'Clients API - Use /api/clients' })),
      list: publicProcedure.query(() => ({ success: true, message: 'Clients API - Use /api/clients' })),
      getById: publicProcedure.query(() => ({ success: true, message: 'Clients API - Use /api/clients' })),
      update: publicProcedure.mutation(() => ({ success: true, message: 'Clients API - Use /api/clients' })),
      delete: publicProcedure.mutation(() => ({ success: true, message: 'Clients API - Use /api/clients' }))
    }),
    orders: router({
      create: publicProcedure
        .input(z.object({ clientId: z.number().int().positive().optional() }).optional())
        .mutation(({ input }) => ({
          success: true,
          message: 'Orders API - Use /api/orders',
          ...(input?.clientId != null ? { clientId: input.clientId } : {}),
        })),
      list: publicProcedure
        .input(z.object({ clientId: z.number().int().positive().optional() }).optional())
        .query(({ input }) => ({
          success: true,
          message: 'Orders API - Use /api/orders',
          ...(input?.clientId != null ? { clientId: input.clientId } : {}),
        })),
      getById: publicProcedure.query(() => ({ success: true, message: 'Orders API - Use /api/orders' })),
      update: publicProcedure.mutation(() => ({ success: true, message: 'Orders API - Use /api/orders' })),
      delete: publicProcedure.mutation(() => ({ success: true, message: 'Orders API - Use /api/orders' }))
    }),
    payments: router({
      create: publicProcedure.mutation(() => ({ success: true, message: 'Payments API - Use /api/payments' })),
      list: publicProcedure.query(() => ({ success: true, message: 'Payments API - Use /api/payments' })),
      getById: publicProcedure.query(() => ({ success: true, message: 'Payments API - Use /api/payments' })),
      update: publicProcedure.mutation(() => ({ success: true, message: 'Payments API - Use /api/payments' })),
      delete: publicProcedure.mutation(() => ({ success: true, message: 'Payments API - Use /api/payments' }))
    })
  }),
  
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;
      const role = ctx.user.role === "admin" ? "admin" : "vendedor";
      return {
        id: ctx.user.id,
        openId: ctx.user.openId,
        name: ctx.user.name,
        email: ctx.user.email,
        role,
        loginMethod: ctx.user.loginMethod,
        vendedorId: ctx.vendedor?.id ?? undefined,
        isImpersonating: ctx.isImpersonating ?? false,
        vendedorNome: ctx.vendedor?.nome ?? undefined,
      };
    }),
    /**
     * Info mínima para depuração (não vaza token):
     * - user atual (se autenticado)
     * - origem efetiva (cookie/header/bearer/none) e tipo do token
     */
    sessionInfo: publicProcedure.query(({ ctx }) => {
      const user = ctx.user
        ? {
            id: ctx.user.id,
            openId: ctx.user.openId,
            name: ctx.user.name,
            email: ctx.user.email,
            role: ctx.user.role === "admin" ? "admin" : "vendedor",
            loginMethod: ctx.user.loginMethod,
            vendedorId: ctx.vendedor?.id,
          }
        : null;
      return { user, session: ctx.session };
    }),
    login: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const username = input.username.trim().toLowerCase();
        const password = input.password;
        const cookieOptions = { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS };
        const ip = ctx.req.ip || ctx.req.socket?.remoteAddress || "unknown";
        const rateLimitKey = `${ip}:${username}`;
        const audit = (success: boolean) =>
          logAuth({
            username,
            success,
            ip,
            timestamp: Date.now(),
          });

        try {
          await checkRateLimit(rateLimitKey);
        } catch (error) {
          audit(false);
          const message = error instanceof Error ? error.message : "Too many attempts";
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message,
          });
        }

        const user = await db.getUserByOpenId(username);
        if (!user) {
          audit(false);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário inválido" });
        }

        if (user.role === "admin" || user.openId === "admin") {
          const adminHash = process.env.ADMIN_PASSWORD_HASH;
          if (!adminHash) {
            audit(false);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ADMIN_PASSWORD_HASH não configurado" });
          }
          const bcrypt = await getBcrypt();
          const ok = await bcrypt.compare(password, adminHash);
          if (!ok) {
            audit(false);
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
          }
          const sessionValue = `u:${user.id}`;
          ctx.res.cookie(COOKIE_NAME, sessionValue, cookieOptions);
          ctx.res.cookie("session", sessionValue, cookieOptions);
          await db.touchLastSignedIn(user.id);
          clearRateLimitForKey(rateLimitKey);
          audit(true);
          if (process.env.NODE_ENV !== "production") console.log(`[auth.login] Cookie definido (admin)`);
          return {
            ok: true,
            sessionToken: sessionValue,
            openId: user.openId,
            name: user.name ?? "Administrador",
            role: "admin",
          };
        }

        const vendedor = await db.getVendedorByUserId(String((ctx as { tenantId?: string | number | null }).tenantId ?? ""), user.id);
        if (!vendedor) {
          audit(false);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Usuário sem vendedor vinculado. Peça ao admin para vincular.",
          });
        }
        if (vendedor.senha) {
          const bcrypt = await getBcrypt();
          if (vendedor.senha.startsWith("$2")) {
            try {
              const match = await bcrypt.compare(password, vendedor.senha);
              if (match) {
                const sessionValue = `v:${vendedor.id}`;
                ctx.res.cookie(COOKIE_NAME, sessionValue, cookieOptions);
                ctx.res.cookie("session", sessionValue, cookieOptions);
                await db.touchLastSignedIn(user.id);
                clearRateLimitForKey(rateLimitKey);
                audit(true);
                if (process.env.NODE_ENV !== "production") console.log(`[auth.login] Cookie definido (vendedor)`);
                return {
                  ok: true,
                  sessionToken: sessionValue,
                  openId: user.openId,
                  name: vendedor.nome ?? user.name ?? "Vendedor",
                  role: vendedor.admin ? "admin" : "vendedor",
                  vendedorId: vendedor.id,
                };
              }
            } catch (bcryptError) {
              console.error("[auth.login] Erro na verificação bcrypt:", bcryptError);
              audit(false);
            }
          } else {
            audit(false);
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Senha armazenada em formato inseguro. Redefina a senha do vendedor.",
            });
          }
        }

        audit(false);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      }),

    /** Admin only: troca sessão para vendedor (impersonate). Guarda token admin em cookie por 10 min. */
    impersonateVendedor: adminProcedure
      .input(z.object({ vendedorId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const vendedor = await db.getVendedorById(input.vendedorId);
        if (!vendedor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendedor não encontrado" });
        const cookieOptions = { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS };
        const currentToken = typeof ctx.req.headers.cookie === "string"
          ? (cookie.parse(ctx.req.headers.cookie)[COOKIE_NAME] as string | undefined)
          : undefined;
        if (currentToken) {
          const adminOpts = { ...getSessionCookieOptions(ctx.req), maxAge: ADMIN_SESSION_MAX_AGE_MS, path: "/" };
          ctx.res.cookie(ADMIN_SESSION_COOKIE, currentToken, adminOpts);
        }
        const sessionValue = `v:${vendedor.id}`;
        ctx.res.cookie(COOKIE_NAME, sessionValue, cookieOptions);
        ctx.res.cookie("session", sessionValue, cookieOptions);
        const traceId = nanoid(10);
        await db.insertAuditLog({
          actorUserId: ctx.user.id,
          actorVendedorId: null,
          action: "IMPERSONATE_START",
          entity: "vendedor",
          entityId: String(vendedor.id),
          payloadJson: JSON.stringify({ vendedorNome: vendedor.nome }),
          traceId,
        });
        return { ok: true, vendedorId: vendedor.id, vendedorNome: vendedor.nome ?? undefined };
      }),

    /** Restaura sessão admin a partir do cookie admin_session (só quando isImpersonating). */
    stopImpersonation: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.isImpersonating) throw new TRPCError({ code: "BAD_REQUEST", message: "Não está em modo impersonation." });
      const rawCookie = ctx.req.headers.cookie;
      const parsed = rawCookie ? cookie.parse(rawCookie) : {};
      const adminToken = parsed[ADMIN_SESSION_COOKIE] as string | undefined;
      if (!adminToken || typeof adminToken !== "string") throw new TRPCError({ code: "BAD_REQUEST", message: "Sessão admin não encontrada." });
      const cookieOptions = { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS };
      ctx.res.cookie(COOKIE_NAME, adminToken, cookieOptions);
      ctx.res.cookie("session", adminToken, cookieOptions);
      ctx.res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/", maxAge: 0, expires: new Date(0) });
      const adminUserId = adminToken.startsWith("u:") ? parseInt(adminToken.slice(2), 10) : null;
      const traceId = nanoid(10);
      await db.insertAuditLog({
        actorUserId: Number.isFinite(adminUserId) ? adminUserId : null,
        actorVendedorId: ctx.vendedor?.id ?? null,
        action: "IMPERSONATE_STOP",
        entity: "admin",
        entityId: adminUserId != null ? String(adminUserId) : null,
        payloadJson: JSON.stringify({ restoredFrom: "admin_session" }),
        traceId,
      });
      return { ok: true };
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      if (process.env.NODE_ENV !== "production") console.log("[auth.logout] Removendo cookies de sessão");
      // Limpar todos os possíveis cookies em todas as combinações de path/domain
      const cookieNames = [COOKIE_NAME, "session", "auth_token", ADMIN_SESSION_COOKIE];
      const domains = ["localhost", undefined];
      const paths = ["/", "/api", undefined];
      
      for (const name of cookieNames) {
        for (const domain of domains) {
          for (const path of paths) {
            ctx.res.clearCookie(name, { 
              ...cookieOptions,
              domain,
              path,
              maxAge: -1,
              expires: new Date(0)
            });
          }
        }
      }
      
      // Definir um header para indicar que o logout foi bem-sucedido
      ctx.res.setHeader("X-Logout-Success", "true");
      if (process.env.NODE_ENV !== "production") console.log("[auth.logout] Cookies de sessão removidos");
      return { 
        success: true,
        message: "Logout realizado com sucesso" 
      } as const;
    }),
  }),

  // ===== VENDEDORES =====
  vendedores: router({
    list: adminProcedure.query(async () => {
      return await db.getAllVendedores();
    }),
    create: adminProcedure
      .input(z.object({
        nome: z.string().min(1, "Nome é obrigatório"),
        email: z.string().email("Email inválido").optional().nullable(),
        telefone: z.string().optional().nullable(),
        senha: z.string().length(6, "Senha deve ter 6 dígitos").regex(/^\d{6}$/, "Senha deve ter exatamente 6 dígitos numéricos"),
        cidade: z.string().min(1, "Cidade é obrigatória"),
        admin: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verificar se o usuário é admin
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "Acesso negado. Apenas administradores podem cadastrar vendedores." 
          });
        }
        
        try {
          console.log("[vendedores.create] Iniciando criação de vendedor:", { 
            nome: input.nome,
            email: input.email,
            cidade: input.cidade,
            admin: input.admin
          });
          
          // Verificar se já existe um vendedor com o mesmo nome
          const existingVendedor = await db.getVendedorByNome(input.nome);
          if (existingVendedor) {
            console.error(`[vendedores.create] Já existe um vendedor com o nome: ${input.nome}`);
            throw new TRPCError({
              code: "CONFLICT",
              message: `Já existe um vendedor com o nome: ${input.nome}`
            });
          }
          
          // Hash da senha com bcrypt
          const bcrypt = await getBcrypt();
          let senhaHash = input.senha;
          
          // Verificar se bcrypt está disponível e funcionando
          if (bcrypt) {
            try {
              console.log("[vendedores.create] Usando bcrypt para hash da senha");
              senhaHash = await bcrypt.hash(input.senha, 10);
              console.log(`[vendedores.create] Hash gerado: ${senhaHash.substring(0, 20)}...`);
            } catch (error) {
              console.error("[vendedores.create] Erro ao gerar hash com bcrypt:", error);
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar hash de senha (bcrypt obrigatório)" });
            }
          } else {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "bcrypt indisponível (obrigatório)" });
          }
          
          // Normalizar opcionais: string vazia vira null (evita ER_DUP_ENTRY em email UNIQUE)
          const telefone = (input.telefone != null && typeof input.telefone === "string") ? input.telefone.trim() || null : null;
          const email = (input.email != null && typeof input.email === "string") ? input.email.trim() || null : null;
          const cidade = (input.cidade != null && typeof input.cidade === "string") ? input.cidade.trim() || null : null;

          const tenantId = await requireTenant(ctx);
          const data: Parameters<typeof db.createVendedor>[0] = {
            tenantId,
            nome: input.nome.trim().toUpperCase(),
            senha: senhaHash,
            admin: input.admin,
            ativo: true,
            telefone,
            email,
            cidade: cidade ? cidade.toUpperCase() : null,
          };

          // Criar vendedor
          const result = await db.createVendedor(data);
          console.log("[vendedores.create] Vendedor criado com sucesso:", result);
          
          // Verificar se o vendedor foi realmente criado
          if (result.id) {
            const createdVendedor = await db.getVendedorById(result.id);
            console.log("[vendedores.create] Verificação pós-criação:", createdVendedor ? {
              id: createdVendedor.id,
              nome: createdVendedor.nome,
              senhaInicia: createdVendedor.senha ? createdVendedor.senha.substring(0, 10) + '...' : 'null'
            } : 'não encontrado');
          }
          
          if (result?.id) {
            await db.insertAuditLog({
              actorUserId: ctx.user?.role === "admin" ? ctx.user.id : null,
              actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : null,
              action: "create",
              entity: "vendedor",
              entityId: result.id,
              payloadJson: JSON.stringify({ nome: input.nome }),
            });
          }
          return result;
        } catch (e) {
          const err = e as Error & { code?: string; errno?: number; sqlMessage?: string };
          const msg = err?.message ?? "Erro ao criar vendedor";
          const dbCode = err?.code ?? "";
          const dbSqlMessage = err?.sqlMessage ?? "";
          console.error("[vendedores.create] Erro err.code:", dbCode, "err.sqlMessage:", dbSqlMessage);
          const detail = [dbCode, dbSqlMessage].filter(Boolean).length ? ` (code: ${dbCode}, sqlMessage: ${dbSqlMessage})` : "";
          const messageToUser = msg + detail;
          
          // Retornar erro específico baseado no código de erro
          if (err?.code === 'ER_DUP_ENTRY') {
            // ER_DUP_ENTRY é fluxo normal de duplicidade, não logar como ERROR
            console.log("[vendedores.create] Duplicidade detectada (fluxo normal):", messageToUser);
            throw new TRPCError({ 
              code: "CONFLICT", 
              message: "Já existe um vendedor com este nome ou email" + detail 
            });
          }
          
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: messageToUser });
        }
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        email: z.string().email().optional(),
        telefone: z.string().optional(),
        senha: z.string().optional(),
        cidade: z.string().optional(),
        admin: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, senha, ...rest } = input;
        const bcrypt = await getBcrypt();
        let data: Partial<db.InsertVendedor> = rest as any;
        
        if (senha) {
          if (bcrypt) {
            try {
              data = { ...(rest as any), senha: await bcrypt.hash(senha, 10) };
            } catch (error) {
              console.error("[vendedores.update] Erro ao gerar hash com bcrypt:", error);
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar hash de senha (bcrypt obrigatório)" });
            }
          } else {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "bcrypt indisponível (obrigatório)" });
          }
        }
        const out = await db.updateVendedor(id, data);
        await db.insertAuditLog({
          actorUserId: ctx.user?.role === "admin" ? ctx.user.id : null,
          actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : null,
          action: "update",
          entity: "vendedor",
          entityId: id,
          payloadJson: JSON.stringify({ nome: input.nome ?? undefined }),
        });
        return out;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const out = await db.deleteVendedor(input.id);
        await db.insertAuditLog({
          actorUserId: ctx.user?.role === "admin" ? ctx.user.id : null,
          actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : null,
          action: "delete",
          entity: "vendedor",
          entityId: input.id,
        });
        return out;
      }),
    /** Vincula vendedor a um user (por openId). Cria user se não existir. Opcional: define senha do vendedor. */
    linkUser: adminProcedure
      .input(z.object({
        vendedorId: z.number(),
        openId: z.string().min(1, "openId (usuário de login) é obrigatório"),
        password: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const vendedor = await db.getVendedorById(input.vendedorId);
        if (!vendedor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendedor não encontrado" });
        const tenantId = await requireTenant(ctx);
        const user = await db.findOrCreateUserByOpenId(tenantId, input.openId.trim().toLowerCase(), vendedor.nome);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar/buscar usuário" });
        await db.updateVendedor(input.vendedorId, { userId: user.id });
        if (input.password != null && input.password !== "") {
          const bcrypt = await getBcrypt();
          if (!bcrypt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "bcrypt indisponível (obrigatório)" });
          const hashed = await bcrypt.hash(input.password, 10);
          await db.updateVendedorSenha(input.vendedorId, hashed);
        }
        await db.insertAuditLog({
          actorUserId: ctx.user?.id ?? null,
          actorVendedorId: null,
          action: "update",
          entity: "vendedor",
          entityId: input.vendedorId,
          payloadJson: JSON.stringify({ linkUser: user.id, openId: input.openId }),
        });
        return { ok: true, userId: user.id, vendedorId: input.vendedorId };
      }),
  }),

  // ===== PRODUTOS =====
  produtos: router({
    /** Estoque global: mesmo resultado para admin e vendedor (sem filtro por ctx.vendedor). */
    list: protectedProcedure
      .input(z.object({
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(100).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const page = input?.page ?? 1;
        const pageSize = Math.min(input?.pageSize ?? 50, 100);
        const { items, total } = await db.getProdutosComPrecoVigentePaged(tenantId, {
          page,
          pageSize,
          refDate: new Date(),
        });
        return {
          items,
          total,
          page,
          pageSize,
          hasMore: page * pageSize < total,
        };
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.getProdutoById(tenantId, input.id);
      }),

    create: adminProcedure
      .input(z.any())
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        // Validação real fica em server/routes/produtos.ts (Zod)
        return await produtosRoutes.createProduto({ body: input, tenantId } as any);
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        version: z.number().optional(),
        descricao: z.string().min(1, "Descrição é obrigatória"),
        marca: z.string().optional().nullable(),
        valorVenda: z.number().min(0, "Valor de venda não pode ser negativo"),
        custo: z.number().min(0, "Custo não pode ser negativo"),
        estoque: z.preprocess(
          (v) => (v === "" || v == null ? 0 : typeof v === "string" ? Number(v) : v),
          z.number().int().min(0).refine((n) => !Number.isNaN(n), { message: "Estoque inválido" })
        ),
        prazoGarantia: z.number().int("Prazo de garantia deve ser um número inteiro").min(0, "Prazo de garantia não pode ser negativo"),
        ativo: z.boolean().optional(),
        grupoId: z.number().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, version, ...data } = input;
        
        try {
          // Usar a função updateProduto com verificação de versão
          const patch: any = {
            ...data,
            custo: Number(data.custo).toFixed(2),
            valorVenda: Number(data.valorVenda).toFixed(2),
          };
          const tenantId = await requireTenant(ctx);
          return await db.updateProduto(tenantId, id, patch, version);
        } catch (error) {
          if (error instanceof Error && error.message.includes("modificado por outro usuário")) {
            throw new TRPCError({ 
              code: 'CONFLICT',
              message: error.message
            });
          }
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Erro ao atualizar produto'
          });
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await produtosRoutes.deleteProduto({ params: { id: input.id.toString() }, tenantId } as any);
      }),

    buscar: protectedProcedure
      .input(
        z.object({
          query: z.string().optional(),
          page: z.number().min(1).optional(),
          pageSize: z.number().min(1).max(100).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const q = (input.query ?? "").trim();
        const page = input.page ?? 1;
        const pageSize = Math.min(input.pageSize ?? 50, 100);
        const { items, total } = await db.getProdutosComPrecoVigentePaged(tenantId, {
          page,
          pageSize,
          query: q || undefined,
          refDate: new Date(),
        });
        return { produtos: items, total, page, pageSize };
      }),

    atualizarEstoque: adminProcedure
      .input(z.object({
        id: z.number(),
        quantidade: z.preprocess(
          (v) => (v === "" || v == null ? 0 : typeof v === "string" ? Number(v) : v),
          z.number().int().min(1).refine((n) => !Number.isNaN(n), { message: "Quantidade inválida" })
        ),
        tipo: z.enum(['entrada', 'saida'])
      }))
      .mutation(async ({ input, ctx }) => {
        const traceId = nanoid(10);
        const qtd = input.tipo === "entrada" ? input.quantidade : -input.quantidade;
        const vendedor = await getVendedorFromContext(ctx);
        const audit = {
          actorUserId: ctx.user?.role === "admin" ? ctx.user.id : undefined,
          actorVendedorId: ctx.user?.role !== "admin" && vendedor ? vendedor.id : undefined,
          traceId,
          motivo: "atualizarEstoque",
        };
        try {
          const tenantId = await requireTenant(ctx);
          await db.updateEstoqueProduto(tenantId, input.id, qtd, audit);
          return { message: "Estoque atualizado" };
        } catch (e: any) {
          if (e?.code === "ESTOQUE_NEGATIVO" || e?.code === "ESTOQUE_INSUFICIENTE") {
            throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Estoque insuficiente para esta operação." });
          }
          throw e;
        }
      }),

    estoqueBaixo: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await produtosRoutes.verificarEstoqueBaixo({ tenantId } as any);
    }),
  }),

  // ===== PROMOÇÕES =====
  promocoes: router({
    list: protectedProcedure.query(async () => {
      return await promocoesRoutes.listar({} as any);
    }),
    detalhes: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await promocoesRoutes.detalhes({ params: { id: String(input.id) } } as any);
      }),
    create: adminProcedure
      .input(z.any())
      .mutation(async ({ input }) => {
        return await promocoesRoutes.criar({ body: input } as any);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), data: z.any() }))
      .mutation(async ({ input }) => {
        return await promocoesRoutes.atualizar({ params: { id: String(input.id) }, body: input.data } as any);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await promocoesRoutes.remover({ params: { id: String(input.id) } } as any);
      }),
  }),

  // ===== NOTA DE ENTRADA =====
  notasEntrada: router({
    create: adminProcedure
      .input(z.object({
        marca: z.string().min(1),
        dataChegada: z.string(),
        valorTotal: z.number().positive(),
        formaPagamento: z.enum(['PIX','DINHEIRO','BOLETO','CHEQUE','CARTAO']),
        observacao: z.string().optional(),
        parcelas: z.array(z.object({
          parcela: z.number().int().min(1),
          valor: z.number().positive(),
          dataVencimento: z.string(),
        })).optional(),
        itens: z.array(z.object({
          produtoId: z.number(),
          quantidade: z.number().int().positive(),
          custoUnit: z.number().positive().optional(),
        })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        await db.criarNotaEntrada(tenantId, {
          tenantId,
          marca: input.marca,
          dataChegada: new Date(input.dataChegada),
          valorTotal: input.valorTotal,
          formaPagamento: input.formaPagamento,
          observacao: input.observacao,
          parcelas: input.parcelas?.map(p => ({ ...p, dataVencimento: new Date(p.dataVencimento) })),
          itens: input.itens,
          createdBy: (ctx.user as any)?.id,
        });
        return { ok: true };
      }),
  }),

  // ===== CORES =====
  cores: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await db.getAllCores(tenantId);
    }),
    create: adminProcedure
      .input(z.object({ nome: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.createCor(tenantId, input);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), nome: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        await db.updateCor(tenantId, input.id, { nome: input.nome });
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        await db.deleteCor(tenantId, input.id);
        return { ok: true as const };
      }),
  }),

  // ===== GRUPOS =====
  gruposPrecificacao: router({
    list: protectedProcedure.query(async () => {
      const db_conn = await db.getDb();
      if (!db_conn) return [];
      return await db_conn.select().from(db.gruposPrecificacao);
    }),
    create: adminProcedure
      .input(z.object({ nome: z.string().min(1), idempotencyKey: z.string().max(64).optional() }))
      .mutation(async ({ input }) => {
        const { idempotencyKey, ...data } = input;
        const result = await executeCommand(
          { commandName: "gruposPrecificacao.create", idempotencyKey: idempotencyKey ?? undefined },
          async (tx) => {
            const res = await (tx as any).insert(db.gruposPrecificacao).values(data);
            const id = (res as any)?.[0]?.insertId ?? (res as any)?.insertId;
            return { ...commandResult(true, ["Grupo criado"]), id };
          }
        );
        if (isInProgress(result)) return result;
        return result;
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          nome: z.string().min(1),
          descontoFabrica: z.number().optional(),
          ipi: z.number().optional(),
          frete: z.number().optional(),
          montagem: z.number().optional(),
          lucro: z.number().optional(),
          comissao: z.number().optional(),
          jurosCartao: z.number().optional(),
          prazoGarantia: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const tenantId = await requireTenant(ctx);
        await db.updateGrupoPrecificacao(tenantId, id, data);
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        await db.deleteGrupoPrecificacao(tenantId, input.id);
        return { ok: true as const };
      }),
  }),

  // ===== AJUSTE RÁPIDO DE ESTOQUE (admin) =====
  ajusteEstoque: router({
    rapido: adminProcedure
      .input(
        z.object({
          produtoId: z.number().min(1),
          quantidade: z.preprocess(
            (v) => (v === "" || v == null ? 0 : typeof v === "string" ? Number(v) : v),
            z.number().int().min(1).refine((n) => !Number.isNaN(n), { message: "Quantidade inválida" })
          ),
          tipo: z.enum(["entrada", "saida"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const traceId = nanoid(10);
        const tenantId = await requireTenant(ctx);
        const out = await db.ajusteRapidoEstoque(
          tenantId,
          input.produtoId,
          input.quantidade,
          input.tipo,
          {
            actorUserId: ctx.user.id,
            traceId,
            motivo: "ajuste_rapido",
          }
        );
        return { ...out, traceId };
      }),
  }),

  // ===== CLIENTES =====
  clientes: router({
    list: protectedProcedure
      .use(requireRole("admin", "operador"))
      .input(z.object({
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(100).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const page = input?.page ?? 1;
        const pageSize = Math.min(input?.pageSize ?? 50, 100);
        const { items, total } = await cachedClientes.listClientes(tenantId, actor, {
          page,
          pageSize,
        });
        return {
          items,
          total,
          page,
          pageSize,
          hasMore: page * pageSize < total,
        };
      }),
    
    search: protectedProcedure
      .input(z.object({ term: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        if (ctx.user.role === "admin") return await db.searchClientes(tenantId, input.term);
        const vendedor = await getVendedorFromContext(ctx);
        if (!vendedor) return [];
        return await db.searchClientesByVendedor(tenantId, input.term, vendedor.id);
      }),
    
    create: protectedProcedure
      .use(requireRole("admin", "operador"))
      .input(z.object({
        nome: z.string().min(1, "Informe o nome"),
        telefone: z.string().min(1, "Informe o telefone"),
        telefoneRecado: z.string().optional(),
        cpf: z.string().optional(),
        cep: z.string().optional(),
        rua: z.string().optional(),
        numero: z.string().optional(),
        bairro: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
        referencia: z.string().optional(),
        condominio: z.string().optional(),
        bloco: z.string().optional(),
        apartamento: z.string().optional(),
        vendedorIdPrincipal: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const user = ctx.user;
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão necessária." });
        }
        const vendedorId = user.role === "admin"
          ? input.vendedorIdPrincipal
          : (await getVendedorFromContext(ctx))?.id;
        const created = await db.createCliente(tenantId, input, vendedorId);
        const cid = (created as { id?: number })?.id;
        if (cid != null) {
          await auditEntityChange(ctx, tenantId, "create", "cliente", cid, {
            nome: input.nome,
            telefone: input.telefone,
          });
        }
        return created;
      }),

    buscaGlobal: protectedProcedure
      .input(z.object({ term: z.string(), limit: z.number().min(1).max(100).optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        return await db.searchClientesGlobal(tenantId, input.term, input.limit ?? 50, actor);
      }),

    getVendedorPrincipal: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.getVendedorPrincipalDoCliente(tenantId, input.clienteId);
      }),

    vinculate: protectedProcedure
      .input(z.object({ clienteId: z.number(), tipo: z.enum(["PRINCIPAL", "SECUNDARIO"]).optional() }))
      .mutation(async ({ input, ctx }) => {
        const vendedor = await getVendedorFromContext(ctx);
        if (!vendedor) throw new TRPCError({ code: "BAD_REQUEST", message: "Vendedor não identificado." });
        const tenantId = await requireTenant(ctx);
        await db.createClienteVinculo(tenantId, input.clienteId, vendedor.id, input.tipo ?? "SECUNDARIO");
        return { ok: true };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1, "Informe o nome").optional(),
        telefone: z.string().min(1, "Informe o telefone").optional(),
        telefoneRecado: z.string().optional(),
        cpf: z.string().optional(),
        cep: z.string().optional(),
        rua: z.string().optional(),
        numero: z.string().optional(),
        bairro: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
        referencia: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        await assertOwnership(ctx, "cliente", input.id);
        const actor = await resolveServiceActor(ctx);
        const { id, ...data } = input;
        const out = await db.updateCliente(tenantId, actor, id, data);
        await auditEntityChange(ctx, tenantId, "update", "cliente", id, {
          nome: input.nome,
          telefone: input.telefone,
        });
        return out;
      }),
    // Exclusão real (SQL) + reaproveitamento do número do cliente via counters.
    // Mantemos só esse caminho para evitar divergência/"mock" no futuro.
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const out = await db.deleteClienteById(tenantId, actor, input.id);
        await auditEntityChange(ctx, tenantId, "delete", "cliente", input.id, {});
        return out;
      }),

  }),

  // ===== PEDIDOS =====
  pedidos: router({
    // ===== MEUS PEDIDOS (SQL) =====
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['TODOS','GERADO','CONFERIDO','IMPRESSO','EM_ROTA','ENTREGUE','CANCELADO','PENDENTE_ESTOQUE']).optional(),
        busca: z.string().optional(),
        clienteId: z.number().min(1).optional(),
        clientId: z.number().min(1).optional(),
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(100).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        return await listPedidosTrpcPage(tenantId, actor, input);
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const row = await getPedidoWithItensForActor(tenantId, actor, input.id);
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        }
        return { ...row.pedido, itens: row.itens };
      }),

    getItens: protectedProcedure
      .input(z.object({ pedidoId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const pedido = await getPedidoByIdForActor(tenantId, actor, input.pedidoId);
        if (!pedido) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        }
        return await getItensPedido(tenantId, pedido.id);
      }),

    create: protectedProcedure
      .input(z.object({
        clienteId: z.number().int().positive(),
        desconto: z.number().min(0).optional().default(0),
        frete: z.number().min(0).optional().default(0),
        formaPagamento: z.string().optional(),
        observacoes: z.string().optional(),
        vendedorIdAlvo: z.number().int().positive().optional(),
        itens: z.array(z.object({
          tipo: z.enum(["CATALOGO", "LIVRE"]),
          produtoId: z.number().int().positive().optional(),
          descricao: z.string().min(1),
          quantidade: z.number().int().positive(),
          valorUnitario: z.number().min(0),
          custo: z.number().min(0).optional().default(0),
          marca: z.string().optional(),
          corId: z.number().optional().nullable(),
          corNome: z.string().optional().nullable(),
          prazoGarantia: z.number().optional(),
          isPremio: z.boolean().optional(),
        })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const trustedVendedorId =
          ctx.user.role === "admin" ? input.vendedorIdAlvo ?? ctx.vendedor?.id : undefined;
        if (ctx.user.role === "admin" && (trustedVendedorId == null || trustedVendedorId <= 0)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Admin: informe vendedorIdAlvo ou use impersonação de vendedor.",
          });
        }

        const subtotal = input.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
        const total = subtotal - input.desconto + input.frete;

        const safeInput: Parameters<typeof createPedidoSafe>[1] = {
          vendedorId: 0,
          clienteId: input.clienteId,
          subtotal: String(subtotal),
          desconto: String(input.desconto),
          frete: String(input.frete),
          total: String(total),
          formaPagamento: input.formaPagamento ?? null,
          observacoes: input.observacoes ?? null,
          itens: input.itens.map((i) => ({
            tipo: i.tipo,
            produtoId: i.produtoId,
            descricao: i.descricao,
            quantidade: i.quantidade,
            valorUnitario: i.valorUnitario,
            custo: i.custo,
            marca: i.marca ?? null,
            corId: i.corId ?? null,
            corNome: i.corNome ?? null,
            prazoGarantia: i.prazoGarantia ?? 90,
            isPremio: i.isPremio,
          })),
        };

        try {
          return await createPedidoSafe(tenantId, safeInput, actor, trustedVendedorId);
        } catch (e) {
          if (e instanceof PedidoAccessError) {
            throw new TRPCError({
              code: e.code === "NOT_FOUND" ? "NOT_FOUND" : "FORBIDDEN",
              message: e.message,
            });
          }
          if (e instanceof Error && e.message.includes("vendedor do pedido (admin)")) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
          throw e;
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        observacoes: z.string().optional().nullable(),
        formaPagamento: z.string().optional().nullable(),
        status: z.enum(["GERADO", "CONFERIDO", "IMPRESSO", "EM_ROTA", "ENTREGUE", "CANCELADO", "PENDENTE_ESTOQUE"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        const { id, ...patch } = input;
        const data: Record<string, unknown> = {};
        if (patch.observacoes !== undefined) data.observacoes = patch.observacoes;
        if (patch.formaPagamento !== undefined) data.formaPagamento = patch.formaPagamento;
        if (patch.status !== undefined) data.status = patch.status;
        try {
          return await db.updatePedido(tenantId, actor, id, data);
        } catch (e) {
          mapPedidoAccessError(e);
          throw e;
        }
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        try {
          return await db.deletePedido(tenantId, actor, input.id);
        } catch (e) {
          if (e instanceof Error && e.message.includes("ENTREGUE")) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
          }
          mapPedidoAccessError(e);
          throw e;
        }
      }),

    buscar: protectedProcedure
      .input(z.object({ query: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const db_conn = await db.getDb();
        if (!db_conn) return { pedidos: [], total: 0 };
        const tenantId = await requireTenant(ctx);
        const filters: SQL[] = [db.eq(db.pedidos.tenantId, tenantId)];
        if (ctx.user.role !== "admin") {
          let ownerUid: number;
          try {
            ownerUid = await resolveOwnerUserId(ctx);
          } catch {
            return { pedidos: [], total: 0 };
          }
          // Validar via clienteVendedores
          const db_conn = await db.getDb();
          if (!db_conn) return { pedidos: [], total: 0 };
          
          const clienteVendedorSubquery = db_conn.select({ clienteId: db.clienteVendedores.clienteId })
            .from(db.clienteVendedores)
            .where(db.and(
              db.eq(db.clienteVendedores.vendedorId, ownerUid)
            ));
          filters.push(db.inArray(db.pedidos.clienteId, clienteVendedorSubquery));
        }
        if (input.query?.trim()) {
          const term = `%${input.query.trim()}%`;
          const buscaOr = db.or(
            db.sql`LOWER(${db.pedidos.clienteNome}) LIKE LOWER(${term})`,
            db.sql`${db.pedidos.numero} LIKE ${term}`
          );
          if (buscaOr) filters.push(buscaOr);
        }
        const whereSql: SQL | undefined =
          filters.length === 0
            ? undefined
            : filters.length === 1
              ? (filters[0] ?? undefined)
              : db.and(...filters);
        const base = db_conn
          .select({
            id: db.pedidos.id,
            numero: db.pedidos.numero,
            clienteNome: db.pedidos.clienteNome,
            clienteCidade: db.pedidos.clienteCidade,
            clienteUf: db.pedidos.clienteUf,
            vendedorId: db.pedidos.vendedorId,
            vendedorNome: db.vendedores.nome,
            total: db.pedidos.total,
            status: db.pedidos.status,
            formaPagamento: db.pedidos.formaPagamento,
            createdAt: db.pedidos.createdAt,
            dataEntrega: db.pedidos.dataEntrega,
          })
          .from(db.pedidos)
          .innerJoin(db.clientes, db.eq(db.pedidos.clienteId, db.clientes.id))
          .innerJoin(db.vendedores, db.eq(db.pedidos.vendedorId, db.vendedores.id));
        const rows = await (whereSql === undefined ? base : base.where(whereSql)).orderBy(
          db.desc(db.pedidos.createdAt)
        );
        return { pedidos: rows, total: rows.length };
      }),

    /** Pedidos aptos a formar carga (status GERADO no serviço de logística). */
    listParaCarga: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      let filtrosCarga: { clienteOwnerUserId?: number } | { vendedorId?: number } = {};
      if (ctx.user.role !== "admin") {
        try {
          filtrosCarga = { clienteOwnerUserId: await resolveOwnerUserId(ctx) };
        } catch {
          return { success: true as const, data: [], items: [], total: 0 };
        }
      }
      const page = await logisticaService.getPedidosParaCarga(
        tenantId,
        filtrosCarga,
        { page: 1, pageSize: 200 }
      );
      return {
        success: true as const,
        data: page.items,
        items: page.items,
        total: page.total,
      };
    }),

    listConferencia: protectedProcedure
      .input(
        z
          .object({
            status: z.enum(["TODOS", "GERADO", "CONFERIDO"]).optional(),
            busca: z.string().optional(),
            dataInicio: z.date().optional(),
            dataFim: z.date().optional(),
            somenteNaoConferidos: z.boolean().optional(),
            page: z.number().min(1).optional(),
            pageSize: z.number().min(1).max(200).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const db_conn = await db.getDb();
        if (!db_conn) return { items: [] as const, total: 0, page: 1, pageSize: 80, hasMore: false };
        const tenantId = await requireTenant(ctx);
        const filters: SQL[] = [db.eq(db.pedidos.tenantId, tenantId)];
        if (ctx.user.role !== "admin") {
          let ownerUid: number;
          try {
            ownerUid = await resolveOwnerUserId(ctx);
          } catch {
            return { items: [], total: 0, page: 1, pageSize: 80, hasMore: false };
          }
          // Validar via clienteVendedores
          const db_conn = await db.getDb();
          if (!db_conn) return { pedidos: [], total: 0 };
          
          const clienteVendedorSubquery = db_conn.select({ clienteId: db.clienteVendedores.clienteId })
            .from(db.clienteVendedores)
            .where(db.and(
              db.eq(db.clienteVendedores.vendedorId, ownerUid)
            ));
          filters.push(db.inArray(db.clientes.id, clienteVendedorSubquery));
        }
        const tab = input?.status ?? "TODOS";
        if (tab === "GERADO") {
          filters.push(db.eq(db.pedidos.status, "GERADO"));
        } else if (tab === "CONFERIDO") {
          filters.push(db.eq(db.pedidos.status, "CONFERIDO"));
        } else {
          filters.push(db.inArray(db.pedidos.status, ["GERADO", "CONFERIDO"]));
        }
        if (input?.somenteNaoConferidos) {
          filters.push(db.eq(db.pedidos.status, "GERADO"));
        }
        if (input?.busca?.trim()) {
          const term = `%${input.busca.trim()}%`;
          const buscaOr = db.or(
            db.sql`LOWER(${db.pedidos.clienteNome}) LIKE LOWER(${term})`,
            db.sql`${db.pedidos.numero} LIKE ${term}`
          );
          if (buscaOr) filters.push(buscaOr);
        }
        if (input?.dataInicio) {
          filters.push(db.sql`${db.pedidos.createdAt} >= ${input.dataInicio}`);
        }
        if (input?.dataFim) {
          const end = new Date(input.dataFim);
          end.setHours(23, 59, 59, 999);
          filters.push(db.sql`${db.pedidos.createdAt} <= ${end}`);
        }
        const whereSql: SQL | undefined =
          filters.length === 0
            ? undefined
            : filters.length === 1
              ? (filters[0] ?? undefined)
              : db.and(...filters);
        const page = input?.page ?? 1;
        const pageSize = Math.min(input?.pageSize ?? 80, 200);
        const sel = {
          id: db.pedidos.id,
          numero: db.pedidos.numero,
          clienteNome: db.pedidos.clienteNome,
          status: db.pedidos.status,
          createdAt: db.pedidos.createdAt,
        };
        const listBase = db_conn
          .select(sel)
          .from(db.pedidos)
          .innerJoin(db.clientes, db.eq(db.pedidos.clienteId, db.clientes.id))
          .innerJoin(db.vendedores, db.eq(db.pedidos.vendedorId, db.vendedores.id));
        const listFiltered = whereSql === undefined ? listBase : listBase.where(whereSql);
        const rows = await listFiltered
          .orderBy(db.desc(db.pedidos.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize);
        const items = rows.map((r) => ({
          ...r,
          conferido: r.status === "CONFERIDO",
        }));
        return { items, total: items.length, page, pageSize, hasMore: false };
      }),

    marcarConferido: protectedProcedure
      .input(z.object({ id: z.number(), idempotencyKey: z.string().max(64).optional() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.id);
        const pedido = await db.getPedidoById(input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        if (pedido.status === "CONFERIDO") {
          return { ok: true as const, already: true as const };
        }
        if (pedido.status !== "GERADO") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas pedidos em GERADO podem ser conferidos.",
          });
        }
        const result = await executeCommand(
          { commandName: "pedidos.marcarConferido", idempotencyKey: input.idempotencyKey },
          async (tx) => {
            await tx.update(db.pedidos).set({ status: "CONFERIDO" }).where(db.eq(db.pedidos.id, input.id));
            return { ...commandResult(true, ["Conferido"]), success: true };
          }
        );
        if (isInProgress(result)) return result;
        return { ok: true as const, already: false as const };
      }),

    // Atualiza status (fluxo de pedidos do GRS)
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['GERADO','IMPRESSO','EM_ROTA','ENTREGUE','CANCELADO']),
        idempotencyKey: z.string().max(64).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.id);
        const pedido = await db.getPedidoById(String((ctx as { tenantId?: string | number | null }).tenantId ?? ""), input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        const atual = pedido.status as any;
        const proximo = input.status as any;
        if (atual === 'ENTREGUE' && proximo !== 'ENTREGUE') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pedido ENTREGUE não pode voltar status.' });
        }
        if (atual === 'CANCELADO' && proximo !== 'CANCELADO') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pedido CANCELADO não pode voltar status.' });
        }
        if (proximo === 'IMPRESSO' && atual !== 'GERADO' && atual !== 'IMPRESSO') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'IMPRESSO só pode vir de GERADO.' });
        }
        if (proximo === 'EM_ROTA' && atual !== 'IMPRESSO' && atual !== 'EM_ROTA') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'EM_ROTA só pode vir de IMPRESSO.' });
        }
        const result = await executeCommand(
          { commandName: "pedidos.updateStatus", idempotencyKey: input.idempotencyKey ?? undefined },
          async (tx) => {
            await (tx as any).update(db.pedidos).set({ status: proximo }).where(db.eq(db.pedidos.id, input.id));
            return { ...commandResult(true, ["Status atualizado"]), success: true };
          }
        );
        if (isInProgress(result)) return result;
        return { success: true };
      }),

    // PDF do Pedido (para imprimir e o motorista ver o pagamento combinado)
    gerarPDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.id);
        return await pdf.gerarPedidoPDF(input.id);
      }),

    // Marcar como entregue (sem CARGA): baixa financeiro + comissão + caixa
    marcarEntregue: protectedProcedure
      .input(z.object({
        id: z.number(),
        entradaForma: z.enum(['PIX','BOLETO','CARTAO','DINHEIRO']),
        entradaValor: z.number().optional(),
        segundaForma: z.enum(['PIX','CARTAO','DINHEIRO']).optional(),
        segundaValor: z.number().optional(),
        boletoParcelas: z.number().optional(),
        boletoVencimentos: z.array(z.date()).optional(),
        boletoPrimeiroVencimento: z.date().optional(),
        idempotencyKey: z.string().max(64).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.id);
        const pedido = await db.getPedidoById(String((ctx as { tenantId?: string | number | null }).tenantId ?? ""), input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        try {
          const actor = await resolveServiceActor(ctx);
          const result = await executeCommand(
            { commandName: "baixarPedidoDireto", idempotencyKey: input.idempotencyKey },
            async (tx) => {
              const tenantId = await requireTenant(ctx);
              const out = await db.baixarPedidoDireto(
                tenantId,
                input.id,
                {
                  entradaForma: input.entradaForma,
                  entradaValor: input.entradaValor,
                  segundaForma: input.segundaForma,
                  segundaValor: input.segundaValor,
                  boletoParcelas: input.boletoParcelas,
                  boletoVencimentos: (input as any).boletoVencimentos,
                  boletoPrimeiroVencimento: input.boletoPrimeiroVencimento,
                },
                actor
              );
              return { ok: true, traceId: nanoid(10), ...out };
            }
          );
          if (isInProgress(result)) return result;

          await db.insertAuditLog({
            actorUserId: ctx.user?.role === "admin" ? ctx.user.id : null,
            actorVendedorId: ctx.user?.role !== "admin" ? (await getVendedorFromContext(ctx))?.id : null,
            action: "BAIXA",
            entity: "pedido",
            entityId: String(input.id),
            payloadJson: JSON.stringify({ pedidoNumero: result.pedidoNumero }),
          });

          if (result.boletoIds?.length) {
            const zip = await pdf.gerarZipBoletos({
              boletoIds: result.boletoIds,
              pedidoNumero: result.pedidoNumero,
              clienteNome: result.clienteNome,
            });
            return { success: true, boletosZip: zip };
          }
          return { success: true };
        } catch (e) {
          throw e;
        }
      }),

    // ===== NOVA VENDA (CARDS) =====
    // Fluxo: usuário lança o pedido; se o cliente não existir ainda, cria automaticamente.
    // O código do cliente é o próprio ID (4 dígitos no frontend) com reaproveitamento via counters.
    createVenda: protectedProcedure
      .input(z.object({
        // Admin sem impersonation: obrigatório. Impersonando ou vendedor: ignorado (usa ctx).
        vendedorId: z.number().int().positive().optional(),
        // Cliente existente ou novo
        clienteId: z.number().optional(),
        cliente: z.object({
          nome: z.string().min(1, "Nome do cliente é obrigatório"),
          telefone: z.string().optional().nullable(),
          telefoneRecado: z.string().optional().nullable(),
          rua: z.string().optional().nullable(),
          numero: z.string().optional().nullable(),
          bairro: z.string().optional().nullable(),
          cidade: z.string().optional().nullable(),
          uf: z.string().optional().nullable(),
          referencia: z.string().optional().nullable(),
          condominio: z.string().optional().nullable(),
          bloco: z.string().optional().nullable(),
          apartamento: z.string().optional().nullable(),
        }),
        // Valores financeiros com validação rigorosa
        subtotal: z.number()
          .min(0, "Subtotal não pode ser negativo")
          .refine(val => Number(val.toFixed(2)) === val, "Subtotal deve ter no máximo 2 casas decimais"),
        desconto: z.number()
          .min(0, "Desconto não pode ser negativo")
          .refine(val => Number(val.toFixed(2)) === val, "Desconto deve ter no máximo 2 casas decimais"),
        frete: z.number()
          .min(0, "Frete não pode ser negativo")
          .refine(val => Number(val.toFixed(2)) === val, "Frete deve ter no máximo 2 casas decimais"),
        total: z.number()
          .min(0.01, "Total deve ser maior que zero")
          .refine(val => Number(val.toFixed(2)) === val, "Total deve ter no máximo 2 casas decimais"),
        // Pagamento (multi - operacional). Pode marcar 1 ou 2 opções.
        // Salvo em pedidos.formaPagamento como JSON.
        pagamentos: z.array(z.object({
          tipo: z.enum(['PIX','DINHEIRO','CARTAO','BOLETO','A_DEFINIR']),
          valor: z.number().min(0, "Valor não pode ser negativo").optional(),
        })).optional(),
        // Pagamento combinado (planejamento). Vai impresso no pedido para o motorista.
        // Importante: aqui é o "combinado" (o que o vendedor acertou com o cliente),
        // não é a baixa financeira. Na entrega, o usuário confirma/ajusta.
        // Regras:
        // - BOLETO (único): sempre informa parcelas (+ opcional 1º vencimento)
        // - CARTAO (único): não precisa de parcelas
        // - 2 formas SEM escolher a forma da entrada: apenas "entrada" (valor) + restante no BOLETO (parcelas) OU no CARTAO
        pagamentoCombinado: z.object({
          tipo: z.enum(['BOLETO', 'CARTAO', 'ENTRADA_BOLETO', 'ENTRADA_CARTAO']),
          entradaValor: z.number().min(0, "Valor de entrada não pode ser negativo").optional(),
          boletoParcelas: z.number().min(1, "Número de parcelas deve ser pelo menos 1").optional(),
          boletoVencimentos: z.array(z.date()).optional(),
          boletoPrimeiroVencimento: z.date().optional(),
        }).optional(),
        observacoes: z.string().optional().nullable(),
        // Itens do pedido com validação rigorosa
        itens: z.array(z.object({
          tipo: z.enum(['LIVRE', 'CATALOGO']),
          produtoId: z.number().optional().nullable()
            .refine(
              (val) => val === null || val === undefined || val > 0, 
              "ID do produto deve ser um número positivo"
            ),
          corId: z.number().optional().nullable()
            .refine(
              (val) => val === null || val === undefined || val > 0, 
              "ID da cor deve ser um número positivo"
            ),
          corNome: z.string().optional().nullable(),
          descricao: z.string().min(1, "Descrição do item é obrigatória"),
          marca: z.string().optional().nullable(),
          quantidade: z.number()
            .int("Quantidade deve ser um número inteiro")
            .min(1, "Quantidade deve ser pelo menos 1"),
          valorUnitario: z.number()
            .min(0, "Valor unitário não pode ser negativo")
            .refine(val => Number(val.toFixed(2)) === val, "Valor unitário deve ter no máximo 2 casas decimais"),
          custo: z.number()
            .min(0, "Custo não pode ser negativo")
            .refine(val => Number(val.toFixed(2)) === val, "Custo deve ter no máximo 2 casas decimais"),
          prazoGarantia: z.number()
            .int("Prazo de garantia deve ser um número inteiro")
            .min(0, "Prazo de garantia não pode ser negativo"),
          isPremio: z.boolean().optional(),
        }))
        .min(1, "Pedido deve ter pelo menos um item")
        // Validação adicional: verificar se o total bate com a soma dos itens
        .refine(
          (items) => items.every(item => 
            Number((item.quantidade * item.valorUnitario).toFixed(2)) === 
            Number((item.quantidade * item.valorUnitario).toFixed(2))
          ),
          "Valores dos itens devem ter no máximo 2 casas decimais"
        ),
        idempotencyKey: z.string().max(64).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const createVendaStarted = Date.now();
        const perfPhases: Record<string, number> | undefined =
          process.env.CREATE_VENDA_PERF_LOG === "1" ? {} : undefined;
        const markPhase = (key: string, since: number) => {
          if (perfPhases) perfPhases[key] = Date.now() - since;
        };
        try {
          // ⚙️ CONTROLE DE CONCORRÊNCIA - INÍCIO
          // 1️⃣ Gerar idempotencyKey automaticamente se não vier
          const idempotencyKey = input.idempotencyKey || nanoid(16);
          
          // 2️⃣ Verificar se já foi processado em memória (checkRequestIdMemory)
          const cachedResult = checkRequestIdMemory(idempotencyKey);
          if (cachedResult) {
            logger.debug(
              {
                module: "pedidos.createVenda",
                idempotencyKey: idempotencyKey.slice(0, 32),
                pedidoId: cachedResult.pedidoId,
                numero: cachedResult.numero,
              },
              "[CONCURRENCY] Duplicação em memória (idempotência)"
            );
            logDuplicationAttempt(idempotencyKey, input.clienteId ?? 0, "IDEMPOTENCY_KEY_DUPLICATE", cachedResult.numero);
            return {
              pedidoId: cachedResult.pedidoId,
              numero: cachedResult.numero,
              clienteId: input.clienteId ?? 0,
              gerouPendencia: false,
              pendenteEstoque: false,
              isDuplicate: true,
              fromMemoryCache: true,
            };
          }
          // ⚙️ CONTROLE DE CONCORRÊNCIA - FIM (resto da lógica continua)

          const result = await executeCommand(
            { commandName: "createVenda", idempotencyKey },
            async (tx) => {
              let tMark = Date.now();
              const isAdmin = ctx.user?.role === "admin";
              let vendedor: db.Vendedor | null = ctx.vendedor ?? null;
              if (!vendedor && isAdmin && input.vendedorId) {
                vendedor = await db.getVendedorById(String((ctx as { tenantId?: string | number | null }).tenantId ?? ""), input.vendedorId);
              }
              if (!vendedor && !isAdmin) {
                vendedor = await getVendedorFromContext(ctx);
              }
              if (!vendedor) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: isAdmin
                    ? "Selecione o vendedor responsável pelo pedido."
                    : "Usuário não está vinculado a um vendedor.",
                });
              }
              markPhase("vendedorMs", tMark);
              tMark = Date.now();
              let gerouPendencia = false;
              // 1) Cliente (cria automaticamente se necessário)
          let clienteId = input.clienteId;

          if (!clienteId) {
            const nomeOk = input.cliente.nome?.trim();
            const telOk = input.cliente.telefone?.trim();
            if (!nomeOk || !telOk) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Informe telefone e nome." });
            }
            const telefoneNorm = db.normalizeTelefone(input.cliente.telefone);
            const { nomeNorm, sobrenomeNorm } = db.normalizeNomeSobrenome(input.cliente.nome);
            const nn = nomeNorm.slice(0, 120);
            const sn = sobrenomeNorm.slice(0, 120);
            const existing = await (tx as any).select({ id: db.clientes.id }).from(db.clientes)
              .where(db.and(
                db.eq(db.clientes.tenantId, vendedor.tenantId),
                db.eq(db.clientes.telefoneNorm, telefoneNorm),
                db.eq(db.clientes.nomeNorm, nn),
                db.eq(db.clientes.sobrenomeNorm, sn)
              ))
              .limit(1);
            if (existing.length > 0) {
              clienteId = existing[0].id;
            } else {
              const tel = input.cliente.telefone === '' || input.cliente.telefone == null ? null : (input.cliente.telefone || null);
              const created = await (tx as any).insert(db.clientes).values({
                tenantId: vendedor.tenantId,
                nome: input.cliente.nome,
                telefone: tel,
                telefoneNorm: telefoneNorm.slice(0, 32),
                nomeNorm: nn,
                sobrenomeNorm: sn,
                telefoneRecado: input.cliente.telefoneRecado || null,
                rua: input.cliente.rua || null,
                numero: input.cliente.numero || null,
                bairro: input.cliente.bairro || null,
                cidade: input.cliente.cidade || null,
                uf: input.cliente.uf || null,
                referencia: input.cliente.referencia || null,
                condominio: input.cliente.condominio || null,
                bloco: input.cliente.bloco || null,
                apartamento: input.cliente.apartamento || null,
              } as any);
              clienteId = (created as any)[0]?.insertId;
            }
          }

          if (!clienteId) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao criar cliente.' });
          }

          // Vínculo idempotente: se já existe (clienteId, vendedorId), não insere; senão PRINCIPAL ou SECUNDARIO conforme já existir principal.
          await db.ensureClienteVendedorLink(tx, clienteId, vendedor.id);
          markPhase("clienteLinkMs", tMark);
          tMark = Date.now();

          // 2) Número do pedido (travado para não duplicar, por tenant)
          const tenantIdForCounter = vendedor.tenantId;
          const readCounterForUpdate = async () => {
            const [rows]: any = await (tx as any).execute(db.sql`
              SELECT seq FROM counters
              WHERE tenant_id = ${tenantIdForCounter} AND name = 'pedidos'
              FOR UPDATE
            `);
            return rows;
          };

          let counterRows: any = await readCounterForUpdate();
          const currentSeq = Number(counterRows?.[0]?.seq ?? 0);

          let numero: number;
          if (!counterRows || counterRows.length === 0) {
            numero = 1;
            try {
              await (tx as any).insert(db.counters).values({ tenantId: tenantIdForCounter, name: 'pedidos', seq: 1, free: null } as any);
            } catch (e) {
              if (!isDuplicateKeyError(e)) throw e;
              // Duas transações viram fila vazia: FOR UPDATE não trava linha inexistente; a outra inseriu primeiro.
              counterRows = await readCounterForUpdate();
              const seq = Number(counterRows?.[0]?.seq ?? 0);
              numero = seq + 1;
              await (tx as any).update(db.counters).set({ seq: numero } as any).where(db.and(db.eq(db.counters.tenantId, tenantIdForCounter), db.eq(db.counters.name, 'pedidos')));
            }
          } else {
            numero = currentSeq + 1;
            await (tx as any).update(db.counters).set({ seq: numero } as any).where(db.and(db.eq(db.counters.tenantId, tenantIdForCounter), db.eq(db.counters.name, 'pedidos')));
          }
          markPhase("counterMs", tMark);
          tMark = Date.now();

          // 3) Pagamento combinado (planejamento) — vai impresso no pedido
          const pagamentoPlanejado = (() => {
            // Novo padrão: pagamentos (PIX/DINHEIRO/CARTAO/BOLETO/A_DEFINIR), até 2 opções.
            if (input.pagamentos && input.pagamentos.length) {
              return JSON.stringify({ planejado: true, tipo: 'MULTI', pagamentos: input.pagamentos });
            }
            if (!input.pagamentoCombinado) return null;
            const pc = input.pagamentoCombinado;
            const total = Number(input.total.toFixed(2));
            const entrada = pc.entradaValor != null ? Number(pc.entradaValor.toFixed(2)) : null;
            const primeiroVenc = (pc.boletoPrimeiroVencimento || new Date(Date.now() + 30*24*60*60*1000)).toISOString();
            const parcelas = Math.max(1, Math.floor(pc.boletoParcelas || 1));

            if (pc.tipo === 'BOLETO') {
              return JSON.stringify({
                planejado: true,
                tipo: 'BOLETO',
                entradaValor: null,
                restanteTipo: 'BOLETO',
                total,
                boleto: { parcelas, primeiroVencimento: primeiroVenc },
              });
            }
            if (pc.tipo === 'CARTAO') {
              return JSON.stringify({
                planejado: true,
                tipo: 'CARTAO',
                entradaValor: null,
                restanteTipo: 'CARTAO',
                total,
              });
            }
            if (pc.tipo === 'ENTRADA_BOLETO') {
              if (entrada == null || entrada <= 0 || entrada >= total) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pagamento combinado inválido: entrada deve ser maior que 0 e menor que o total.' });
              }
              return JSON.stringify({
                planejado: true,
                tipo: 'ENTRADA_BOLETO',
                entradaValor: entrada,
                restanteTipo: 'BOLETO',
                total,
                boleto: { parcelas, primeiroVencimento: primeiroVenc },
              });
            }
            // ENTRADA_CARTAO
            if (entrada == null || entrada <= 0 || entrada >= total) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pagamento combinado inválido: entrada deve ser maior que 0 e menor que o total.' });
            }
            return JSON.stringify({
              planejado: true,
              tipo: 'ENTRADA_CARTAO',
              entradaValor: entrada,
              restanteTipo: 'CARTAO',
              total,
            });
          })();

          // 4) Estoque: verificar se algum item de catálogo tem estoque insuficiente (FOR UPDATE).
          // Se tiver: salvar pedido como PENDENTE_ESTOQUE, criar pendências, NÃO mexer no estoque. Idempotência mantida.
          const catalogIds = Array.from(new Set(input.itens.filter((x: any) => x.tipo === 'CATALOGO' && x.produtoId).map((x: any) => x.produtoId))) as number[];
          const estoquePorProduto: Record<number, number> = {};
          if (catalogIds.length > 0) {
            const rows = await tx
              .select({ id: db.produtos.id, estoque: db.produtos.estoque })
              .from(db.produtos)
              .where(
                db.and(db.eq(db.produtos.tenantId, vendedor.tenantId), db.inArray(db.produtos.id, catalogIds))
              )
              .for("update");
            for (const r of rows) {
              estoquePorProduto[Number(r.id)] = Number(r.estoque ?? 0);
            }
          }
          markPhase("estoqueLockMs", tMark);
          tMark = Date.now();
          const itensComFalta: Set<number> = new Set();
          for (const i of input.itens) {
            if (i.tipo === 'CATALOGO' && i.produtoId) {
              const estoqueAtual = estoquePorProduto[i.produtoId] ?? 0;
              if (estoqueAtual < i.quantidade) itensComFalta.add(i.produtoId);
            }
          }
          const statusPedido = itensComFalta.size > 0 ? 'PENDENTE_ESTOQUE' : 'GERADO';

          // 5) Pedido (com status GERADO ou PENDENTE_ESTOQUE)
          const pedidoInsert = await (tx as any).insert(db.pedidos).values({
            tenantId: vendedor.tenantId,
            numero,
            vendedorId: vendedor.id,
            clienteId,
            clienteNome: input.cliente.nome,
            clienteTelefone: input.cliente.telefone || null,
            clienteTelefoneRecado: input.cliente.telefoneRecado || null,
            clienteRua: input.cliente.rua || null,
            clienteNumero: input.cliente.numero || null,
            clienteBairro: input.cliente.bairro || null,
            clienteCidade: input.cliente.cidade || null,
            clienteUf: input.cliente.uf || null,
            clienteReferencia: input.cliente.referencia || null,
            clienteCondominio: input.cliente.condominio || null,
            clienteBloco: input.cliente.bloco || null,
            clienteApartamento: input.cliente.apartamento || null,
            subtotal: roundToTwo(input.subtotal) as any,
            desconto: roundToTwo(input.desconto) as any,
            frete: roundToTwo(input.frete) as any,
            total: roundToTwo(input.total) as any,
            status: statusPedido,
            formaPagamento: pagamentoPlanejado,
            observacoes: input.observacoes || null,
          } as any);

          const pedidoId = (pedidoInsert as any)[0]?.insertId;
          if (!pedidoId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao criar pedido.' });
          markPhase("pedidoInsertMs", tMark);
          tMark = Date.now();

          // 6) Catálogo: pendências + baixa de estoque (mesma ordem de linhas que antes)
          for (const i of input.itens) {
            if (i.tipo === 'CATALOGO' && i.produtoId) {
              const estoqueAtual = estoquePorProduto[i.produtoId] ?? 0;
              const falta = estoqueAtual < i.quantidade;
              if (statusPedido === 'PENDENTE_ESTOQUE' && falta) {
                gerouPendencia = true;
                const qtdPendente = estoqueAtual > 0 ? i.quantidade - estoqueAtual : i.quantidade;
                await (tx as any).insert(db.pendencias).values({
                  tenantId: vendedor.tenantId,
                  pedidoId,
                  vendedorId: vendedor.id,
                  produtoId: i.produtoId,
                  corId: i.corId || null,
                  quantidade: qtdPendente,
                  status: 'PENDENTE',
                } as any);
              }
              if (statusPedido === 'GERADO' && !falta) {
                const novoEstoque = estoqueAtual - i.quantidade;
                await (tx as any).update(db.produtos)
                  .set({ estoque: novoEstoque } as any)
                  .where(
                    db.and(
                      db.eq(db.produtos.tenantId, vendedor.tenantId),
                      db.eq(db.produtos.id, i.produtoId)
                    )
                  );
                await db.insertAuditLog({
                  actorUserId: ctx.user?.role === "admin" ? ctx.user.id : null,
                  actorVendedorId: ctx.user?.role !== "admin" ? vendedor?.id ?? null : null,
                  action: "SAIDA",
                  entity: "estoque",
                  entityId: String(i.produtoId),
                  payloadJson: JSON.stringify({
                    pedidoId,
                    produtoId: i.produtoId,
                    quantidade: i.quantidade,
                    saldoAnterior: estoqueAtual,
                    saldoNovo: novoEstoque,
                  }),
                  traceId: nanoid(10),
                }, tx);
              }
            }
          }
          markPhase("catalogoEstoqueMs", tMark);
          tMark = Date.now();

          const itensPedidoRows = input.itens.map((i) => ({
            tenantId: vendedor.tenantId,
            pedidoId,
            tipo: i.tipo,
            produtoId: i.produtoId || null,
            corId: i.corId || null,
            corNome: i.corNome || null,
            descricao: `${i.descricao}${i.corNome ? ` ${i.corNome}` : ''}`.trim(),
            marca: i.marca || null,
            quantidade: i.quantidade,
            valorUnitario: i.isPremio ? 0 : roundToTwo(i.valorUnitario),
            custo: i.custo,
            prazoGarantia: i.prazoGarantia,
          }));
          await (tx as any).insert(db.itensPedido).values(itensPedidoRows as any);
          markPhase("itensBatchInsertMs", tMark);
          tMark = Date.now();

          // 7) Contas a Receber (provisório) — o real será gerado/ajustado na baixa (carga/entrega)
          const venc = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await (tx as any).insert(db.contasReceber).values({
            tenantId: vendedor.tenantId,
            pedidoNumero: numero,
            clienteNome: input.cliente.nome,
            vendedorId: vendedor.id,
            descricao: `Fiado - Pedido #${numero}`,
            valor: roundToTwo(input.total) as any,
            dataVencimento: venc,
            status: 'PENDENTE',
            formaPagamento: null,
            observacoes: 'Gerada automaticamente no pedido. Será substituída/ajustada na baixa.',
          } as any);
          markPhase("contaReceberMs", tMark);

              return { ok: true, traceId: nanoid(10), pedidoId, numero, clienteId, gerouPendencia, pendenteEstoque: statusPedido === 'PENDENTE_ESTOQUE' };
            }
          );
        if (isInProgress(result)) return result;

        // ⚙️ REGISTRAR SUCESSO EM MEMÓRIA (registerSuccessfulCreation)
        registerSuccessfulCreation(idempotencyKey, result.pedidoId, result.numero);
        logger.debug(
          {
            module: "pedidos.createVenda",
            idempotencyKey: idempotencyKey.slice(0, 32),
            pedidoId: result.pedidoId,
            numero: result.numero,
          },
          "[CONCURRENCY] Sucesso registrado em memória"
        );

        await db.insertAuditLog({
          actorUserId: ctx.user?.role === "admin" ? ctx.user.id : null,
          actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : null,
          action: "create",
          entity: "pedido",
          entityId: String(result.pedidoId),
          payloadJson: JSON.stringify({ numero: result.numero }),
          traceId: result.traceId ?? undefined,
        });
        return { pedidoId: result.pedidoId, numero: result.numero, clienteId: result.clienteId, gerouPendencia: result.gerouPendencia, pendenteEstoque: result.pendenteEstoque };
        } catch (e) {
          throw e;
        } finally {
          const durationMs = Date.now() - createVendaStarted;
          logger.info(
            {
              module: "pedidos.createVenda",
              durationMs,
              idempotencyKeyPrefix: (input.idempotencyKey || "").slice(0, 20),
              pool: getPoolStatsSnapshot(),
              ...(perfPhases && Object.keys(perfPhases).length > 0 ? { perfPhases } : {}),
            },
            `[createVenda] ${durationMs}ms`
          );
        }
      }),
  }),

  // ===== CARGAS =====
  cargas: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await db.getAllCargas(tenantId);
    }),
    
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.getCargaById(tenantId, input.id);
      }),

    getPontosMapa: adminProcedure
      .input(z.object({ cargaId: z.number() }))
      .query(async ({ ctx, input }) => {
        const tenantId = await requireTenant(ctx);
        const { obterPontosMapaCarga } = await import("./modules/logistica/mapa-rota.service.js");
        const payload = await obterPontosMapaCarga(tenantId, input.cargaId);
        if (!payload) return { cidade: "", dataEntrega: "", pontos: [] as const };
        return payload;
      }),

    listHistoricoRotas: adminProcedure
      .input(z.object({ cidade: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const tenantId = await requireTenant(ctx);
        return await logisticaService.listHistoricoRotas(tenantId, {
          cidade: input?.cidade,
        });
      }),

    gerarRelatorioViagemPDF: adminProcedure
      .input(z.object({ cargaId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await pdf.gerarRelatorioViagemPDF(tenantId, input.cargaId);
      }),
    
    create: adminProcedure
      .input(z.object({
        cidadeRota: z.string(),
        dataEntrega: z.date(),
        pedidosIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.createCarga(tenantId, input);
      }),

    // Editar carga (incluir/remover pedidos). Mantém status dos pedidos sincronizado.
    updatePedidos: adminProcedure
      .input(z.object({
        cargaId: z.number(),
        addIds: z.array(z.number()).optional(),
        removeIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.updateCargaPedidos(tenantId, input.cargaId, input.addIds || []);
      }),
    
    

    // Fechar/Liberar carga: muda para EM_ROTA e trava edição
    fechar: adminProcedure
      .input(z.object({ cargaId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.fecharCarga(tenantId, input.cargaId);
      }),

    // Romaneio PDF da carga (server-side)
    gerarRomaneioPDF: adminProcedure
      .input(z.object({ cargaId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await pdf.gerarRomaneioPDF(tenantId, input.cargaId);
      }),

    baixarPedido: adminProcedure
      .input(z.object({
        pedidoCargaId: z.number(),
        entradaForma: z.enum(['PIX','BOLETO','CARTAO','DINHEIRO']),
        entradaValor: z.number().optional(),
        segundaForma: z.enum(['PIX','CARTAO','DINHEIRO']).optional(),
        segundaValor: z.number().optional(),
        boletoParcelas: z.number().optional(),
        boletoVencimentos: z.array(z.date()).optional(),
        boletoPrimeiroVencimento: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const result = await db.baixarPedidoCarga(tenantId, input.pedidoCargaId, {
          entradaForma: input.entradaForma,
          entradaValor: input.entradaValor,
          segundaForma: input.segundaForma,
          segundaValor: input.segundaValor,
          boletoParcelas: input.boletoParcelas,
          boletoVencimentos: (input as any).boletoVencimentos,
          boletoPrimeiroVencimento: input.boletoPrimeiroVencimento,
        });

        if (result.boletoIds?.length && result.pedidoNumero && result.clienteNome) {
          const zip = await pdf.gerarZipBoletos({
            boletoIds: result.boletoIds,
            pedidoNumero: result.pedidoNumero,
            clienteNome: result.clienteNome,
          });
          return { ...result, boletosZip: zip };
        }

        return result;
      }),

    // OBS: "Finalizar carga" (baixa em massa com 1 pagamento) não é seguro no seu fluxo.
    // Mantido desativado por padrão. Use o "Painel Dar Baixa" na UI.
    finalizar: adminProcedure
      .input(z.object({
        cargaId: z.number(),
      }))
      .mutation(async () => {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Use o Painel "Dar Baixa" para baixar pedido por pedido.' });
      }),
  }),

  // ===== BOLETOS E PDF =====

// ===== PENDÊNCIAS =====
pendencias: router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = await requireTenant(ctx);
    const vendedorId = ctx.user?.role === "admin" ? undefined : (await getVendedorFromContext(ctx))?.id;
    if (ctx.user?.role !== "admin" && vendedorId == null) return [];
    return await db.listPendencias(tenantId, vendedorId ?? undefined);
  }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["PENDENTE", "COMPRADO", "RESOLVIDO"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const vendedorId = ctx.user?.role === "admin" ? undefined : (await getVendedorFromContext(ctx))?.id;
      await db.updateStatusPendencia(tenantId, input.id, input.status, vendedorId);
      return { ok: true as const };
    }),
}),

  boletos: router({
    list: protectedProcedure
      .input(z.object({ busca: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        type BoletoRow = {
          id: number;
          numeroPedido: number;
          valorOriginal: string | number;
          valorAberto: string | number;
          dataVencimento: Date | string;
          status: string;
          createdAt: Date | string;
          clienteId: number | null;
          clienteNome: string | null;
        };
        let boletosData: BoletoRow[] = [];
        if (ctx.user.role === 'admin') {
          const db_conn = await db.getDb();
          if (!db_conn) return [];
          boletosData = (await db_conn.select({
            id: db.boletos.id,
            numeroPedido: db.boletos.numeroPedido,
            valorOriginal: db.boletos.valorOriginal,
            valorAberto: db.boletos.valorAberto,
            dataVencimento: db.boletos.dataVencimento,
            status: db.boletos.status,
            createdAt: db.boletos.createdAt,
            clienteId: db.boletos.clienteId,
            clienteNome: db.clientes.nome
          })
          .from(db.boletos)
          .innerJoin(db.clientes, db.eq(db.boletos.clienteId, db.clientes.id))) as BoletoRow[];
        } else {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) return [];
          const tenantId = await requireTenant(ctx);
          const page = await db.getBoletosByVendedor(tenantId, vendedor.id);
          boletosData = page.items;
        }

        if (input?.busca) {
          const termo = input.busca.toLowerCase();
          return boletosData.filter(
            (b) =>
              b.clienteNome?.toLowerCase().includes(termo) ||
              String(b.numeroPedido).includes(termo)
          );
        }
        return boletosData;
      }),
    
    baixarParcial: adminProcedure
      .input(z.object({
        boletoId: z.number(),
        valorPago: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.baixarBoletoParcial(tenantId, input.boletoId, input.valorPago);
      }),

    gerarPDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "boleto", input.id);
        return await pdf.gerarBoletoPDF(input.id);
      }),

    gerarExtrato: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        let vendedorIdFilter: number | undefined;
        if (ctx.user.role !== "admin") {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
          const tenantId = await requireTenant(ctx);
          const lista = await db.getBoletosByVendedor(tenantId, vendedor.id);
          const doCliente = lista.items.filter((b) => Number(b.clienteId) === input.clienteId);
          if (doCliente.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Nenhum boleto seu para este cliente." });
          vendedorIdFilter = vendedor.id;
        }
        return await pdf.gerarExtratoClientePDF(input.clienteId, vendedorIdFilter);
      }),

    gerarBoletosCarga: protectedProcedure
      .input(z.object({ 
        cargaId: z.number(),
        pedidoNumero: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        if (ctx.user.role !== "admin") {
          const carga = await db.getCargaById(tenantId, input.cargaId);
          if (!carga) throw new TRPCError({ code: "NOT_FOUND", message: "Carga não encontrada." });
          const pedidosIds = (carga as any).pedidos?.map((p: any) => p.id) ?? [];
          if (pedidosIds.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Carga sem pedidos." });
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
          const db_conn = await db.getDb();
          if (!db_conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
          const rows = await db_conn.select({ vendedorId: db.pedidos.vendedorId }).from(db.pedidos).where(db.inArray(db.pedidos.id, pedidosIds));
          const todosDoVendedor = rows.every((r: any) => r.vendedorId === vendedor.id);
          if (!todosDoVendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Carga contém pedidos de outro vendedor." });
        }
        return await pdf.gerarBoletosCargaPDF(tenantId, input.cargaId, input.pedidoNumero);
      }),

    // Gera um ZIP com 1 PDF por boleto (lista de IDs).
    gerarZip: protectedProcedure
      .input(z.object({
        boletoIds: z.array(z.number()).min(1),
        pedidoNumero: z.number(),
        clienteNome: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
          for (const bid of input.boletoIds) {
            const b = await db.getBoletoById(bid);
            if (!b) throw new TRPCError({ code: "NOT_FOUND", message: `Boleto ${bid} não encontrado.` });
            if (b.vendedorId !== vendedor.id) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a um ou mais boletos." });
          }
        }
        return await pdf.gerarZipBoletos(input);
      }),

    gerarRelatorio: protectedProcedure
      .input(z.object({ 
        tipo: z.enum(['PAGAR', 'RECEBER']),
        mesAno: z.string()
      }))
      .mutation(async ({ input }) => {
        return await pdf.gerarRelatorioFinanceiroPDF(input.tipo, input.mesAno);
      }),
  }),

  // ===== CONTAS A RECEBER =====
  contasReceber: router({
    list: protectedProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        void input;
        const tenantId = await requireTenant(ctx);
        if (ctx.user.role === 'admin') {
          return await db.getAllContasReceber(tenantId);
        } else {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) return [];
          return await db.getContasReceberByVendedor(tenantId, vendedor.id);
        }
      }),
    
    create: protectedProcedure
      .input(z.object({
        pedidoNumero: z.number().optional(),
        clienteNome: z.string().min(1),
        descricao: z.string().min(1),
        valor: z.number(),
        dataVencimento: z.string(),
        formaPagamento: z.string().optional(),
        observacoes: z.string().optional(),
        idempotencyKey: z.string().max(64).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await executeCommand(
            { commandName: "contasReceber.create", idempotencyKey: input.idempotencyKey },
            async (tx) => {
              let vendedorId: number | undefined;
              if (ctx.user.role !== "admin") {
                const vendedor = await getVendedorFromContext(ctx);
                vendedorId = vendedor?.id;
              }
              const tenantIdConta = await (await import("./_core/tenant.js")).requireTenant(ctx);
              await db.createContaReceber(tenantIdConta, {
                pedidoNumero: input.pedidoNumero,
                clienteNome: input.clienteNome,
                descricao: input.descricao,
                valor: input.valor,
                dataVencimento: input.dataVencimento,
                formaPagamento: input.formaPagamento as "PIX" | "BOLETO" | "CARTAO" | "DINHEIRO",
                observacoes: input.observacoes,
                vendedorId,
              });
              return { ok: true, traceId: nanoid(10), success: true };
            }
          );
          if (isInProgress(result)) return result;
          return { success: true };
        } catch (e) {
          throw e;
        }
      }),
    
    marcarRecebida: protectedProcedure
      .input(z.object({
        id: z.number(),
        dataRecebimento: z.string(),
        formaPagamento: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "conta_receber", input.id);
        const tenantId = await requireTenant(ctx);
        return await db.marcarContaRecebida(tenantId, input.id, input.dataRecebimento, input.formaPagamento);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "conta_receber", input.id);
        const tenantId = await requireTenant(ctx);
        return await db.deleteContaReceber(tenantId, input.id);
      }),
  }),

  // ===== CAIXA MENSAL (dados globais da empresa — apenas admin) =====
  caixaMensal: router({
    get: adminProcedure
      .input(z.object({ mesAno: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.getCaixaMensal(tenantId, input.mesAno ?? '');
      }),
    listAll: adminProcedure
      .query(async ({ ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.getAllCaixaMensal(tenantId);
      }),
  }),

  // ===== PLANO DE CONTAS =====
  planoContas: router({
    list: protectedProcedure
      .input(z.object({ tipo: z.enum(["RECEITA", "DESPESA"]).optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.getPlanoContas(tenantId, input?.tipo);
      }),
    create: adminProcedure
      .input(z.object({ 
        nome: z.string(), 
        tipo: z.enum(["RECEITA", "DESPESA"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.createPlanoContas(tenantId, input);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), nome: z.string().min(1), tipo: z.enum(["RECEITA", "DESPESA"]), idempotencyKey: z.string().max(64).optional() }))
      .mutation(async ({ input }) => {
        const { idempotencyKey, ...data } = input;
        const result = await executeCommand(
          { commandName: "planoContas.update", idempotencyKey: idempotencyKey ?? undefined },
          async (tx) => {
            await (tx as any).update(db.planoContas).set({ nome: data.nome, tipo: data.tipo } as any).where(db.eq(db.planoContas.id, data.id));
            return commandResult(true, ["Plano de contas atualizado"]);
          }
        );
        if (isInProgress(result)) return result;
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number(), idempotencyKey: z.string().max(64).optional() }))
      .mutation(async ({ input }) => {
        const result = await executeCommand(
          { commandName: "planoContas.delete", idempotencyKey: input.idempotencyKey ?? undefined },
          async (tx) => {
            await (tx as any).delete(db.planoContas).where(db.eq(db.planoContas.id, input.id));
            return commandResult(true, ["Plano de contas excluído"]);
          }
        );
        if (isInProgress(result)) return result;
        return { ok: true as const };
      }),
  }),

  // ===== CONTAS A PAGAR (somente admin — dados financeiros globais) =====
  contasPagar: router({
    list: adminProcedure
      .input(z.object({ 
        status: z.enum(['PENDENTE', 'PAGO']).optional(),
        fornecedor: z.string().optional()
      }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.listContasPagarFiltro(tenantId, { status: input.status, fornecedor: input.fornecedor });
      }),
    create: adminProcedure
      .input(z.object({
        fornecedor: z.string(),
        descricao: z.string().optional(),
        valor: z.string(),
        dataVencimento: z.preprocess(
          (v) => (typeof v === "string" || typeof v === "number") ? new Date(v) : v,
          z.date().refine((d) => !Number.isNaN(d.getTime()), { message: "Data de vencimento inválida" })
        ),
        planoContasId: z.number().optional(),
        observacoes: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.createContaPagar(tenantId, input);
      }),
    pagar: adminProcedure
      .input(z.object({ id: z.number(), valorPago: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.pagarConta(tenantId, input.id, input.valorPago);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.deleteContaPagar(tenantId, input.id);
      }),
  }),

  // ===== CONTAS FIXAS (somente admin) =====
  contasFixas: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await db.listContasFixas(tenantId);
    }),
    create: adminProcedure
      .input(z.object({
        nome: z.string(),
        valorPadrao: z.string(),
        diaVencimento: z.number(),
        planoContasId: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.createContaFixa(tenantId, input);
      }),
    gerarMes: adminProcedure
      .input(z.object({ mesAno: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.gerarContasFixasMes(tenantId, input.mesAno);
      }),
  }),

  // ===== COMISSÕES =====
  comissoes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      if (ctx.user.role === "admin") {
        return await db.getAllComissoes(tenantId);
      }
      const vendedor = await getVendedorFromContext(ctx);
      if (!vendedor) return [];
      return await db.getComissoesByVendedor(tenantId, vendedor.id);
    }),
    marcarPaga: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await db.marcarComissaoPaga(tenantId, input.id);
      }),
  }),

  // ===== CONFIGURAÇÕES =====
  config: router({
    get: protectedProcedure
      .input(z.object({ chave: z.string() }))
      .query(async ({ input }) => {
        return await db.getConfig(input.chave);
      }),
    
    set: adminProcedure
      .input(z.object({ chave: z.string(), valor: z.string() }))
      .mutation(async ({ input }) => {
        return await db.setConfig(input.chave, input.valor);
      }),
  }),

  // ===== DIAGNÓSTICO DE CONSISTÊNCIA (admin) =====
  diagnostico: router({
    run: adminProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await db.runDiagnosticoConsistencia(tenantId);
    }),
  }),

  audit: router({
    list: adminProcedure
      .input(
        z
          .object({
            pedidoId: z.number().optional(),
            clienteId: z.number().optional(),
            entity: z.string().optional(),
            action: z.string().optional(),
            dateFrom: z.date().optional(),
            dateTo: z.date().optional(),
            limit: z.number().min(1).max(500).optional(),
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const entidadeId =
          input?.pedidoId != null
            ? String(input.pedidoId)
            : input?.clienteId != null
              ? String(input.clienteId)
              : undefined;
        const rows = await buscarRegistros({
          tenantId,
          tipo: input?.entity,
          acao: input?.action,
          entidadeId,
          dataInicio: input?.dateFrom,
          dataFim: input?.dateTo,
          limit: input?.limit ?? 200,
        });
        return rows.map((r) => ({
          id: r.id,
          createdAt:
            r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
          actorUserId: r.usuarioId,
          actorVendedorId: r.vendedorId,
          action: r.acao,
          entity: r.tipo,
          entityId: r.entidadeId,
          payloadJson: JSON.stringify(r.dados),
          traceId: r.traceId,
        }));
      }),
  }),

  pedidoCompra: router({
    listPorFornecedor: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      const dbConn = await db.getDb();
      if (!dbConn) return [];
      const vendedorId =
        ctx.user.role === "admin" ? undefined : (await getVendedorFromContext(ctx))?.id;
      const pendRows = await dbConn
        .select({
          produtoId: db.pendencias.produtoId,
          quantidade: db.pendencias.quantidade,
          status: db.pendencias.status,
          fornecedor: db.produtos.fornecedor,
          descricao: db.produtos.descricao,
          marca: db.produtos.marca,
        })
        .from(db.pendencias)
        .innerJoin(db.produtos, db.eq(db.produtos.id, db.pendencias.produtoId))
        .where(
          db.and(
            db.eq(db.pendencias.tenantId, tenantId),
            db.eq(db.pendencias.status, "PENDENTE"),
            db.eq(db.produtos.tenantId, tenantId),
            ...(vendedorId != null ? [db.eq(db.pendencias.vendedorId, vendedorId)] : [])
          )
        );
      const map = new Map<
        number,
        {
          fornecedor: string | null;
          produtoId: number;
          descricao: string;
          marca: string | null;
          quantidade: number;
          qtdPedidos: number;
        }
      >();
      for (const r of pendRows) {
        const cur = map.get(r.produtoId);
        if (cur) {
          cur.quantidade += r.quantidade;
          cur.qtdPedidos += 1;
        } else {
          map.set(r.produtoId, {
            fornecedor: r.fornecedor,
            produtoId: r.produtoId,
            descricao: r.descricao,
            marca: r.marca,
            quantidade: r.quantidade,
            qtdPedidos: 1,
          });
        }
      }
      return Array.from(map.values());
    }),

    gerarPdf: protectedProcedure
      .input(z.object({ produtoIds: z.array(z.number()) }))
      .mutation(() => {
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: "Geração de PDF de pedido de compra ainda não implementada no servidor.",
        });
      }),
  }),

  // ===== DASHBOARD INTELIGENTE =====
  dashboard: router({
    insights: protectedProcedure.query(async (opts) => {
      const { requireTenant } = await import("./_core/tenant.js");
      const tenantId = await requireTenant(opts.ctx);
      const { getDashboardCache, setDashboardCache } = await import("./tools/dashboard-cache.js");
      const cached = getDashboardCache(tenantId);
      if (cached) return cached as Awaited<ReturnType<typeof import("./services/dashboard-insights.service.js").getDashboardInsights>>;
      const { getDashboardInsights } = await import("./services/dashboard-insights.service.js");
      const data = await getDashboardInsights(tenantId);
      setDashboardCache(tenantId, data as Record<string, unknown>);
      await db.insertAuditLog({
        tenantId,
        actorUserId: opts.ctx.user?.id ?? null,
        actorVendedorId: opts.ctx.vendedor?.id ?? null,
        action: "dashboard_view",
        entity: "dashboard",
        payloadJson: JSON.stringify({ view: "insights" }),
        traceId: nanoid(10),
      });
      return data;
    }),
  }),
});

export type AppRouter = typeof appRouter;
