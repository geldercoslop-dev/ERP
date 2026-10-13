// Serviço de sessão seguro usando tabela sessions do banco
// Substitui backdoor "admin-session" por autenticação real

import crypto from "crypto";
import { nanoid } from "nanoid";
import { and, eq, gt, isNull } from "drizzle-orm";
import { executeQuery } from "../config/database.js";
import { InfrastructureError } from "./errors/typed-errors.js";
import { getDb } from "../db/index.js";
import { authSessions } from "../../drizzle/schema.js";

interface SessionData {
  userId: number;
  vendedorId?: number;
  userAgent?: string;
  ipAddress?: string;
}

export class SessionService {
  private static readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 horas
  private static readonly MAX_SESSIONS_PER_USER = 5; // Limite de sessões por usuário

  /**
   * Criar nova sessão para usuário
   */
  static async createSession(data: SessionData, req?: Record<string, unknown>): Promise<string> {
    const sessionToken = nanoid(32); // Token seguro de 32 caracteres
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION);
    const userAgent = (req?.headers as Record<string, string>)?.['user-agent'] || '';
    const ipAddress = String(req?.ip || '');

    try {
      // Limpar sessões antigas do mesmo usuário
      await this.cleanupOldSessions(data.userId);

      // Inserir nova sessão
      await executeQuery(
        "INSERT INTO sessions (token, userId, vendedorId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)",
        [sessionToken, data.userId, data.vendedorId ?? null, expiresAt, new Date()]
      );

      return sessionToken;
    } catch (error) {
      console.error('[SessionService] Erro ao criar sessão:', error);
      throw new InfrastructureError('Falha ao criar sessão');
    }
  }

  /**
   * Validar sessão e retornar dados do usuário
   */
  static async validateSession(sessionToken: string): Promise<{
    userId: number;
    vendedorId?: number;
  } | null> {
    if (!sessionToken || sessionToken.length < 10) {
      return null;
    }

    try {
      const [rows, _] = await executeQuery(
        "SELECT userId, vendedorId FROM sessions WHERE token = ? AND expiresAt > ? LIMIT 1",
        [sessionToken, new Date()]
      );
      const rowList = (rows as Array<{ userId: number; vendedorId: number | null }>) ?? [];

      if (rowList.length === 0) {
        return null;
      }

      const sessionData = rowList[0];

      return {
        userId: sessionData.userId,
        vendedorId: sessionData.vendedorId || undefined,
      };
    } catch (error) {
      console.error('[SessionService] Erro ao validar sessão:', error);
      return null;
    }
  }

  /**
   * Revogar sessão específica
   */
  static async revokeSession(sessionToken: string): Promise<boolean> {
    try {
      await executeQuery(
        "DELETE FROM sessions WHERE token = ?",
        [sessionToken]
      );

      return true;
    } catch (error) {
      console.error('[SessionService] Erro ao revogar sessão:', error);
      return false;
    }
  }

  /**
   * Revogar todas as sessões de um usuário
   */
  static async revokeAllUserSessions(userId: number): Promise<boolean> {
    try {
      await executeQuery(
        "DELETE FROM sessions WHERE userId = ?",
        [userId]
      );

      return true;
    } catch (error) {
      console.error('[SessionService] Erro ao revogar sessões do usuário:', error);
      return false;
    }
  }

  /**
   * Limpar sessões expiradas
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      const [rows, _] = await executeQuery(
        "DELETE FROM sessions WHERE expiresAt < ?",
        [new Date()]
      );
      const rowList = (rows as Array<{ affectedRows?: number }>) ?? [];
      const first = rowList[0] as { affectedRows?: number } | undefined;
      return first?.affectedRows ?? 0;
    } catch (error) {
      console.error('[SessionService] Erro ao limpar sessões expiradas:', error);
      return 0;
    }
  }

  /**
   * Limpar sessões antigas do usuário (manter apenas as mais recentes)
   */
  private static async cleanupOldSessions(userId: number): Promise<void> {
    try {
      // Buscar sessões do usuário, ordenadas por criação (mais antigas primeiro)
      const [userSessions, _] = await executeQuery(
        "SELECT token, createdAt, expiresAt FROM sessions WHERE userId = ? AND expiresAt > ? ORDER BY createdAt ASC",
        [userId, new Date()]
      );
      const sessionList = (userSessions as Array<{ token: string; createdAt: Date; expiresAt: Date }>) ?? [];

      // Se tiver mais que o limite, remover as mais antigas
      if (sessionList.length > this.MAX_SESSIONS_PER_USER) {
        const sessionsToDeactivate = sessionList.slice(0, sessionList.length - this.MAX_SESSIONS_PER_USER);
        for (const session of sessionsToDeactivate) {
          await executeQuery(
            "DELETE FROM sessions WHERE token = ?",
            [session.token]
          );
        }
      }
    } catch (error) {
      console.error('[SessionService] Erro ao limpar sessões antigas:', error);
    }
  }

  /**
   * Listar sessões ativas de um usuário
   */
  static async listUserSessions(userId: number): Promise<Array<{
    token: string;
    createdAt: Date;
    expiresAt: Date;
  }>> {
    try {
      const [rows] = await executeQuery(
        "SELECT token, createdAt, expiresAt FROM sessions WHERE userId = ? AND expiresAt > ? ORDER BY createdAt ASC",
        [userId, new Date()]
      );
      const rowList = (rows as Array<{ token: string; createdAt: Date; expiresAt: Date }>) ?? [];
      return rowList;
    } catch (error) {
      console.error('[SessionService] Erro ao listar sessões do usuário:', error);
      throw new InfrastructureError('Falha ao listar sessões do usuário');
    }
  }
}

