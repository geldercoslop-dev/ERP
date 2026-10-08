/**
 * Router de Autenticação Inteligente
 * Usa detecção automática da tabela de login
 */
import { publicProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { getAuthConfig, authenticateUser } from "../_core/auth-detection.js";
import { ValidationError } from '../_core/errors/typed-errors.js';
import * as usersService from "../services/users.service.js";
import * as authSecurity from "../_core/auth-security.js";
import { auditLog } from "../_core/audit-log.js";

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

      // 1. Verificar proteção contra brute force e delay progressivo
      await authSecurity.validateLoginAttempt(username, ip);

      try {
        console.log(`[Smart Auth] Tentativa de login: ${username}`);
        
        // Obter configuração de autenticação detectada
        const authConfig = await getAuthConfig();
        console.log(`[Smart Auth] Usando tabela: ${authConfig.table}, campo usuário: ${authConfig.usernameField}`);
        
        // Autenticar usuário
        const user = await authenticateUser(username, password);
        
        // Validar estrutura do usuário
        if (!user || typeof user !== 'object' || !('id' in user)) {
          throw new ValidationError("Usuário inválido retornado da autenticação");
        }
        
        const userObj = user as { id: number; [key: string]: unknown };
        
        console.log(`[Smart Auth] ✅ Usuário autenticado: ID=${userObj.id}, Nome=${userObj.nome || userObj.name}`);
        
        // P23-R-10B: este router é DEAD CODE (não montado em appRouter) e emitia
        // sessões forjáveis u:<id>/v:<id>. A emissão legada foi removida — o fluxo
        // oficial único é auth.login em routers.ts (JWT assinado + revalidação DB).
        // Falha explícita: credenciais válidas aqui NÃO criam sessão.
        authSecurity.recordLoginSuccess(username, ip);
        auditLog({
          userId: userObj.id,
          action: "login",
          module: "auth",
          ip,
          requestId: (ctx as { requestId?: string }).requestId,
          details: { smartAuth: true, legacySessionEmissionRemoved: true }
        });
        throw new ValidationError(
          "Rota de login legada desativada (P23-R-10B): use auth.login (JWT oficial)."
        );
        
      } catch (error) {
        console.log(`[Smart Auth] ❌ Falha no login:`, error instanceof Error ? error.message : error);
        
        // Registrar falha
        authSecurity.recordLoginFailure(username, ip);
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
