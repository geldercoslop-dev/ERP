import { logger } from "./logger";

export type AuditModule = "auth" | "clientes" | "pedidos" | "financeiro" | "admin" | "system";
export type AuditAction = "login" | "logout" | "create" | "update" | "delete" | "impersonate" | "config_change";

interface AuditLogData {
  userId?: number | string;
  action: AuditAction;
  module: AuditModule;
  resourceId?: string | number;
  details?: any;
  ip?: string;
  requestId?: string;
  traceId?: string;
}

/**
 * Utilitário de Auditoria para registrar ações importantes dos usuários
 */
export function auditLog(data: AuditLogData) {
  const { userId, action, module, resourceId, details, ip, requestId } = data;

  logger.info({
    module: "audit",
    auditModule: module,
    auditAction: action,
    userId,
    resourceId,
    details,
    ip,
    requestId,
    timestamp: new Date().toISOString()
  }, `[AUDIT] ${module.toUpperCase()}:${action.toUpperCase()} - User ${userId || 'system'} affected ${resourceId || 'N/A'}`);
}

/**
 * Helper para auditoria em contexto de requisição
 */
export function auditRequest(ctx: any, module: AuditModule, action: AuditAction, resourceId?: string | number, details?: any) {
  const ip = ctx.req?.headers["x-forwarded-for"] || ctx.req?.socket?.remoteAddress || "0.0.0.0";
  
  auditLog({
    userId: ctx.user?.id,
    requestId: ctx.requestId,
    ip: typeof ip === 'string' ? ip : ip[0],
    module,
    action,
    resourceId,
    details
  });
}
