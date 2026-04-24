// Serviço de sessão seguro usando tabela sessions do banco
// Substitui backdoor "admin-session" por autenticação real
import { nanoid } from "nanoid";
import { executeQuery } from "../config/database.js";
import { InfrastructureError } from "./errors/typed-errors.js";
export class SessionService {
    static SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 horas
    static MAX_SESSIONS_PER_USER = 5; // Limite de sessões por usuário
    /**
     * Criar nova sessão para usuário
     */
    static async createSession(data, req) {
        const sessionToken = nanoid(32); // Token seguro de 32 caracteres
        const expiresAt = new Date(Date.now() + this.SESSION_DURATION);
        const userAgent = req?.headers?.['user-agent'] || '';
        const ipAddress = String(req?.ip || '');
        try {
            // Limpar sessões antigas do mesmo usuário
            await this.cleanupOldSessions(data.userId);
            // Inserir nova sessão
            await executeQuery("INSERT INTO sessions (token, userId, vendedorId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)", [sessionToken, data.userId, data.vendedorId ?? null, expiresAt, new Date()]);
            return sessionToken;
        }
        catch (error) {
            console.error('[SessionService] Erro ao criar sessão:', error);
            throw new InfrastructureError('Falha ao criar sessão');
        }
    }
    /**
     * Validar sessão e retornar dados do usuário
     */
    static async validateSession(sessionToken) {
        if (!sessionToken || sessionToken.length < 10) {
            return null;
        }
        try {
            const [rows, _] = await executeQuery("SELECT userId, vendedorId FROM sessions WHERE token = ? AND expiresAt > ? LIMIT 1", [sessionToken, new Date()]);
            const rowList = rows ?? [];
            if (rowList.length === 0) {
                return null;
            }
            const sessionData = rowList[0];
            return {
                userId: sessionData.userId,
                vendedorId: sessionData.vendedorId || undefined,
            };
        }
        catch (error) {
            console.error('[SessionService] Erro ao validar sessão:', error);
            return null;
        }
    }
    /**
     * Revogar sessão específica
     */
    static async revokeSession(sessionToken) {
        try {
            await executeQuery("DELETE FROM sessions WHERE token = ?", [sessionToken]);
            return true;
        }
        catch (error) {
            console.error('[SessionService] Erro ao revogar sessão:', error);
            return false;
        }
    }
    /**
     * Revogar todas as sessões de um usuário
     */
    static async revokeAllUserSessions(userId) {
        try {
            await executeQuery("DELETE FROM sessions WHERE userId = ?", [userId]);
            return true;
        }
        catch (error) {
            console.error('[SessionService] Erro ao revogar sessões do usuário:', error);
            return false;
        }
    }
    /**
     * Limpar sessões expiradas
     */
    static async cleanupExpiredSessions() {
        try {
            const [rows, _] = await executeQuery("DELETE FROM sessions WHERE expiresAt < ?", [new Date()]);
            const rowList = rows ?? [];
            const first = rowList[0];
            return first?.affectedRows ?? 0;
        }
        catch (error) {
            console.error('[SessionService] Erro ao limpar sessões expiradas:', error);
            return 0;
        }
    }
    /**
     * Limpar sessões antigas do usuário (manter apenas as mais recentes)
     */
    static async cleanupOldSessions(userId) {
        try {
            // Buscar sessões do usuário, ordenadas por criação (mais antigas primeiro)
            const [userSessions, _] = await executeQuery("SELECT token, createdAt, expiresAt FROM sessions WHERE userId = ? AND expiresAt > ? ORDER BY createdAt ASC", [userId, new Date()]);
            const sessionList = userSessions ?? [];
            // Se tiver mais que o limite, remover as mais antigas
            if (sessionList.length > this.MAX_SESSIONS_PER_USER) {
                const sessionsToDeactivate = sessionList.slice(0, sessionList.length - this.MAX_SESSIONS_PER_USER);
                for (const session of sessionsToDeactivate) {
                    await executeQuery("DELETE FROM sessions WHERE token = ?", [session.token]);
                }
            }
        }
        catch (error) {
            console.error('[SessionService] Erro ao limpar sessões antigas:', error);
        }
    }
    /**
     * Listar sessões ativas de um usuário
     */
    static async listUserSessions(userId) {
        try {
            const [rows] = await executeQuery("SELECT token, createdAt, expiresAt FROM sessions WHERE userId = ? AND expiresAt > ? ORDER BY createdAt ASC", [userId, new Date()]);
            const rowList = rows ?? [];
            return rowList;
        }
        catch (error) {
            console.error('[SessionService] Erro ao listar sessões do usuário:', error);
            throw new InfrastructureError('Falha ao listar sessões do usuário');
        }
    }
}
export default SessionService;
