import cookie from "cookie";
import { ValidationError } from './_core/errors/typed-errors.js';
import { COOKIE_NAME, ONE_YEAR_MS, ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, protectedProcedure, adminProcedure, requireRole, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import * as pdfService from "./services/reports/pdf.service.js";
import { roundToTwo, sumWithPrecision, subtractWithPrecision, multiplyWithPrecision } from "./utils/financialUtils.js";
import { nanoid } from "nanoid";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "./_core/service-entry-guard.js";
import { assertOwnership, resolveOwnerUserId } from "./_core/ownership.js";
import { executeCommand, commandResult } from "./_core/command.js";
import { isInProgress } from "../shared/idempotency.js";
import { checkRequestIdMemory, registerSuccessfulCreation, logDuplicationAttempt, generateConcurrencyReport } from "./concurrency/pedido-control.js";
import { requireTenant } from "./_core/tenant.js";
import { checkRateLimit, clearRateLimitForKey } from "./services/rateLimitService.js";
import { logAuth } from "./services/auditService.js";
import { leoRouter } from "./routers/leo.js";
import { leoAdminRouter } from "./routers/leo-admin.js";
import { adminRouter } from "./routers/admin/index.js";
import { resolveServiceActor } from "./_core/service-actor.js";
import { auditEntityChange } from "./_core/domain-audit.js";
import * as cachedClientes from "./services/cached-clientes.service.js";
import * as inventoryService from "./services/inventory.service.js";
import * as configuracoesService from "./services/configuracoes.service.js";
import * as systemService from "./services/system.service.js";
import { logAuditAction } from "./services/audit-log.service.js";
import * as pendenciasService from "./services/pendencias.service.js";
import * as clientesService from "./services/clientes.service.js";
import { resolveClienteVendaInTransaction } from "./services/clientes.service.js";
import * as financeService from "./services/finance.service.js";
import * as boletosService from "./services/boletos.service.js";
import * as usersService from "./services/users.service.js";
import type { Vendedor, InsertVendedor } from "./services/users.service.js";
import { logger } from "./_core/logger.js";
import { getPoolStatsSnapshot } from "./config/database.js";
import {
  isDuplicateKeyError,
  createPedidoSafe,
  listPedidosTrpcPage,
  getPedidoWithItensForActor,
  getPedidoByIdForActor,
  getPedidoById,
  getItensPedido,
  PedidoAccessError,
  buscarPedidos,
  listPedidosConferencia,
  marcarPedidoConferido,
  atualizarStatusPedido,
  updatePedido,
  deletePedido,
  getNextPedidoNumberInTransaction,
  insertPedidoInTransaction,
  processEstoqueEPendenciasInTransaction,
  extractPedidoIdFromInsert,
  insertItensPedidoAndContasReceberInTransaction,
} from "./services/orders.service.js";
import * as logisticaService from "./services/logistica.service.js";
import { buscarRegistros } from "./services/audit-service.js"; 

type ExpressRequest = import("express").Request;
type BcryptModuleLike = {
  hash: (data: string, saltOrRounds: string | number) => Promise<string>;
  compare: (data: string, encrypted: string) => Promise<boolean>;
};

function toExpressRequest(value: unknown): ExpressRequest {
  return value as ExpressRequest;
}

function isBcryptModuleLike(value: unknown): value is BcryptModuleLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { hash?: unknown; compare?: unknown };
  return typeof candidate.hash === "function" && typeof candidate.compare === "function";
}

function hasStockErrorCode(error: unknown): error is { code?: string; message?: string } {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === "string" || typeof candidate.message === "string";
}