export default SessionService;

// ============================================================================
// AUTH-H5 / AUTH_DB_SESSION_V1 — sessões persistidas na tabela oficial
// `auth_sessions` (Drizzle). Regras invioláveis:
// - refresh token NUNCA é persistido puro: somente SHA-256 hex do JWT
// - acesso só é válido enquanto a sessão existir, não estiver revogada e
//   estiver dentro da janela de refresh (refresh_token_expires_at > now)
// - tenant_id/user_id/vendedor_id sempre conferem com o payload do JWT
// ============================================================================

export type AuthSessionRole = "admin" | "operator" | "user";

export type AuthSessionRow = typeof authSessions.$inferSelect;

export interface CreateAuthSessionInput {
  sessionId: string;
  tenantId: number;
  userId: number;
  /** null em sessão admin; obrigatório em sessão de vendedor. */
  vendedorId: number | null;
  role: AuthSessionRole;
  /** SHA-256 hex do refresh token — nunca o token puro. */
  refreshTokenHash: string;
  refreshTokenExpiresAt: Date;
}

/** Hash do refresh token para persistência/lookup (sha256 hex, determinístico). */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Insere registro de sessão persistida (login/impersonation). */
export async function createAuthSession(input: CreateAuthSessionInput): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db.insert(authSessions).values({
    sessionId: input.sessionId,
    tenantId: input.tenantId,
    userId: input.userId,
    vendedorId: input.vendedorId,
    role: input.role,
    refreshTokenHash: input.refreshTokenHash,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt,
    lastUsedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Sessão elegível para refresh: session_id + hash conferem com o payload JWT,
 * não revogada e dentro da janela de refresh. Anti-tenant: tenant_id/user_id
 * sempre filtrados pelo payload — nunca busca global por sessionId.
 */
export async function findValidSessionForRefresh(input: {
  sessionId: string;
  refreshTokenHash: string;
  tenantId: number;
  userId: number;
}): Promise<AuthSessionRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.sessionId, input.sessionId),
        eq(authSessions.refreshTokenHash, input.refreshTokenHash),
        eq(authSessions.tenantId, input.tenantId),
        eq(authSessions.userId, input.userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.refreshTokenExpiresAt, new Date())
      )
    )
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Rotação atômica do refresh token: só aplica se o hash atual ainda for o
 * esperado (replay de refresh antigo ou corrida → affectedRows 0 → false).
 */
export async function rotateSessionRefresh(input: {
  sessionId: string;
  expectedRefreshTokenHash: string;
  newRefreshTokenHash: string;
  newRefreshTokenExpiresAt: Date;
}): Promise<boolean> {
  const db = await getDb();
  const now = new Date();
  const result = await db
    .update(authSessions)
    .set({
      refreshTokenHash: input.newRefreshTokenHash,
      refreshTokenExpiresAt: input.newRefreshTokenExpiresAt,
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(authSessions.sessionId, input.sessionId),
        eq(authSessions.refreshTokenHash, input.expectedRefreshTokenHash),
        isNull(authSessions.revokedAt)
      )
    );
  const affected = Array.isArray(result)
    ? (result[0] as { affectedRows?: number })?.affectedRows
    : (result as { affectedRows?: number })?.affectedRows;
  return typeof affected === "number" && affected > 0;
}

/** Revogação server-side (logout, fim de impersonation, admin revoga). Idempotente. */
export async function revokeAuthSession(sessionId: string, reason: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .update(authSessions)
    .set({ revokedAt: now, revokedReason: reason, updatedAt: now })
    .where(and(eq(authSessions.sessionId, sessionId), isNull(authSessions.revokedAt)));
}

/**
 * Validação por-request do access token: a sessão precisa existir em
 * auth_sessions, não estar revogada, estar dentro da janela de refresh e
 * bater tenant_id/user_id/vendedor_id com o payload do JWT.
 * Se qualquer condição falhar, o access token morre imediatamente
 * (logout, revogação, fim da janela de refresh, sessão de outro tenant).
 */
export async function isAccessSessionValid(input: {
  sessionId: string;
  tenantId: number;
  userId: number;
  /** null quando o payload não carrega vendedorId (sessão admin). */
  vendedorId: number | null;
}): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({
      tenantId: authSessions.tenantId,
      userId: authSessions.userId,
      vendedorId: authSessions.vendedorId,
    })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.sessionId, input.sessionId),
        isNull(authSessions.revokedAt),
        gt(authSessions.refreshTokenExpiresAt, new Date())
      )
    )
    .limit(1);
  if (rows.length === 0) return false;
  const row = rows[0];
  if (row.tenantId !== input.tenantId || row.userId !== input.userId) return false;
  if ((row.vendedorId ?? null) !== input.vendedorId) return false;
  return true;
}
