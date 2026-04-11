/**
 * Contexto seguro do agente LEO: valida input e reconstrói identidade via banco
 * (mesma lógica de tenant-ownership das tools).
 */

import type { SecureRole } from "../../_core/secure-context.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../../_core/service-entry-guard.js";
import { reconstructLeoToolExecutionIdentity } from "../../_core/tenant-ownership.js";
import { securityLogger } from "../../_core/logger.js";
import { ValidationError } from '../../_core/errors/typed-errors.js';

/** Evita import circular com agent-core. */
export type LeoAgentRequestLike = {
  message: string;
  sessionId?: string;
  context?: Record<string, unknown>;
};

export interface SecureAgentContext {
  tenantId: number;
  userId: number;
  role: SecureRole;
  /** Papel legado string para regras antigas (derivado de DB, não do input). */
  userRole: string;
  vendedorId?: number;
  sessionId?: string;
  safeContext?: Record<string, unknown>;
}

export interface SecurityValidationResult {
  valid: boolean;
  secureContext?: SecureAgentContext;
  reason?: string;
  blockedFields?: string[];
}

const BLOCKED_INPUT_FIELDS = [
  "tenantId",
  "userId",
  "role",
  "userRole",
  "isAdmin",
  "permissions",
  "bypassSecurity",
  "overrideSecurity",
];

function detectBypassAttempts(input: Record<string, unknown>): string[] {
  const blocked: string[] = [];
  for (const field of BLOCKED_INPUT_FIELDS) {
    if (field in input) blocked.push(field);
  }
  return [...new Set(blocked)];
}

function sanitizeSafeContext(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const keyLower = key.toLowerCase();
    if (BLOCKED_INPUT_FIELDS.includes(key) || keyLower.includes("bypass") || keyLower.includes("override")) {
      continue;
    }
    if (typeof value === "string") {
      sanitized[key] = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+\s*=/gi, "");
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function buildSecureContext(
  request: LeoAgentRequestLike,
  authContext: {
    tenantId: number;
    userId: number;
    userRole?: string;
    vendedorId?: number;
  }
): Promise<SecurityValidationResult> {
  const inputContext =
    request.context && typeof request.context === "object" && !Array.isArray(request.context)
      ? (request.context as Record<string, unknown>)
      : {};

  const bypassAttempts = detectBypassAttempts(inputContext);
  if (bypassAttempts.length > 0) {
    securityLogger.warn(
      { event: "leo_agent_bypass_fields", fields: bypassAttempts },
      "SECURITY: campos bloqueados em request.context"
    );
    return {
      valid: false,
      reason: `Tentativa de bypass detectada. Campos bloqueados: ${bypassAttempts.join(", ")}`,
      blockedFields: bypassAttempts,
    };
  }

  let identity;
  try {
    identity = await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () =>
      reconstructLeoToolExecutionIdentity({
        tenantId: authContext.tenantId,
        userId: authContext.userId,
        userRole: authContext.userRole,
        vendedorId: authContext.vendedorId,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    securityLogger.warn({ event: "leo_agent_context_reject", error: msg }, "SECURITY: contexto agente rejeitado");
    return { valid: false, reason: msg };
  }

  const secureContext: SecureAgentContext = {
    tenantId: identity.tenantId,
    userId: identity.userId,
    role: identity.role,
    userRole: identity.userRole,
    vendedorId: identity.vendedorId,
    sessionId: request.sessionId,
    safeContext: sanitizeSafeContext(inputContext),
  };

  return { valid: true, secureContext };
}

export async function validateSecurityBeforeExecution(
  request: LeoAgentRequestLike,
  authContext: {
    tenantId: number;
    userId: number;
    userRole?: string;
    vendedorId?: number;
  }
): Promise<SecurityValidationResult> {
  if (!authContext.userId || !authContext.tenantId) {
    return {
      valid: false,
      reason: "Contexto de autenticação incompleto: userId e tenantId são obrigatórios",
    };
  }
  if (authContext.userId <= 0 || authContext.tenantId <= 0) {
    return {
      valid: false,
      reason: "Valores inválidos: userId e tenantId devem ser positivos",
    };
  }

  if (request.message) {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /drop\s+table/i,
      /delete\s+from/i,
    ];
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(request.message)) {
        return { valid: false, reason: "Conteúdo malicioso detectado na mensagem" };
      }
    }
  }

  return await buildSecureContext(request, authContext);
}

export async function createSecureExecutionContext(
  request: LeoAgentRequestLike,
  authContext: {
    tenantId: number;
    userId: number;
    userRole?: string;
    vendedorId?: number;
  }
): Promise<SecureAgentContext> {
  const validation = await validateSecurityBeforeExecution(request, authContext);
  if (!validation.valid) {
    throw new ValidationError(validation.reason || "Falha na validação de segurança");
  }
  return validation.secureContext!;
}