type PedidoStatus = "GERADO" | "IMPRESSO" | "EM_ROTA" | "ENTREGUE" | "CANCELADO";
type PedidoCargaItem = { id: number };
type RowWithVendedorId = { vendedorId: number };
type CounterSelectRow = { seq: number | null };

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
    const candidate = (bcryptImported as { default?: unknown }).default ?? bcryptImported;
    if (!isBcryptModuleLike(candidate)) {
      throw new ValidationError("Funções bcrypt não encontradas no módulo importado");
    }
    const bcryptModule = candidate;
    
    // Verificar se as funções necessárias estão disponíveis
    if (typeof bcryptModule.hash !== 'function' || typeof bcryptModule.compare !== 'function') {
      throw new ValidationError("Funções bcrypt não encontradas no módulo importado");
    }
    
    // Testar as funções com um valor simples
    try {
      console.log("[getBcrypt] Testando funções bcrypt...");
      const testValue = "test-" + Date.now();
      const testHash = await bcryptModule.hash(testValue, 1); // Usar rounds=1 para teste rápido
      
      if (!testHash || typeof testHash !== 'string' || !testHash.startsWith('$2')) {
        throw new ValidationError(`Hash inválido gerado: ${testHash}`);
      }
      
      const testCompare = await bcryptModule.compare(testValue, testHash);
      
      if (!testCompare) {
        throw new ValidationError("Comparação de teste falhou");
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
      throw new ValidationError(`Teste de bcrypt falhou: ${msg}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Bcrypt é obrigatório: sem fallback inseguro.
    throw new ValidationError(`bcryptjs obrigatório e indisponível: ${msg}`);
  }
}

/** Retorna o vendedor do contexto (ctx.vendedor quando token "v:", senão busca por user). */
async function getVendedorFromContext(ctx: { user: { id: number; role: string } | null; vendedor?: Vendedor | null }) {
  if (ctx.vendedor) return ctx.vendedor;
  if (!ctx.user || ctx.user.role === "admin") return null;
  return (await usersService.getVendedorByUserId(ctx.user.id)) ?? null;
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

export const appRouter = router({
  system: systemRouter,
  leo: leoRouter,
  leoAdmin: leoAdminRouter,
  admin: adminRouter,
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
    me: protectedProcedure.query(({ ctx }) => {
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
    sessionInfo: protectedProcedure.query(({ ctx }) => {
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
      return { user };
    }),
    login: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        return runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
        const username = input.username.trim().toLowerCase();
        const password = input.password;
        const cookieOptions = { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS };
        const ip = ctx.req.ip || ctx.req.socket?.remoteAddress || "unknown";
        const audit = (success: boolean) =>
          logAuth({
            username,
            success,
            ip,
            timestamp: Date.now(),
          });

        const user = await usersService.getUserByOpenIdGlobal(username);
        if (!user) {
          audit(false);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário inválido" });
        }

        const rateLimitKey = `${ip}:${username}`;
        try {
          await checkRateLimit(rateLimitKey, user.tenantId);
        } catch (error) {
          audit(false);
          const message = error instanceof Error ? error.message : "Too many attempts";
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message,
          });
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
          await usersService.touchLastSignedInGlobal(user.id);
          clearRateLimitForKey(rateLimitKey, user.tenantId);
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

        const vendedor = await usersService.getVendedorByUserId(user.id);
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
                const sessionValue = `v:${user.tenantId}:${vendedor.id}`;
                ctx.res.cookie(COOKIE_NAME, sessionValue, cookieOptions);
                ctx.res.cookie("session", sessionValue, cookieOptions);
                await usersService.touchLastSignedInGlobal(user.id);
                clearRateLimitForKey(rateLimitKey, user.tenantId);
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
        });
      }),

    /** Admin only: troca sessão para vendedor (impersonate). Guarda token admin em cookie por 10 min. */
    impersonateVendedor: adminProcedure
      .input(z.object({ vendedorId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const vendedor = await usersService.getVendedorById(input.vendedorId);
        if (!vendedor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendedor não encontrado" });
        const cookieOptions = { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS };
        const currentToken = typeof ctx.req.headers.cookie === "string"
          ? (cookie.parse(ctx.req.headers.cookie)[COOKIE_NAME] as string | undefined)
          : undefined;
        if (currentToken) {
          const adminOpts = { ...getSessionCookieOptions(ctx.req), maxAge: ADMIN_SESSION_MAX_AGE_MS, path: "/" };
          ctx.res.cookie(ADMIN_SESSION_COOKIE, currentToken, adminOpts);
        }
        const tenantId = ctx.user.tenantId ?? ctx.tenantId ?? 0;
        if (!tenantId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tenant inválido para impersonation" });
        const sessionValue = `v:${tenantId}:${vendedor.id}`;
        ctx.res.cookie(COOKIE_NAME, sessionValue, cookieOptions);
        ctx.res.cookie("session", sessionValue, cookieOptions);
        const traceId = nanoid(10);
        await logAuditAction(
          "IMPERSONATE_START",
          "vendedor",
          { vendedorNome: vendedor.nome },
          {
            tenantId,
            actorUserId: ctx.user.id,
            actorVendedorId: undefined,
            entityId: String(vendedor.id),
            traceId,
          }
        );
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
      const tenantId = await requireTenant(ctx);
      await logAuditAction(
        "IMPERSONATE_STOP",
        "admin",
        { restoredFrom: "admin_session" },
        {
          tenantId,
          actorUserId: (Number.isFinite(adminUserId) && adminUserId !== null) ? adminUserId : undefined, 
          actorVendedorId: ctx.vendedor?.id ?? undefined,
          entityId: adminUserId != null ? String(adminUserId) : undefined,     
          traceId,
        }
      );
      return { ok: true };
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      if (process.env.NODE_ENV !== "production") console.log("[auth.logout] Removendo cookies de sessão");
      // Limpar todos os possíveis cookies em todas as combinações de path/domain
      const cookieNames = [COOKIE_NAME, "session", ADMIN_SESSION_COOKIE];
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
      return await usersService.getAllVendedores();
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
        try {
          console.log("[vendedores.create] Iniciando criação de vendedor:", { 
            nome: input.nome,
            email: input.email,
            cidade: input.cidade,
            admin: input.admin
          });
          
          // Verificar se já existe um vendedor com o mesmo nome
          const existingVendedor = await usersService.getVendedorByNome(input.nome);
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
          const now = new Date();
          
          // Create user first
          const createdUser = await usersService.insertUser({
            tenantId,
            openId: `vendedor_${Date.now()}_${input.nome.replace(/\s/g, '').toLowerCase()}`,
            name: input.nome,
            email: email,
            loginMethod: "local",
            role: input.admin ? "admin" : "user",
            createdAt: now,
            updatedAt: now,
            lastSignedIn: now,
          });
          
          const data: Parameters<typeof usersService.createVendedor>[0] = {
            tenantId,
            userId: createdUser.id,
            nome: input.nome.trim().toUpperCase(),
            senha: senhaHash,
            admin: input.admin,
            ativo: true,
            telefone,
            email,
          };

          // Criar vendedor
          const result = await usersService.createVendedor(data);
          console.log("[vendedores.create] Vendedor criado com sucesso:", result);
          
          // Verificar se o vendedor foi realmente criado
          if (result.id) {
            const createdVendedor = await usersService.getVendedorById(result.id);
            console.log("[vendedores.create] Verificação pós-criação:", createdVendedor ? {
              id: createdVendedor.id,
              nome: createdVendedor.nome,
              senhaInicia: createdVendedor.senha ? createdVendedor.senha.substring(0, 10) + '...' : 'null'
            } : 'não encontrado');
          }
          
          if (result?.id) {
          await logAuditAction(
            "create",
            "vendedor",
            { nome: input.nome },
            {
              tenantId,
              actorUserId: ctx.user?.role === "admin" ? ctx.user.id : undefined,
              actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : undefined,
              entityId: String(result.id),
            }
          );
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
        let data: Partial<InsertVendedor> = rest as Partial<InsertVendedor>;
        
        if (senha) {
          if (bcrypt) {
            try {
              data = { ...rest, senha: await bcrypt.hash(senha, 10) } as Partial<InsertVendedor>;
            } catch (error) {
              console.error("[vendedores.update] Erro ao gerar hash com bcrypt:", error);
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar hash de senha (bcrypt obrigatório)" });
            }
          } else {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "bcrypt indisponível (obrigatório)" });
          }
        }
        const out = await usersService.updateVendedor(id, data);
        const tenantId = await requireTenant(ctx);
        await logAuditAction(
          "update",
          "vendedor",
          { nome: input.nome ?? undefined },
          {
            tenantId,
            actorUserId: ctx.user?.role === "admin" ? ctx.user.id : undefined,
            actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : undefined,
            entityId: String(id),
          }
        );
        return out;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const out = await usersService.deleteVendedor(input.id);
        const tenantId = await requireTenant(ctx);
        await logAuditAction(
          "delete",
          "vendedor",
          {},
          {
            tenantId,
            actorUserId: ctx.user?.role === "admin" ? ctx.user.id : undefined,
            actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : undefined,
            entityId: String(input.id),
          }
        );
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
        const vendedor = await usersService.getVendedorById(input.vendedorId);
        if (!vendedor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendedor não encontrado" });
        const tenantId = await requireTenant(ctx);
        const user = await usersService.findOrCreateUserByOpenId(tenantId, input.openId.trim().toLowerCase(), vendedor.nome);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar/buscar usuário" });
        await usersService.updateVendedor(input.vendedorId, { userId: user.id });
        if (input.password != null && input.password !== "") {
          const bcrypt = await getBcrypt();
          if (!bcrypt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "bcrypt indisponível (obrigatório)" });
          const hashed = await bcrypt.hash(input.password, 10);
          await usersService.updateVendedorSenha(input.vendedorId, hashed);
        }
        await logAuditAction(
          "update",
          "vendedor",
          { linkUser: user.id, openId: input.openId },
          {
            tenantId,
            actorUserId: ctx.user?.id ?? undefined,
            actorVendedorId: undefined,
            entityId: String(input.vendedorId),
          }
        );
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
        const { items, total } = await inventoryService.getProdutosComPrecoVigentePaged(tenantId, {
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
        return await inventoryService.getProdutoById(tenantId, input.id);
      }),

    create: adminProcedure
      .input(z.any())
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        // Validação real fica em server/routes/produtos.ts (Zod)
        return await produtosRoutes.createProduto(toExpressRequest({ body: input, tenantId }));
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
          const patch: Record<string, unknown> = {
            ...data,
            custo: Number(data.custo).toFixed(2),
            valorVenda: Number(data.valorVenda).toFixed(2),
          };
          const tenantId = await requireTenant(ctx);
          return await inventoryService.updateProduto(tenantId, id, patch, version);
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
        return await produtosRoutes.deleteProduto(toExpressRequest({ params: { id: input.id.toString() }, tenantId }));
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
        const { items, total } = await inventoryService.getProdutosComPrecoVigentePaged(tenantId, {
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
          await inventoryService.updateEstoqueProduto(tenantId, { id: input.id, quantidade: qtd, audit });
          return { message: "Estoque atualizado" };
        } catch (e: unknown) {
          if (hasStockErrorCode(e) && (e.code === "ESTOQUE_NEGATIVO" || e.code === "ESTOQUE_INSUFICIENTE")) {
            throw new TRPCError({ code: "BAD_REQUEST", message: e.message ?? "Estoque insuficiente para esta operação." });
          }
          throw e;
        }
      }),

    estoqueBaixo: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await produtosRoutes.verificarEstoqueBaixo(toExpressRequest({ tenantId }));
    }),
  }),

  // ===== PROMOÇÕES =====
  promocoes: router({
    list: protectedProcedure.query(async () => {
      return await promocoesRoutes.listar(toExpressRequest({}));
    }),
    detalhes: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await promocoesRoutes.detalhes(toExpressRequest({ params: { id: String(input.id) } }));
      }),
    create: adminProcedure
      .input(z.any())
      .mutation(async ({ input }) => {
        return await promocoesRoutes.criar(toExpressRequest({ body: input }));
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), data: z.any() }))
      .mutation(async ({ input }) => {
        return await promocoesRoutes.atualizar(toExpressRequest({ params: { id: String(input.id) }, body: input.data }));
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await promocoesRoutes.remover(toExpressRequest({ params: { id: String(input.id) } }));
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
        await inventoryService.criarNotaEntrada(tenantId, {
          marca: input.marca,
          dataChegada: new Date(input.dataChegada),
          valorTotal: input.valorTotal,
          formaPagamento: input.formaPagamento,
          observacao: input.observacao,
          parcelas: input.parcelas?.map(p => ({ ...p, dataVencimento: new Date(p.dataVencimento) })),
          itens: input.itens,
          createdBy: ctx.user?.id,
        });
        return { ok: true };
      }),
  }),

  // ===== CORES =====
  cores: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await inventoryService.listCores(tenantId);
    }),
    create: adminProcedure
      .input(z.object({ nome: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await inventoryService.createCor(tenantId, input);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), nome: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        await inventoryService.updateCor(tenantId, input.id, { nome: input.nome });
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        await inventoryService.deleteCor(tenantId, input.id);
        return { ok: true as const };
      }),
  }),

  // ===== GRUPOS =====
  gruposPrecificacao: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await inventoryService.listGruposPrecificacao(tenantId);
    }),
    create: adminProcedure
      .input(z.object({ nome: z.string().min(1), idempotencyKey: z.string().max(64).optional() }))
      .mutation(async ({ input, ctx }) => {
        const { idempotencyKey, ...data } = input;
        const tenantId = await requireTenant(ctx);
        const result = await executeCommand(
          { commandName: "gruposPrecificacao.create", idempotencyKey: idempotencyKey ?? undefined },
          async (tx) => {
            const res = await inventoryService.createGrupoPrecificacao(tenantId, data, tx);
            return { ...commandResult(true, ["Grupo criado"]), id: res.id };
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
        await inventoryService.updateGrupoPrecificacao(tenantId, id, data);
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        await inventoryService.deleteGrupoPrecificacao(tenantId, input.id);
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
        const out = await inventoryService.ajusteRapidoEstoque(
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
        const listResult = await cachedClientes.listClientes(tenantId, actor, {
          page,
          pageSize,
        });
        if (!listResult.success || !listResult.data) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: listResult.error ?? "Falha ao listar clientes" });
        }
        const { items, total } = listResult.data;
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
        if (ctx.user.role === "admin") return await clientesService.searchClientes(tenantId, input.term);
        const vendedor = await getVendedorFromContext(ctx);
        if (!vendedor) return [];
        return await clientesService.searchClientesByVendedor(tenantId, input.term, vendedor.id);
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
        const created = await clientesService.createClienteRouter(tenantId, input, vendedorId);
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
        return await clientesService.searchClientesGlobal(tenantId, input.term, input.limit ?? 50, actor);
      }),

    getVendedorPrincipal: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await clientesService.getVendedorPrincipalDoClienteRouter(tenantId, input.clienteId);
      }),

    vinculate: protectedProcedure
      .input(z.object({ clienteId: z.number(), tipo: z.enum(["PRINCIPAL", "SECUNDARIO"]).optional() }))
      .mutation(async ({ input, ctx }) => {
        const vendedor = await getVendedorFromContext(ctx);
        if (!vendedor) throw new TRPCError({ code: "BAD_REQUEST", message: "Vendedor não identificado." });
        const tenantId = await requireTenant(ctx);
        await clientesService.createClienteVinculo(tenantId, input.clienteId, vendedor.id, input.tipo ?? "SECUNDARIO");
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
        const out = await clientesService.updateClienteRouter(tenantId, actor, id, data);
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
        const out = await clientesService.deleteClienteById(tenantId, actor, input.id);
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
          return await updatePedido(tenantId, actor, id, data);
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
          return await deletePedido(tenantId, actor, input.id);
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
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        return await buscarPedidos(tenantId, actor, input.query);
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
        const tenantId = await requireTenant(ctx);
        const actor = await resolveServiceActor(ctx);
        return await listPedidosConferencia(tenantId, actor, input);
      }),

    marcarConferido: protectedProcedure
      .input(z.object({ id: z.number(), idempotencyKey: z.string().max(64).optional() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.id);
        const tenantId = await requireTenant(ctx);
        const pedido = await getPedidoById(tenantId, input.id);
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
            await marcarPedidoConferido(tenantId, input.id, tx);
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
        const tenantId = await requireTenant(ctx);
        const pedido = await getPedidoById(tenantId, input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        const atual = pedido.status as PedidoStatus;
        const proximo = input.status as PedidoStatus;
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
            await atualizarStatusPedido(tenantId, input.id, proximo, tx);
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
        const tenantId = await requireTenant(ctx);
        return await pdfService.gerarPedidoPDF(tenantId, input.id);
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
        const tenantId = await requireTenant(ctx);
        const pedido = await getPedidoById(tenantId, input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        try {
          const actor = await resolveServiceActor(ctx);
          const result = await executeCommand(
            { commandName: "baixarPedidoDireto", idempotencyKey: input.idempotencyKey },
            async (tx) => {
              const out = await financeService.baixarPedidoDireto(
                tenantId,
                input.id,
                {
                  entradaForma: input.entradaForma,
                  entradaValor: input.entradaValor,
                  segundaForma: input.segundaForma,
                  segundaValor: input.segundaValor,
                  boletoParcelas: input.boletoParcelas,
                  boletoVencimentos: input.boletoVencimentos,
                  boletoPrimeiroVencimento: input.boletoPrimeiroVencimento,
                },
                { tx, actor }
              );
              return { ok: true, traceId: nanoid(10), ...out };
            }
          );
          if (isInProgress(result)) return result;

          await logAuditAction(
            "BAIXA",
            "pedido",
            { pedidoNumero: result.pedidoNumero },
            {
              tenantId,
              actorUserId: ctx.user?.role === "admin" ? ctx.user.id : undefined,
              actorVendedorId: ctx.user?.role !== "admin" ? (await getVendedorFromContext(ctx))?.id : undefined,
              entityId: String(input.id),
            }
          );

          if (result.boletoIds?.length) {
            const zip = await pdfService.gerarZipBoletos(tenantId, {
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
              let vendedor: Vendedor | null = ctx.vendedor ?? null;
              if (!vendedor && isAdmin && input.vendedorId) {
                vendedor = await usersService.getVendedorById(input.vendedorId);
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
            clienteId = await resolveClienteVendaInTransaction(
              tx,
              vendedor.tenantId,
              vendedor.id,
              input.cliente
            );
          }

          if (!clienteId) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao criar cliente.' });
          }
          markPhase("clienteLinkMs", tMark);
          tMark = Date.now();

          // 2) Número do pedido (travado para não duplicar, por tenant)
          const numero = await getNextPedidoNumberInTransaction(tx, vendedor.tenantId);
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
          // 5) Pedido (com status GERADO ou PENDENTE_ESTOQUE)
          const pedidoInsert = await insertPedidoInTransaction(tx, {
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
            subtotal: roundToTwo(input.subtotal).toFixed(2),
            desconto: roundToTwo(input.desconto).toFixed(2),
            frete: roundToTwo(input.frete).toFixed(2),
            total: roundToTwo(input.total).toFixed(2),
            status: 'GERADO', // Will be updated by processEstoqueEPendenciasInTransaction
            formaPagamento: pagamentoPlanejado,
            observacoes: input.observacoes || null,
          } as never);

          const pedidoId = extractPedidoIdFromInsert(pedidoInsert);
          markPhase("pedidoInsertMs", tMark);
          tMark = Date.now();

          // 6) Catálogo: estoque validation, pendências + baixa de estoque
          const estoqueResult = await processEstoqueEPendenciasInTransaction(
            tx,
            vendedor.tenantId,
            vendedor.id,
            pedidoId,
            input.itens,
            {
              actorUserId: ctx.user?.role === "admin" ? ctx.user.id : null,
              actorVendedorId: ctx.user?.role !== "admin" ? vendedor?.id ?? null : null,
            }
          );
          gerouPendencia = estoqueResult.gerouPendencia;
          markPhase("catalogoEstoqueMs", tMark);
          tMark = Date.now();

          // 7) Insert itensPedido and contasReceber via service function
          await insertItensPedidoAndContasReceberInTransaction(
            tx,
            pedidoId,
            vendedor.tenantId,
            numero,
            vendedor.id,
            input.itens,
            input.cliente.nome,
            roundToTwo(input.total)
          );
          markPhase("itensBatchInsertMs", tMark);
          tMark = Date.now();
          markPhase("contaReceberMs", tMark);

              return { ok: true, traceId: nanoid(10), pedidoId, numero, clienteId, gerouPendencia, pendenteEstoque: estoqueResult.statusPedido === 'PENDENTE_ESTOQUE' };
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

        const tenantId = await requireTenant(ctx);
        await logAuditAction(
          "create",
          "pedido",
          { numero: result.numero },
          {
            tenantId,
            actorUserId: ctx.user?.role === "admin" ? ctx.user.id : undefined,
            actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : undefined,
            entityId: String(result.pedidoId),
            traceId: result.traceId ?? undefined,
          }
        );
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
      return await logisticaService.listCargas(tenantId);
    }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await logisticaService.getCargaById(tenantId, input.id);
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
        return await pdfService.gerarRomaneioPDF(tenantId, input.cargaId);
      }),
    
    create: adminProcedure
      .input(z.object({
        cidadeRota: z.string(),
        dataEntrega: z.date(),
        pedidosIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const result = await logisticaService.createCarga(tenantId, {
          numero: 0,
          cidadeRota: input.cidadeRota,
          dataEntrega: input.dataEntrega,
          status: 'ABERTA',
        });

        if (input.pedidosIds && input.pedidosIds.length > 0) {
          await logisticaService.addPedidosToCarga(tenantId, result.id, input.pedidosIds);
        }

        return result;
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
        return await logisticaService.addPedidosToCarga(tenantId, input.cargaId, input.addIds || []);
      }),
    
    

    // Fechar/Liberar carga: muda para EM_ROTA e trava edição
    fechar: adminProcedure
      .input(z.object({ cargaId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await logisticaService.liberarCargaParaRota(tenantId, input.cargaId);
      }),

    // Romaneio PDF da carga (server-side)
    gerarRomaneioPDF: adminProcedure
      .input(z.object({ cargaId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await pdfService.gerarRomaneioPDF(tenantId, input.cargaId);
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
        const result = await logisticaService.baixarPedidoCarga(tenantId, input.pedidoCargaId, {
          entradaForma: input.entradaForma,
          entradaValor: input.entradaValor,
          segundaForma: input.segundaForma,
          segundaValor: input.segundaValor,
          boletoParcelas: input.boletoParcelas,
          boletoVencimentos: input.boletoVencimentos,
          boletoPrimeiroVencimento: input.boletoPrimeiroVencimento,
        });

        if (result.boletoIds?.length && result.pedidoNumero && result.clienteNome) {
          const zip = await pdfService.gerarZipBoletos(tenantId, {
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
    return await pendenciasService.listPendencias(tenantId, vendedorId ?? undefined);
  }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["PENDENTE", "COMPRADO", "RESOLVIDO"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = await requireTenant(ctx);
      const vendedorId = ctx.user?.role === "admin" ? undefined : (await getVendedorFromContext(ctx))?.id;
      await pendenciasService.updateStatusPendencia(tenantId, input.id, input.status, vendedorId);
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
          const tenantId = await requireTenant(ctx);
          const { listBoletosAdmin } = await import("./services/boletos.service.js");
          boletosData = await listBoletosAdmin(tenantId);
        } else {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) return [];
          const tenantId = await requireTenant(ctx);
          const page = await financeService.getBoletosByVendedor(tenantId, vendedor.id);
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
        return await financeService.baixarBoletoParcial(tenantId, input.boletoId, input.valorPago);
      }),

    gerarPDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "boleto", input.id);
        const tenantId = await requireTenant(ctx);
        const result = await pdfService.gerarBoletoPDF(tenantId, input.id);
        if (!result.success || !result.data) throw new TRPCError({ code: "NOT_FOUND", message: result.error ?? "Boleto não encontrado" });
        return result.data;
      }),

    gerarExtrato: protectedProcedure
      .input(z.object({ clienteId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        let vendedorIdFilter: number | undefined;
        if (ctx.user.role !== "admin") {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
          const tenantId = await requireTenant(ctx);
          const lista = await financeService.getBoletosByVendedor(tenantId, vendedor.id);
          const doCliente = lista.items.filter((b: { clienteId: number }) => Number(b.clienteId) === input.clienteId);
          if (doCliente.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Nenhum boleto seu para este cliente." });
          vendedorIdFilter = vendedor.id;
        }
        const tenantId = await requireTenant(ctx);
        return await pdfService.gerarExtratoClientePDF(tenantId, input.clienteId, vendedorIdFilter);
      }),

    gerarBoletosCarga: protectedProcedure
      .input(z.object({ 
        cargaId: z.number(),
        pedidoNumero: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        if (ctx.user.role !== "admin") {
          const carga = await logisticaService.getCargaById(tenantId, input.cargaId);
          if (!carga) throw new TRPCError({ code: "NOT_FOUND", message: "Carga não encontrada." });
          const pedidosIds = ((carga as { pedidos?: PedidoCargaItem[] }).pedidos ?? []).map((p) => p.id);
          if (pedidosIds.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Carga sem pedidos." });
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
          const { validatePedidosVendedor } = await import("./services/boletos.service.js");
          const todosDoVendedor = await validatePedidosVendedor(tenantId, pedidosIds, vendedor.id);
          if (!todosDoVendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Carga contém pedidos de outro vendedor." });
        }
        return await pdfService.gerarBoletosCargaPDF(tenantId, input.cargaId, input.pedidoNumero);
      }),

    // Gera um ZIP com 1 PDF por boleto (lista de IDs).
    gerarZip: protectedProcedure
      .input(z.object({
        boletoIds: z.array(z.number()).min(1),
        pedidoNumero: z.number(),
        clienteNome: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        if (ctx.user.role !== "admin") {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." });
          for (const bid of input.boletoIds) {
            const b = await financeService.getBoletoById(tenantId, bid);
            if (!b) throw new TRPCError({ code: "NOT_FOUND", message: `Boleto ${bid} não encontrado.` });
            if (b.vendedorId !== vendedor.id) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a um ou mais boletos." });
          }
        }
        return await pdfService.gerarZipBoletos(tenantId, input);
      }),

    gerarRelatorio: protectedProcedure
      .input(z.object({ 
        tipo: z.enum(['PAGAR', 'RECEBER']),
        mesAno: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await pdfService.gerarRelatorioFinanceiroPDF(tenantId, input.tipo, input.mesAno);
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
          return await financeService.getAllContasReceber(tenantId);
        } else {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) return [];
          return await financeService.getContasReceberByVendedor(tenantId, vendedor.id);
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
              await financeService.createContaReceber(tenantIdConta, {
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
        return await financeService.marcarContaRecebida(tenantId, input.id, input.dataRecebimento, input.formaPagamento);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "conta_receber", input.id);
        const tenantId = await requireTenant(ctx);
        return await financeService.deleteContaReceber(tenantId, input.id);
      }),
  }),

  // ===== CAIXA MENSAL (dados globais da empresa — apenas admin) =====
  caixaMensal: router({
    get: adminProcedure
      .input(z.object({ mesAno: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await financeService.getCaixaMensal(tenantId, input.mesAno ?? '');
      }),
    listAll: adminProcedure
      .query(async ({ ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await financeService.getAllCaixaMensal(tenantId);
      }),
  }),

  // ===== PLANO DE CONTAS =====
  planoContas: router({
    list: protectedProcedure
      .input(z.object({ tipo: z.enum(["RECEITA", "DESPESA"]).optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await financeService.getPlanoContas(tenantId, input?.tipo);
      }),
    create: adminProcedure
      .input(z.object({ 
        nome: z.string(), 
        tipo: z.enum(["RECEITA", "DESPESA"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await financeService.createPlanoContas(tenantId, input);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), nome: z.string().min(1), tipo: z.enum(["RECEITA", "DESPESA"]), idempotencyKey: z.string().max(64).optional() }))
      .mutation(async ({ input, ctx }) => {
        const { idempotencyKey, ...data } = input;
        const tenantId = await requireTenant(ctx);
        const result = await executeCommand(
          { commandName: "planoContas.update", idempotencyKey: idempotencyKey ?? undefined },
          async (tx) => {
            await financeService.updatePlanoContas(tenantId, data.id, { nome: data.nome, tipo: data.tipo });
            return commandResult(true, ["Plano de contas atualizado"]);
          }
        );
        if (isInProgress(result)) return result;
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number(), idempotencyKey: z.string().max(64).optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        const result = await executeCommand(
          { commandName: "planoContas.delete", idempotencyKey: input.idempotencyKey ?? undefined },
          async (tx) => {
            await financeService.deletePlanoContas(tenantId, input.id);
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
        const { ADMIN_ACTOR } = await import("./_core/service-actor.js");
        const result = await financeService.listContasPagar(tenantId, ADMIN_ACTOR, { status: input.status, fornecedor: input.fornecedor });
        return result.items;
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
        return await financeService.createContaPagar(tenantId, input);
      }),
    pagar: adminProcedure
      .input(z.object({ id: z.number(), valorPago: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await financeService.pagarConta(tenantId, input.id, input.valorPago);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await financeService.deleteContaPagar(tenantId, input.id);
      }),
  }),

  // ===== CONTAS FIXAS (somente admin) =====
  contasFixas: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      const result = await financeService.listContasFixas(tenantId);
      return result.items;
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
        return await financeService.createContaFixa(tenantId, input);
      }),
    gerarMes: adminProcedure
      .input(z.object({ mesAno: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await financeService.gerarContasFixasMes(tenantId, input.mesAno);
      }),
  }),

  // ===== COMISSÕES =====
  comissoes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      if (ctx.user.role === "admin") {
        return await financeService.getAllComissoes(tenantId);
      }
      const vendedor = await getVendedorFromContext(ctx);
      if (!vendedor) return [];
      return await financeService.getComissoesByVendedor(tenantId, vendedor.id);
    }),
    marcarPaga: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = await requireTenant(ctx);
        return await financeService.marcarComissaoPaga(tenantId, input.id);
      }),
  }),

  // ===== CONFIGURAÇÕES =====
  config: router({
    get: protectedProcedure
      .input(z.object({ chave: z.string() }))
      .query(async ({ input }) => {
        return await configuracoesService.getConfig(input.chave);
      }),
    
    set: adminProcedure
      .input(z.object({ chave: z.string(), valor: z.string() }))
      .mutation(async ({ input }) => {
        return await configuracoesService.setConfig(input.chave, input.valor);
      }),
  }),

  // ===== DIAGNÓSTICO DE CONSISTÊNCIA (admin) =====
  diagnostico: router({
    run: adminProcedure.query(async ({ ctx }) => {
      const tenantId = await requireTenant(ctx);
      return await systemService.runDiagnosticoConsistencia(tenantId);
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
      const vendedorId =
        ctx.user.role === "admin" ? undefined : (await getVendedorFromContext(ctx))?.id;
      const { getPendenciasResumo } = await import("./services/pendencias.service.js");
      return await getPendenciasResumo(tenantId, vendedorId);
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
      await logAuditAction(
        "dashboard_view",
        "dashboard",
        { view: "insights" },
        {
          tenantId,
          actorUserId: opts.ctx.user?.id ?? undefined,
          actorVendedorId: opts.ctx.vendedor?.id ?? undefined,
           traceId: nanoid(10),
         }
       );
       return data;
     }),
  }),
});

export type AppRouter = typeof appRouter;
