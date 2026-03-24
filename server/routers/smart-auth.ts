/**
 * Router de Autenticação Inteligente
 * Usa detecção automática da tabela de login
 */
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAuthConfig, authenticateUser } from "../_core/auth-detection";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import * as usersService from "../services/users.service";
import * as authSecurity from "../_core/auth-security";
import { auditLog } from "../_core/audit-log";

/**
 * Router de autenticação inteligente
 * Detecta automaticamente qual tabela usar (users ou vendedores)
 */
export const smartAuthRouter = router({
  /**
   * Login inteligente - detecta tabela automaticamente
   */
  login: publicProcedure
    .input(z.object({ 
      username: z.string().min(1, "O usuário é obrigatório").max(100, "Usuário muito longo"), 
      password: z.string().min(4, "A senha deve ter pelo menos 4 caracteres").max(100, "Senha muito longa") 
    }))
    .mutation(async ({ input, ctx }) => {
      const username = input.username.trim();
      const password = input.password;
      const ip = (ctx.req?.headers["x-forwarded-for"] as string) || ctx.req?.socket?.remoteAddress || "0.0.0.0";
      const cookieOptions = { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS };

      // 1. Verificar proteção contra brute force e delay progressivo
      await authSecurity.validateLoginAttempt(username, ip);

      try {
        console.log(`[Smart Auth] Tentativa de login: ${username}`);
        
        // Obter configuração de autenticação detectada
        const authConfig = await getAuthConfig();
        console.log(`[Smart Auth] Usando tabela: ${authConfig.table}, campo usuário: ${authConfig.usernameField}`);
        
        // Autenticar usuário
        const user = await authenticateUser(username, password);
        
        console.log(`[Smart Auth] ✅ Usuário autenticado: ID=${user.id}, Nome=${user.nome || user.name}`);
        
        // Determinar tipo de sessão baseado na tabela
        let sessionValue: string;
        let role: string;
        let name: string;
        
        if (authConfig.table === "users") {
          // Sessão de usuário da tabela users
          sessionValue = `u:${user.id}`;
          role = user.role || "user";
          name = user.name || "Usuário";
          
          // Atualizar último signin
          if (user.tenantId && user.id) {
            await usersService.touchLastSignedIn(user.tenantId, user.id);
          }
          
        } else {
          // Sessão de vendedor
          sessionValue = `v:${user.id}`;
          role = user.admin ? "admin" : "vendedor";
          name = user.nome || user.name || "Vendedor";
          
          // Atualizar último signin se tiver userId
          if (user.userId && user.tenantId) {
            await usersService.touchLastSignedIn(user.tenantId, user.userId);
          }
        }
        
        // Definir cookies
        ctx.res?.cookie?.(COOKIE_NAME, sessionValue, cookieOptions);
        ctx.res?.cookie?.("session", sessionValue, cookieOptions);
        
        console.log(`[Smart Auth] Cookie definido: ${sessionValue} (${role})`);
        
        // Registrar sucesso
        authSecurity.recordLoginSuccess(username, ip);

        // Auditoria Logger
        auditLog({
          userId: user.id,
          action: "login",
          module: "auth",
          ip,
          requestId: (ctx as any).requestId,
          details: { role, authTable: authConfig.table, smartAuth: true }
        });

        return {
          ok: true,
          sessionToken: sessionValue,
          openId: user.openId || username,
          name,
          role,
          userId: user.id,
          vendedorId: authConfig.table === "vendedores" ? user.id : undefined,
          tenantId: user.tenantId,
          authTable: authConfig.table,
        };
        
      } catch (error) {
        console.log(`[Smart Auth] ❌ Falha no login:`, error instanceof Error ? error.message : error);
        
        // Registrar falha
        authSecurity.recordLoginFailure(username, ip);

        if (error instanceof TRPCError) {
          if (error.code === "UNAUTHORIZED") {
            throw authSecurity.getGenericAuthError();
          }
          throw error;
        }

        throw authSecurity.getGenericAuthError();
      }
    }),

  /**
   * Verifica configuração de autenticação detectada
   */
  config: publicProcedure.query(async () => {
    try {
      const config = await getAuthConfig();
      return {
        success: true,
        config: {
          table: config.table,
          usernameField: config.usernameField,
          passwordField: config.passwordField,
          emailField: config.emailField,
          roleField: config.roleField,
        },
        message: `Autenticação configurada para tabela ${config.table}`,
      };
    } catch (error) {
      console.error("[Smart Auth] Erro ao obter configuração:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
        message: "Falha na configuração de autenticação",
      };
    }
  }),

  /**
   * (removido) Endpoints de teste/health foram removidos por segurança.
   */
});
