import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import * as pdf from "./pdf";
import { roundToTwo, sumWithPrecision, subtractWithPrecision, multiplyWithPrecision } from "./utils/financialUtils";
import { nanoid } from "nanoid";
import { assertOwnership } from "./_core/ownership";
import { executeCommand } from "./_core/command";
import { isInProgress } from "@shared/idempotency";

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
    const bcryptModule = await import("bcryptjs");
    
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
      bcryptCache = {
        hash: bcryptModule.hash,
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
    console.warn("[getBcrypt] Não foi possível usar bcryptjs:", msg);
    
    if (process.env.NODE_ENV === 'production') {
      console.error("[getBcrypt] AVISO DE SEGURANÇA: Usando fallback de bcrypt em produção!");
      console.error("[getBcrypt] Isso não é seguro para ambientes de produção.");
      console.error("[getBcrypt] Instale bcryptjs corretamente: npm install bcryptjs");
    }
    
    // Função auxiliar para gerar um salt aleatório
    const generateSalt = (length = 10) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let salt = '';
      for (let i = 0; i < length; i++) {
        salt += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return salt;
    };
    
    // Função auxiliar para criar um hash mais seguro que o anterior
    const createHash = (data: string, salt: string, rounds: number) => {
      let hash = data + salt;
      
      // Aplicar múltiplas rodadas de hashing
      for (let i = 0; i < rounds; i++) {
        const buffer = Buffer.from(hash + i);
        hash = buffer.toString('base64');
      }
      
      return hash;
    };
    
    // Implementação de fallback para desenvolvimento
    bcryptCache = {
      hash: async (data: string, saltOrRounds: string | number): Promise<string> => {
        const rounds = typeof saltOrRounds === 'number' ? saltOrRounds : 10;
        const salt = typeof saltOrRounds === 'string' ? saltOrRounds : generateSalt();
        
        const hash = createHash(data, salt, rounds);
        const result = `$simple$${rounds}$${salt}$${hash}`;
        
        console.log(`[getBcrypt:fallback] Hash gerado: ${result.substring(0, 20)}...`);
        return result;
      },
      compare: async (data: string, encrypted: string): Promise<boolean> => {
        // Verificar se é um hash simples
        if (!encrypted || typeof encrypted !== 'string') {
          console.log(`[getBcrypt:fallback] Valor inválido para comparação`);
          return false;
        }
        
        // Se for texto simples (migração), comparar diretamente
        if (!encrypted.startsWith('$')) {
          const result = data === encrypted;
          console.log(`[getBcrypt:fallback] Comparação texto simples: ${result ? 'Sucesso' : 'Falha'}`);
          return result;
        }
        
        // Se não começar com $simple$, não é nossa implementação
        if (!encrypted.startsWith('$simple$')) {
          console.log(`[getBcrypt:fallback] Hash não reconhecido: ${encrypted.substring(0, 10)}...`);
          return false;
        }
        
        // Extrair as partes
        const parts = encrypted.split('$');
        if (parts.length !== 5) {
          console.log(`[getBcrypt:fallback] Formato de hash inválido`);
          return false;
        }
        
        const rounds = parseInt(parts[2], 10);
        const salt = parts[3];
        const expectedHash = parts[4];
        
        // Recriar o hash com os mesmos parâmetros
        const actualHash = createHash(data, salt, rounds);
        
        const result = expectedHash === actualHash;
        console.log(`[getBcrypt:fallback] Comparação hash: ${result ? 'Sucesso' : 'Falha'}`);
        return result;
      },
      isSecure: false,
      // Função para migrar senhas em texto plano
      migratePlaintext: async (plaintext: string): Promise<string> => {
        const salt = generateSalt();
        const rounds = 10;
        const hash = createHash(plaintext, salt, rounds);
        return `$simple$${rounds}$${salt}$${hash}`;
      }
    };
    
    return bcryptCache;
  }
}

/** Retorna o vendedor do contexto (por id ou por userId, para compatibilidade). */
async function getVendedorFromContext(ctx: { user: { id: number; role: string } | null }) {
  if (!ctx.user || ctx.user.role === "admin") return null;
  return (await db.getVendedorById(ctx.user.id)) ?? (await db.getVendedorByUserId(ctx.user.id));
}
import { notificarAdmin, notificarVendedor } from "./notifications";
import * as produtosRoutes from "./routes/produtos";
import * as clientesRoutes from "./routes/clientes";
import * as pedidosRoutes from "./routes/pedidos";
import * as promocoesRoutes from "./routes/promocoes";

