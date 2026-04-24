/**
 * Audit Log Service
 *
 * Persistência de logs críticos no banco
 * Auditoria completa de ações sensíveis
 */
import { eq, and, gte, lte, lt, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { auditLogs } from '../../drizzle/schema.js';
import { logger } from '../_core/logger.js';
import { isString } from '../_core/validators.js';
import { toDbDateStrict } from '../utils/date.js';
// Type guard para Record
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/**
 * Sanitiza payload para armazenamento seguro
 */
function sanitizePayload(payload) {
    const sanitized = {};
    for (const [key, value] of Object.entries(payload)) {
        // Remover campos sensíveis
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('password') ||
            lowerKey.includes('secret') ||
            lowerKey.includes('token') ||
            lowerKey.includes('senha') ||
            lowerKey.includes('pass')) {
            sanitized[key] = '[REDACTED]';
            continue;
        }
        if (isString(value)) {
            // Sanitização robusta para strings
            let sanitizedValue = value;
            // Remover scripts e conteúdo perigoso
            sanitizedValue = sanitizedValue
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script>...</script>
                .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove <iframe>...</iframe>
                .replace(/javascript:/gi, '') // Remove JS URLs
                .replace(/on\w+\s*=/gi, '') // Remove event handlers
                .replace(/<[^>]*>/g, '') // Remove todas as tags HTML
                .replace(/['"\\]/g, ''); // Remove aspas e barras invertidas
            // Limitar tamanho
            sanitized[key] = sanitizedValue.substring(0, 1000);
        }
        else if (typeof value === 'number' || typeof value === 'boolean') {
            sanitized[key] = value;
        }
        else if (isRecord(value)) {
            // Recursão para objetos aninhados
            sanitized[key] = sanitizePayload(value);
        }
        else if (Array.isArray(value)) {
            // Limitar tamanho do array e sanitizar itens
            const limitedArray = value.slice(0, 50);
            sanitized[key] = limitedArray.map(item => isRecord(item) ? sanitizePayload(item) :
                isString(item) ? item.replace(/<[^>]*>/g, '').substring(0, 500) :
                    item);
        }
        else {
            // Converter outros tipos para string segura
            sanitized[key] = String(value)
                .replace(/<[^>]*>/g, '')
                .substring(0, 500);
        }
    }
    return sanitized;
}
/**
 * Extrai IP do request (Cloudflare primeiro)
 */
function extractIP(request) {
    if (!request)
        return null;
    // Prioridade: Cloudflare -> X-Forwarded-For -> Socket Remote Address
    const ip = request.headers?.['cf-connecting-ip'] ??
        request.headers?.['x-forwarded-for'] ??
        request.socket?.remoteAddress;
    if (ip && typeof ip === 'string') {
        // Pega o primeiro IP da lista (se houver múltiplos)
        const firstIP = ip.split(',')[0].trim();
        if (firstIP && firstIP !== 'unknown') {
            return firstIP;
        }
    }
    return null;
}
/**
 * Extrai User-Agent do request
 */
function extractUserAgent(request) {
    if (!request?.headers)
        return null;
    const userAgent = request.headers['user-agent'];
    if (isString(userAgent) && userAgent.trim()) {
        return userAgent.substring(0, 500); // Limita tamanho
    }
    return null;
}
/**
 * Valida payload de auditoria
 */
function validateAuditPayload(payload) {
    if (!isRecord(payload)) {
        return { success: false, error: 'Audit payload must be a record' };
    }
    if (!isString(payload.action) || payload.action.length === 0) {
        return { success: false, error: 'Audit action is required and must be non-empty string' };
    }
    if (!isString(payload.entity) || payload.entity.length === 0) {
        return { success: false, error: 'Audit entity is required and must be non-empty string' };
    }
    if (typeof payload.tenantId !== 'number' || payload.tenantId <= 0) {
        return { success: false, error: 'Audit tenantId is required and must be positive number' };
    }
    if (payload.action.length > 32) {
        return { success: false, error: 'Audit action must be 32 characters or less' };
    }
    if (payload.entity.length > 64) {
        return { success: false, error: 'Audit entity must be 64 characters or less' };
    }
    if (payload.entityId && payload.entityId.length > 64) {
        return { success: false, error: 'Audit entityId must be 64 characters or less' };
    }
    return { success: true };
}
/**
 * Service de Auditoria
 */
export class AuditLogService {
    /**
     * Registra ação no audit log
     */
    static async logAction(payload, request) {
        try {
            // Validação
            const validation = validateAuditPayload(payload);
            if (!validation.success) {
                return { success: false, error: validation.error };
            }
            // Extrair IP e User-Agent
            const ip = payload.ip || extractIP(request);
            const userAgent = payload.userAgent || extractUserAgent(request);
            // Sanitizar payload
            let sanitizedPayload = sanitizePayload(payload.payload);
            // Limitar tamanho do payload para 5000 caracteres
            if (JSON.stringify(sanitizedPayload).length > 5000) {
                sanitizedPayload = {
                    truncated: true,
                    originalKeys: Object.keys(payload.payload),
                    message: 'Payload exceeded 5000 character limit'
                };
            }
            const db = await getDb();
            // Inserir no banco com novos campos
            await db.insert(auditLogs).values({
                tenantId: payload.tenantId,
                action: payload.action,
                entity: payload.entity,
                entityId: payload.entityId || null,
                payloadJson: JSON.stringify(sanitizedPayload),
                actorUserId: payload.actorUserId || null,
                actorVendedorId: payload.actorVendedorId || null,
                traceId: payload.traceId || null,
                ip: ip || null,
                userAgent: userAgent || null,
                severity: 'INFO',
                source: 'api',
                createdAt: toDbDateStrict(new Date())
            });
            // Log de sucesso
            logger.info({
                tenantId: payload.tenantId,
                action: payload.action,
                entity: payload.entity,
                entityId: payload.entityId,
                actorUserId: payload.actorUserId,
                ip,
                traceId: payload.traceId,
                timestamp: new Date().toISOString()
            }, 'Audit log recorded successfully');
            return { success: true };
        }
        catch (error) {
            // Fail-safe: nunca quebrar o fluxo principal
            console.error('AUDIT_FAIL', error);
            // Log detalhado do erro (não falha a operação principal)
            logger.error({
                error: error instanceof Error ? error.message : String(error),
                payload: JSON.stringify(payload),
                timestamp: new Date().toISOString()
            }, 'Failed to record audit log');
            // Em produção, não Falhar completamente por auditoria
            if (process.env.NODE_ENV === 'production') {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
            // Em desenvolvimento, Falhar para debugging
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    /**
     * Busca logs de auditoria
     */
    static async getAuditLogs(tenantId, filters = {}) {
        try {
            const db = await getDb();
            // Construir condições com and()
            const conditions = [eq(auditLogs.tenantId, tenantId)];
            if (filters.action)
                conditions.push(eq(auditLogs.action, filters.action));
            if (filters.entity)
                conditions.push(eq(auditLogs.entity, filters.entity));
            if (filters.entityId)
                conditions.push(eq(auditLogs.entityId, filters.entityId));
            if (filters.actorUserId)
                conditions.push(eq(auditLogs.actorUserId, filters.actorUserId));
            if (filters.ip)
                conditions.push(eq(auditLogs.ip, filters.ip));
            if (filters.startDate)
                conditions.push(gte(auditLogs.createdAt, toDbDateStrict(filters.startDate)));
            if (filters.endDate)
                conditions.push(lte(auditLogs.createdAt, toDbDateStrict(filters.endDate)));
            // Paginação
            const limit = Math.min(filters.limit || 100, 1000);
            const offset = Math.max(filters.offset || 0, 0);
            const results = await db
                .select()
                .from(auditLogs)
                .where(and(...conditions))
                .limit(limit)
                .offset(offset)
                .orderBy(desc(auditLogs.createdAt));
            return { success: true, data: results.map((row) => ({
                    id: row.id,
                    tenantId: row.tenantId,
                    action: row.action,
                    entity: row.entity,
                    entityId: row.entityId,
                    payloadJson: row.payloadJson,
                    actorUserId: row.actorUserId,
                    actorVendedorId: row.actorVendedorId,
                    traceId: row.traceId,
                    ip: row.ip,
                    userAgent: row.userAgent,
                    createdAt: new Date(row.createdAt)
                })) };
        }
        catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : String(error),
                tenantId,
                filters,
                timestamp: new Date().toISOString()
            }, 'Failed to fetch audit logs');
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    /**
     * Conta logs de auditoria
     */
    static async countAuditLogs(tenantId, filters = {}) {
        try {
            const db = await getDb();
            // Construir condições com and()
            const conditions = [eq(auditLogs.tenantId, tenantId)];
            if (filters.action)
                conditions.push(eq(auditLogs.action, filters.action));
            if (filters.entity)
                conditions.push(eq(auditLogs.entity, filters.entity));
            if (filters.entityId)
                conditions.push(eq(auditLogs.entityId, filters.entityId));
            if (filters.actorUserId)
                conditions.push(eq(auditLogs.actorUserId, filters.actorUserId));
            if (filters.ip)
                conditions.push(eq(auditLogs.ip, filters.ip));
            if (filters.startDate)
                conditions.push(gte(auditLogs.createdAt, toDbDateStrict(filters.startDate)));
            if (filters.endDate)
                conditions.push(lte(auditLogs.createdAt, toDbDateStrict(filters.endDate)));
            const results = await db
                .select({ count: auditLogs.id })
                .from(auditLogs)
                .where(and(...conditions));
            return { success: true, data: results.length };
        }
        catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : String(error),
                tenantId,
                filters,
                timestamp: new Date().toISOString()
            }, 'Failed to count audit logs');
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    /**
     * Limpa logs antigos (retenção)
     */
    static async cleanupOldLogs(retentionDays = 90) {
        try {
            const db = await getDb();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const result = await db
                .delete(auditLogs)
                .where(lt(auditLogs.createdAt, toDbDateStrict(cutoffDate)));
            const deletedCount = 0; // Drizzle não retorna affectedRows de forma consistente
            logger.info({
                retentionDays,
                cutoffDate: cutoffDate.toISOString(),
                deletedCount,
                timestamp: new Date().toISOString()
            }, 'Audit logs cleanup completed');
            return { success: true, data: deletedCount };
        }
        catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : String(error),
                retentionDays,
                timestamp: new Date().toISOString()
            }, 'Failed to cleanup audit logs');
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
/**
 * Função utilitária para logging rápido
 */
export async function logAuditAction(action, entity, payload, context, request) {
    const result = await AuditLogService.logAction({
        tenantId: context.tenantId,
        action,
        entity,
        entityId: context.entityId,
        payload,
        actorUserId: context.actorUserId,
        actorVendedorId: context.actorVendedorId,
        traceId: context.traceId,
        ip: context.ip,
        userAgent: context.userAgent
    }, request);
    return result;
}
