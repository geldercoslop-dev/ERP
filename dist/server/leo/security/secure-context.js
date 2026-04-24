/**
 * Contexto seguro do agente LEO: valida input e reconstrói identidade via banco
 * (mesma lógica de tenant-ownership das tools).
 */
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../../runtime/service-invocation.js";
import { reconstructLeoToolExecutionIdentity } from "../runtime/tenant-ownership.js";
import { securityLogger } from "../../_core/logger.js";
import { ValidationError } from '../../_core/errors/typed-errors.js';
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
function detectBypassAttempts(input) {
    const blocked = [];
    for (const field of BLOCKED_INPUT_FIELDS) {
        if (field in input)
            blocked.push(field);
    }
    return [...new Set(blocked)];
}
function sanitizeSafeContext(input) {
    const sanitized = {};
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
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
export async function buildSecureContext(request, authContext) {
    const inputContext = request.context && typeof request.context === "object" && !Array.isArray(request.context)
        ? request.context
        : {};
    const bypassAttempts = detectBypassAttempts(inputContext);
    if (bypassAttempts.length > 0) {
        securityLogger.warn({ event: "leo_agent_bypass_fields", fields: bypassAttempts }, "SECURITY: campos bloqueados em request.context");
        return {
            valid: false,
            reason: `Tentativa de bypass detectada. Campos bloqueados: ${bypassAttempts.join(", ")}`,
            blockedFields: bypassAttempts,
        };
    }
    let identity;
    try {
        identity = await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => reconstructLeoToolExecutionIdentity({
            tenantId: authContext.tenantId,
            userId: authContext.userId,
            userRole: authContext.userRole,
            vendedorId: authContext.vendedorId,
        }));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        securityLogger.warn({ event: "leo_agent_context_reject", error: msg }, "SECURITY: contexto agente rejeitado");
        return { valid: false, reason: msg };
    }
    const secureContext = {
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
export async function validateSecurityBeforeExecution(request, authContext) {
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
export async function createSecureExecutionContext(request, authContext) {
    const validation = await validateSecurityBeforeExecution(request, authContext);
    if (!validation.valid) {
        throw new ValidationError(validation.reason || "Falha na validação de segurança");
    }
    return validation.secureContext;
}