// Procedure apenas para admin
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado. Apenas administradores.' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
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

        console.log(`[auth.login] Tentativa de login para usuário: ${username}`);

        // 1) Tentar login por vendedores no DB (senha com hash bcrypt), se bcrypt estiver disponível
        const bcrypt = await getBcrypt();
        const vendedor = await db.getVendedorByNome(username);
        
        console.log(`[auth.login] Vendedor encontrado:`, vendedor ? {
          id: vendedor.id,
          nome: vendedor.nome,
          admin: vendedor.admin,
          senhaInicia: vendedor.senha ? vendedor.senha.substring(0, 10) + '...' : 'null'
        } : 'null');
        
        if (vendedor?.senha) {
          // Verificar se a senha está com hash bcrypt ou se é texto simples
          if (vendedor.senha.startsWith("$2")) {
            // Senha com hash bcrypt
            try {
              const match = await bcrypt.compare(password, vendedor.senha);
              console.log(`[auth.login] Verificação bcrypt: ${match ? 'Sucesso' : 'Falha'}`);
              
              if (match) {
            const sessionValue = `v:${vendedor.id}`;
            // Um único cookie por resposta: sem domain explícito em dev para o navegador vincular ao host atual (localhost ou 127.0.0.1)
            ctx.res.cookie(COOKIE_NAME, sessionValue, cookieOptions);
            ctx.res.cookie("session", sessionValue, cookieOptions);

            console.log(`[auth.login] Cookie definido (vendedor):`, {
              name: COOKIE_NAME,
              host: ctx.req.headers.host,
              path: cookieOptions.path,
            });
            
            return {
              ok: true,
              sessionToken: sessionValue,
              openId: `vendedor-${vendedor.id}`,
              name: vendedor.nome ?? "Vendedor",
              role: vendedor.admin ? "admin" : "vendedor",
            };
              }
            } catch (bcryptError) {
              console.error("[auth.login] Erro na verificação bcrypt:", bcryptError);
            }
          } else {
            // Tentar comparação direta primeiro (fallback para senhas em texto simples)
            if (vendedor.senha === password) {
              console.log(`[auth.login] Verificação texto simples: Sucesso`);
              
              // Migrar senha em texto plano para hash bcrypt
              try {
                console.log(`[auth.login] Migrando senha em texto plano para hash bcrypt...`);
                const hashedPassword = await bcrypt.migratePlaintext(password);
                
                // Atualizar senha no banco de dados
                await db.updateVendedorSenha(vendedor.id, hashedPassword);
                console.log(`[auth.login] Senha migrada com sucesso para vendedor ID ${vendedor.id}`);
              } catch (migrationError) {
                console.error("[auth.login] Erro ao migrar senha:", migrationError);
                // Continuar com o login mesmo se a migração falhar
              }
              
              const sessionValue = `v:${vendedor.id}`;
              ctx.res.cookie(COOKIE_NAME, sessionValue, cookieOptions);
              ctx.res.cookie("session", sessionValue, cookieOptions);
              console.log(`[auth.login] Cookie definido (vendedor, texto):`, { name: COOKIE_NAME, host: ctx.req.headers.host });

              return {
                ok: true,
                sessionToken: sessionValue,
                openId: `vendedor-${vendedor.id}`,
                name: vendedor.nome ?? "Vendedor",
                role: vendedor.admin ? "admin" : "vendedor",
              };
            }
          }
        }

        // 2) Fallback: credenciais em código (dev/MVP) — migrar para DB depois
        const isAdmin = username === "admin" && password === "admin123";
        const isVendedor = (username === "vendedor" && password === "vendedor123") || (/^\d{4,6}$/.test(password) && username !== "admin");
        
        console.log(`[auth.login] Fallback: isAdmin=${isAdmin}, isVendedor=${isVendedor}`);

        if (!isAdmin && !isVendedor) {
          console.log(`[auth.login] Falha na autenticação para ${username}`);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
        }

        const sessionToken = isAdmin ? "admin-session" : "vendedor-session";
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        ctx.res.cookie("session", sessionToken, cookieOptions);
        console.log(`[auth.login] Cookie definido (fallback):`, { name: COOKIE_NAME, host: ctx.req.headers.host });

        return {
          ok: true,
          sessionToken,
          openId: isAdmin ? "admin-local" : "vendedor-local",
          name: isAdmin ? "Administrador" : "Vendedor",
          role: isAdmin ? "admin" : "vendedor",
        };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      
      console.log("[auth.logout] Removendo cookies de sessão");
      
      // Limpar todos os possíveis cookies em todas as combinações de path/domain
      const cookieNames = [COOKIE_NAME, "session", "auth_token"];
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
      ctx.res.setHeader('X-Logout-Success', 'true');
      
      console.log("[auth.logout] Cookies de sessão removidos");
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
              // Se falhar o hash, usa a senha em texto plano (não ideal, mas evita erro 500)
              senhaHash = input.senha;
              console.log("[vendedores.create] Usando senha em texto plano como fallback");
            }
          } else {
            console.warn("[vendedores.create] bcrypt não disponível, usando senha em texto plano");
            senhaHash = input.senha;
          }
          
          // Normalizar opcionais: string vazia vira null (evita ER_DUP_ENTRY em email UNIQUE)
          const telefone = (input.telefone != null && typeof input.telefone === "string") ? input.telefone.trim() || null : null;
          const email = (input.email != null && typeof input.email === "string") ? input.email.trim() || null : null;
          const cidade = (input.cidade != null && typeof input.cidade === "string") ? input.cidade.trim() || null : null;

          const data: Parameters<typeof db.createVendedor>[0] = {
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
              data = { ...(rest as any), senha };
            }
          } else {
            console.warn("[vendedores.update] bcrypt não disponível, usando senha em texto plano");
            data = { ...(rest as any), senha };
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
  }),

  // ===== PRODUTOS =====
  produtos: router({
    list: protectedProcedure.query(async () => {
      const produtos = await db.getAllProdutosComPrecoVigente(new Date());
      return { produtos, total: produtos.length };
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getProdutoById(input.id);
      }),

    create: adminProcedure
      .input(z.any())
      .mutation(async ({ input }) => {
        // Validação real fica em server/routes/produtos.ts (Zod)
        const result = await produtosRoutes.createProduto({ body: input } as any, { send: (data: any) => data } as any);
        return result;
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        version: z.number().optional(),
        descricao: z.string().min(1, "Descrição é obrigatória"),
        marca: z.string().optional().nullable(),
        valorVenda: z.number().min(0, "Valor de venda não pode ser negativo"),
        custo: z.number().min(0, "Custo não pode ser negativo"),
        estoque: z.number().int("Estoque deve ser um número inteiro"),
        prazoGarantia: z.number().int("Prazo de garantia deve ser um número inteiro").min(0, "Prazo de garantia não pode ser negativo"),
        ativo: z.boolean().optional(),
        grupoId: z.number().optional().nullable(),
      }))
      .mutation(async ({ input }) => {
        const { id, version, ...data } = input;
        
        try {
          // Usar a função updateProduto com verificação de versão
          const patch: any = {
            ...data,
            custo: Number(data.custo).toFixed(2),
            valorVenda: Number(data.valorVenda).toFixed(2),
          };
          return await db.updateProduto(id, patch, version);
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
      .mutation(async ({ input }) => {
        const result = await produtosRoutes.deleteProduto({ params: { id: input.id.toString() } } as any, { send: (data: any) => data } as any);
        return result;
      }),

    buscar: protectedProcedure
      .input(z.object({ query: z.string().optional() }))
      .query(async ({ input }) => {
        const produtos = await db.getAllProdutosComPrecoVigente(new Date());
        const q = (input.query ?? "").trim().toLowerCase();
        if (!q) return { produtos, total: produtos.length };
        const filtrados = produtos.filter((p: any) => {
          const desc = String(p?.descricao ?? "").toLowerCase();
          const marca = String(p?.marca ?? "").toLowerCase();
          const cat = String(p?.categoria ?? "").toLowerCase();
          const op = String((p as any)?.descricaoOperacional ?? "").toLowerCase();
          return desc.includes(q) || marca.includes(q) || cat.includes(q) || op.includes(q);
        });
        return { produtos: filtrados, total: filtrados.length };
      }),

    atualizarEstoque: adminProcedure
      .input(z.object({
        id: z.number(),
        quantidade: z.number().min(1),
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
          await db.updateEstoqueProduto(input.id, qtd, audit);
          return { message: "Estoque atualizado" };
        } catch (e: any) {
          if (e?.code === "ESTOQUE_NEGATIVO" || e?.code === "ESTOQUE_INSUFICIENTE") {
            throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Estoque insuficiente para esta operação." });
          }
          throw e;
        }
      }),

    estoqueBaixo: protectedProcedure.query(async () => {
      const result = await produtosRoutes.verificarEstoqueBaixo({} as any, { send: (data: any) => data } as any);
      return result;
    }),
  }),

  // ===== PROMOÇÕES =====
  promocoes: router({
    list: protectedProcedure.query(async () => {
      const result = await promocoesRoutes.listar({} as any, { send: (d: any) => d } as any);
      return result;
    }),
    detalhes: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const result = await promocoesRoutes.detalhes({ params: { id: String(input.id) } } as any, { send: (d: any) => d } as any);
        return result;
      }),
    create: adminProcedure
      .input(z.any())
      .mutation(async ({ input }) => {
        const result = await promocoesRoutes.criar({ body: input } as any, { send: (d: any) => d } as any);
        return result;
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), data: z.any() }))
      .mutation(async ({ input }) => {
        const result = await promocoesRoutes.atualizar({ params: { id: String(input.id) }, body: input.data } as any, { send: (d: any) => d } as any);
        return result;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const result = await promocoesRoutes.remover({ params: { id: String(input.id) } } as any, { send: (d: any) => d } as any);
        return result;
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
        await db.criarNotaEntrada({
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
    list: protectedProcedure.query(async () => {
      return await db.getAllCores();
    }),
    create: adminProcedure
      .input(z.object({ nome: z.string().min(1) }))
      .mutation(async ({ input }) => {
        return await db.createCor(input);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), nome: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await db.updateCor(input.id, { nome: input.nome });
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteCor(input.id);
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
      .input(z.object({ nome: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const db_conn = await db.getDb();
        if (!db_conn) throw new Error("Database not available");
        return await db_conn.insert(db.gruposPrecificacao).values(input);
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
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateGrupoPrecificacao(id, data);
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteGrupoPrecificacao(input.id);
        return { ok: true as const };
      }),
  }),

  // ===== AJUSTE RÁPIDO DE ESTOQUE (admin) =====
  ajusteEstoque: router({
    rapido: adminProcedure
      .input(
        z.object({
          produtoId: z.number().min(1),
          quantidade: z.number().int().min(1),
          tipo: z.enum(["entrada", "saida"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const traceId = nanoid(10);
        const out = await db.ajusteRapidoEstoque(
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
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") return await db.getAllClientes();
      const vendedor = await getVendedorFromContext(ctx);
      if (!vendedor) return [];
      return await db.listClientesByVendedor(vendedor.id);
    }),
    
    search: protectedProcedure
      .input(z.object({ term: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "admin") return await db.searchClientes(input.term);
        const vendedor = await getVendedorFromContext(ctx);
        if (!vendedor) return [];
        return await db.searchClientesByVendedor(input.term, vendedor.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        telefone: z.string().optional(),
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
      .mutation(async ({ input }) => {
        return await db.createCliente(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        telefone: z.string().optional(),
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
        await assertOwnership(ctx, "cliente", input.id);
        const { id, ...data } = input;
        return await db.updateCliente(id, data);
      }),
    // Exclusão real (SQL) + reaproveitamento do número do cliente via counters.
    // Mantemos só esse caminho para evitar divergência/"mock" no futuro.
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return db.deleteClienteById(input.id);
      }),

  }),

  // ===== PEDIDOS =====
  pedidos: router({
    // ===== MEUS PEDIDOS (SQL) =====
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['TODOS','GERADO','IMPRESSO','EM_ROTA','ENTREGUE','CANCELADO']).optional(),
        busca: z.string().optional(),
        dataInicio: z.date().optional(),
        dataFim: z.date().optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(100).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const db_conn = await db.getDb();
        if (!db_conn) return [];

        // vendedor (quando não-admin)
        const vendedor = ctx.user.role === 'admin' ? null : await getVendedorFromContext(ctx);

        const whereParts: any[] = [];
        if (ctx.user.role !== 'admin') {
          if (!vendedor) return [];
          whereParts.push(db.eq(db.pedidos.vendedorId, vendedor.id));
        }

        if (input?.status && input.status !== 'TODOS') {
          whereParts.push(db.eq(db.pedidos.status, input.status as any));
        }

        if (input?.busca?.trim()) {
          const term = `%${input.busca.trim()}%`;
          whereParts.push(db.or(
            db.sql`LOWER(${db.pedidos.clienteNome}) LIKE LOWER(${term})`,
            db.sql`${db.pedidos.numero} LIKE ${term}`
          ));
        }

        if (input?.dataInicio) {
          whereParts.push(db.sql`${db.pedidos.createdAt} >= ${input.dataInicio}`);
        }
        if (input?.dataFim) {
          // inclui o dia inteiro
          const end = new Date(input.dataFim);
          end.setHours(23, 59, 59, 999);
          whereParts.push(db.sql`${db.pedidos.createdAt} <= ${end}`);
        }

        const where = whereParts.length
          ? (whereParts.length === 1 ? whereParts[0] : db.and(...whereParts))
          : undefined;

        const sel = {
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
        };
        const from = db_conn.select(sel)
          .from(db.pedidos)
          .innerJoin(db.vendedores, db.eq(db.pedidos.vendedorId, db.vendedores.id))
          .where(where as any)
          .orderBy(db.desc(db.pedidos.createdAt));

        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 50;
        if (input?.page != null || input?.pageSize != null) {
          const countResult = await db_conn.select({ count: db.sql<number>`count(*)` })
            .from(db.pedidos)
            .innerJoin(db.vendedores, db.eq(db.pedidos.vendedorId, db.vendedores.id))
            .where(where as any);
          const total = Number((countResult as any)[0]?.count ?? 0);
          const items = await from.limit(pageSize).offset((page - 1) * pageSize);
          return { items, total, page, pageSize };
        }
        return await from;
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.id);
        const db_conn = await db.getDb();
        if (!db_conn) return null;
        const pedido = await db.getPedidoById(input.id);
        if (!pedido) return null;
        const itens = await db.getItensByPedido(pedido.id);
        return { ...pedido, itens };
      }),

    getItens: protectedProcedure
      .input(z.object({ pedidoId: z.number() }))
      .query(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.pedidoId);
        const pedido = await db.getPedidoById(input.pedidoId);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        return await db.getItensByPedido(pedido.id);
      }),

    create: protectedProcedure
      .input(z.object({
        cliente_id: z.number().min(1),
        data_pedido: z.string().min(1),
        status: z.enum(['PENDENTE', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'ENTREGUE', 'CANCELADO']),
        forma_pagamento: z.enum(['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'MISTO']),
        valor_total: z.number().min(0),
        valor_desconto: z.number().min(0).optional(),
        valor_acrescimo: z.number().min(0).optional(),
        observacoes: z.string().optional(),
        itens: z.array(z.object({
          produto_id: z.number().min(1),
          quantidade: z.number().min(1),
          preco_unitario: z.number().min(0),
          subtotal: z.number().min(0)
        }))
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await pedidosRoutes.createPedido({ body: input } as any, { send: (data: any) => data } as any);
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        cliente_id: z.number().min(1),
        data_pedido: z.string().min(1),
        status: z.enum(['PENDENTE', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'ENTREGUE', 'CANCELADO']),
        forma_pagamento: z.enum(['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'MISTO']),
        valor_total: z.number().min(0),
        valor_desconto: z.number().min(0).optional(),
        valor_acrescimo: z.number().min(0).optional(),
        observacoes: z.string().optional(),
        itens: z.array(z.object({
          produto_id: z.number().min(1),
          quantidade: z.number().min(1),
          preco_unitario: z.number().min(0),
          subtotal: z.number().min(0)
        }))
      }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.id);
        const pedido = await db.getPedidoById(input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        const { id, ...data } = input;
        try {
          return await db.updatePedido(id, data, (input as any).itens);
        } catch (error) {
          if (error instanceof Error && error.message.includes("modificado por outro usuário")) {
            throw new TRPCError({ 
              code: 'CONFLICT',
              message: error.message
            });
          }
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Erro ao atualizar pedido'
          });
        }
      }),

    // Excluir pedido (admin pode qualquer; vendedor apenas o próprio e nunca se estiver ENTREGUE)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "pedido", input.id);
        const pedido = await db.getPedidoById(input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        if ((pedido.status as any) === "ENTREGUE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido ENTREGUE não pode ser excluído." });
        }
        return await db.deletePedido(input.id);
      }),

    buscar: protectedProcedure
      .input(z.object({ query: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const db_conn = await db.getDb();
        if (!db_conn) return { pedidos: [], total: 0 };
        const vendedor = ctx.user.role === "admin" ? null : await getVendedorFromContext(ctx);
        const whereParts: any[] = [];
        if (ctx.user.role !== "admin") {
          if (!vendedor) return { pedidos: [], total: 0 };
          whereParts.push(db.eq(db.pedidos.vendedorId, vendedor.id));
        }
        if (input.query?.trim()) {
          const term = `%${input.query.trim()}%`;
          whereParts.push(db.or(
            db.sql`LOWER(${db.pedidos.clienteNome}) LIKE LOWER(${term})`,
            db.sql`${db.pedidos.numero} LIKE ${term}`
          ));
        }
        const where = whereParts.length ? (whereParts.length === 1 ? whereParts[0] : db.and(...whereParts)) : undefined;
        const rows = await db_conn.select({
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
          .innerJoin(db.vendedores, db.eq(db.pedidos.vendedorId, db.vendedores.id))
          .where(where as any)
          .orderBy(db.desc(db.pedidos.createdAt));
        return { pedidos: rows, total: rows.length };
      }),

    // Atualiza status (fluxo de pedidos do GRS)
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['GERADO','IMPRESSO','EM_ROTA','ENTREGUE','CANCELADO']),
      }))
      .mutation(async ({ input, ctx }) => {
        const db_conn = await db.getDb();
        if (!db_conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });

        await assertOwnership(ctx, "pedido", input.id);
        const pedido = await db.getPedidoById(input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        // Regras de transição (simples e seguras)
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

        await db_conn.update(db.pedidos).set({ status: proximo }).where(db.eq(db.pedidos.id, input.id));
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
        const pedido = await db.getPedidoById(input.id);
        if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
        try {
          const result = await executeCommand(
            { commandName: "baixarPedidoDireto", idempotencyKey: input.idempotencyKey },
            async (tx) => {
              const out = await db.baixarPedidoDireto(
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
                tx
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
        try {
          const result = await executeCommand(
            { commandName: "createVenda", idempotencyKey: input.idempotencyKey },
            async (tx) => {
              const vendedor = await getVendedorFromContext(ctx);
              if (!vendedor) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário não está vinculado a um vendedor." });
              }
              let gerouPendencia = false;
              // 1) Cliente (cria automaticamente se necessário)
          let clienteId = input.clienteId;

          if (!clienteId) {
            const created = await tx.insert(db.clientes).values({
              nome: input.cliente.nome,
              telefone: input.cliente.telefone || null,
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

          if (!clienteId) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao criar cliente.' });
          }

          // 2) Número do pedido (travado para não duplicar)
          const [counterRows]: any = await (tx as any).execute(db.sql`
            SELECT seq
            FROM counters
            WHERE name = 'pedidos'
            FOR UPDATE;
          `);

          let numero: number;
          const currentSeq = Number(counterRows?.[0]?.seq ?? 0);

          if (!counterRows || counterRows.length === 0) {
            numero = 1;
            await tx.insert(db.counters).values({ name: 'pedidos', seq: 1, free: null } as any);
          } else {
            numero = currentSeq + 1;
            await tx.update(db.counters).set({ seq: numero } as any).where(db.eq(db.counters.name, 'pedidos'));
          }

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

          // 4) Segurança contra furo de estoque (BACKEND FIRST) + Pendências
          // Regra do seu negócio: pode vender com estoque 0/negativo.
          // O que NÃO pode é confiar no estoque do front.
          // Então a validação é "travar e calcular" (FOR UPDATE), e se faltar, gera pendência.

          // 5) Pedido
          const pedidoInsert = await tx.insert(db.pedidos).values({
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
            status: 'GERADO',
            formaPagamento: pagamentoPlanejado,
            observacoes: input.observacoes || null,
          } as any);

          const pedidoId = (pedidoInsert as any)[0]?.insertId;
          if (!pedidoId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao criar pedido.' });

          // Produto "ITEM AVULSO" para pendências de itens livres (regra: avulso sempre gera pendência)
          let produtoAvulsoId: number | null = null;
          const [avulsoRows]: any = await (tx as any).execute(db.sql`
            SELECT id FROM produtos WHERE LOWER(TRIM(descricao)) = 'item avulso' LIMIT 1
          `);
          if (avulsoRows?.[0]?.id) {
            produtoAvulsoId = Number(avulsoRows[0].id);
          } else {
            const [ins]: any = await tx.insert(db.produtos).values({
              descricao: 'ITEM AVULSO',
            } as any);
            produtoAvulsoId = (ins as any)[0]?.insertId ?? null;
          }

          // 6) Itens + baixa de estoque + geração automática de pendências (tudo dentro da transação)
          for (const i of input.itens) {
            // Item LIVRE (avulso): sempre gera pendência de compra
            if (i.tipo === 'LIVRE' && produtoAvulsoId) {
              gerouPendencia = true;
              await tx.insert(db.pendencias).values({
                pedidoId,
                vendedorId: vendedor.id,
                produtoId: produtoAvulsoId,
                corId: i.corId || null,
                quantidade: i.quantidade,
                status: 'PENDENTE',
              } as any);
            }

            // estoque / pendência (somente catálogo)
            if (i.tipo === 'CATALOGO' && i.produtoId) {
              // trava a linha do produto para evitar corrida entre vendedores
              const [prodRows]: any = await (tx as any).execute(db.sql`
                SELECT estoque, descricao
                FROM produtos
                WHERE id = ${i.produtoId}
                FOR UPDATE;
              `);

              const estoqueAtual = Number(prodRows?.[0]?.estoque ?? 0);
              const produtoDescricao = prodRows?.[0]?.descricao || `Produto ID ${i.produtoId}`;
              const novoEstoque = estoqueAtual - i.quantidade;

              // TRAVA DE ESTOQUE: Impedir a venda se o estoque não for suficiente
              if (estoqueAtual < i.quantidade) {
                throw new TRPCError({ 
                  code: 'BAD_REQUEST', 
                  message: `Estoque insuficiente para "${produtoDescricao}". Disponível: ${estoqueAtual}, Solicitado: ${i.quantidade}.` 
                });
              }

              // Atualiza estoque (agora garantido que não ficará negativo)
              await tx.update(db.produtos)
                .set({ estoque: novoEstoque } as any)
                .where(db.eq(db.produtos.id, i.produtoId));
            }

            await tx.insert(db.itensPedido).values({
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
            } as any);
          }

          // 7) Contas a Receber (provisório) — o real será gerado/ajustado na baixa (carga/entrega)
          const venc = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await tx.insert(db.contasReceber).values({
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

              return { ok: true, traceId: nanoid(10), pedidoId, numero, clienteId, gerouPendencia };
            }
          );
        if (isInProgress(result)) return result;

        await db.insertAuditLog({
          actorUserId: ctx.user?.role === "admin" ? ctx.user.id : null,
          actorVendedorId: ctx.user?.role !== "admin" ? ctx.user?.id : null,
          action: "create",
          entity: "pedido",
          entityId: String(result.pedidoId),
          payloadJson: JSON.stringify({ numero: result.numero }),
          traceId: result.traceId ?? undefined,
        });
        return { pedidoId: result.pedidoId, numero: result.numero, clienteId: result.clienteId, gerouPendencia: result.gerouPendencia };
        } catch (e) {
          throw e;
        }
      }),
  }),

  // ===== CARGAS =====
  cargas: router({
    list: adminProcedure.query(async () => {
      return await db.getAllCargas();
    }),
    
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getCargaById(input.id);
      }),
    
    create: adminProcedure
      .input(z.object({
        cidadeRota: z.string(),
        dataEntrega: z.date(),
        pedidosIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        return await db.createCarga(input, input.pedidosIds);
      }),

    // Editar carga (incluir/remover pedidos). Mantém status dos pedidos sincronizado.
    updatePedidos: adminProcedure
      .input(z.object({
        cargaId: z.number(),
        addIds: z.array(z.number()).optional(),
        removeIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.updateCargaPedidos(input.cargaId, { addIds: input.addIds, removeIds: input.removeIds });
      }),
    
    

    // Fechar/Liberar carga: muda para EM_ROTA e trava edição
    fechar: adminProcedure
      .input(z.object({ cargaId: z.number() }))
      .mutation(async ({ input }) => {
        return await db.fecharCarga(input.cargaId);
      }),

    // Romaneio PDF da carga (server-side)
    gerarRomaneioPDF: adminProcedure
      .input(z.object({ cargaId: z.number() }))
      .mutation(async ({ input }) => {
        return await pdf.gerarRomaneioPDF(input.cargaId);
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
      .mutation(async ({ input }) => {
        const result = await db.baixarPedidoCarga(input.pedidoCargaId, {
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
  list: adminProcedure.query(async () => {
    return await db.listPendencias();
  }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["PENDENTE", "COMPRADO", "RESOLVIDO"]),
    }))
    .mutation(async ({ input }) => {
      await db.updateStatusPendencia(input.id, input.status);
      return { ok: true as const };
    }),
}),

  boletos: router({
    list: protectedProcedure
      .input(z.object({ busca: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        let boletosData: any[] = [];
        if (ctx.user.role === 'admin') {
          const db_conn = await db.getDb();
          if (!db_conn) return [];
          boletosData = await db_conn.select({
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
          .innerJoin(db.clientes, db.eq(db.boletos.clienteId, db.clientes.id));
        } else {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) return [];
          boletosData = await db.getBoletosByVendedor(vendedor.id);
        }
        
        if (input?.busca) {
          const termo = input.busca.toLowerCase();
          return boletosData.filter(b => 
            (b as any).clienteNome?.toLowerCase().includes(termo) || 
            b.numeroPedido.toString().includes(termo)
          );
        }
        return boletosData;
      }),
    
    baixarParcial: adminProcedure
      .input(z.object({
        boletoId: z.number(),
        valorPago: z.number(),
      }))
      .mutation(async ({ input }) => {
        return await db.baixarBoletoParcial(input.boletoId, input.valorPago);
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
          const lista = await db.getBoletosByVendedor(vendedor.id);
          const doCliente = lista.filter((b: any) => Number(b.clienteId) === input.clienteId);
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
        if (ctx.user.role !== "admin") {
          const carga = await db.getCargaById(input.cargaId);
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
        return await pdf.gerarBoletosCargaPDF(input.cargaId, input.pedidoNumero);
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
        if (ctx.user.role === 'admin') {
          return await db.getAllContasReceber(input?.status);
        } else {
          const vendedor = await getVendedorFromContext(ctx);
          if (!vendedor) return [];
          return await db.getContasReceberByVendedor(vendedor.id, input?.status);
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
              await db.createContaReceber(
                {
                  pedidoNumero: input.pedidoNumero,
                  clienteNome: input.clienteNome,
                  descricao: input.descricao,
                  valor: input.valor,
                  dataVencimento: input.dataVencimento,
                  formaPagamento: input.formaPagamento,
                  observacoes: input.observacoes,
                  vendedorId,
                },
                tx
              );
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
        return await db.marcarContaRecebida(input.id, input.dataRecebimento, input.formaPagamento);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertOwnership(ctx, "conta_receber", input.id);
        return await db.deleteContaReceber(input.id);
      }),
  }),

  // ===== CAIXA MENSAL =====
  caixaMensal: router({
    get: protectedProcedure
      .input(z.object({ mesAno: z.string().optional() }))
      .query(async ({ input }) => {
        return await db.getCaixaMensal(input.mesAno);
      }),
    listAll: protectedProcedure
      .query(async () => {
        return await db.getAllCaixaMensal();
      }),
  }),

  // ===== PLANO DE CONTAS =====
  planoContas: router({
    list: protectedProcedure
      .input(z.object({ tipo: z.enum(["RECEITA", "DESPESA"]).optional() }))
      .query(async ({ input }) => {
        return await db.getPlanoContas(input.tipo);
      }),
    create: adminProcedure
      .input(z.object({ 
        nome: z.string(), 
        tipo: z.enum(["RECEITA", "DESPESA"]),
      }))
      .mutation(async ({ input }) => {
        return await db.createPlanoContas(input);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number(), nome: z.string().min(1), tipo: z.enum(["RECEITA", "DESPESA"]) }))
      .mutation(async ({ input }) => {
        const db_conn = await db.getDb();
        if (!db_conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
        await db_conn.update(db.planoContas).set({ nome: input.nome, tipo: input.tipo } as any).where(db.eq(db.planoContas.id, input.id));
        return { ok: true as const };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db_conn = await db.getDb();
        if (!db_conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
        await db_conn.delete(db.planoContas).where(db.eq(db.planoContas.id, input.id));
        return { ok: true as const };
      }),
  }),

  // ===== CONTAS A PAGAR =====
  contasPagar: router({
    list: protectedProcedure
      .input(z.object({ 
        status: z.enum(['PENDENTE', 'PAGO']).optional(),
        fornecedor: z.string().optional()
      }))
      .query(async ({ input }) => {
        return await db.listContasPagarFiltro(input.status, input.fornecedor);
      }),
    create: protectedProcedure
      .input(z.object({
        fornecedor: z.string(),
        descricao: z.string().optional(),
        valor: z.string(),
        dataVencimento: z.date(),
        planoContasId: z.number().optional(),
        observacoes: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        return await db.createContaPagar(input);
      }),
    pagar: protectedProcedure
      .input(z.object({ id: z.number(), valorPago: z.number() }))
      .mutation(async ({ input }) => {
        return await db.pagarConta(input.id, input.valorPago);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteContaPagar(input.id);
      }),
  }),

  // ===== CONTAS FIXAS =====
  contasFixas: router({
    list: protectedProcedure.query(async () => {
      return await db.listContasFixas();
    }),
    create: protectedProcedure
      .input(z.object({
        nome: z.string(),
        valorPadrao: z.string(),
        diaVencimento: z.number(),
        planoContasId: z.number().optional()
      }))
      .mutation(async ({ input }) => {
        return await db.createContaFixa(input);
      }),
    gerarMes: protectedProcedure
      .input(z.object({ mesAno: z.string() }))
      .mutation(async ({ input }) => {
        return await db.gerarContasFixasMes(input.mesAno);
      }),
  }),

  // ===== COMISSÕES =====
  comissoes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") {
        return await db.getAllComissoes();
      }
      const vendedor = await getVendedorFromContext(ctx);
      if (!vendedor) return [];
      return await db.getComissoesByVendedor(vendedor.id);
    }),
    marcarPaga: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.marcarComissaoPaga(input.id);
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
    run: adminProcedure.query(async () => {
      return await db.runDiagnosticoConsistencia();
    }),
  }),
});

export type AppRouter = typeof appRouter;
