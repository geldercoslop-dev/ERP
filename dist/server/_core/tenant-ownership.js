// BLOQUEADO — LOTE 3 FINALIZADO
// NÃO ALTERAR SEM AUTORIZAÇÃO
/**
 * Validação de tenant - funções genéricas de segurança
 * Funções genéricas de segurança de tenant
 */
import { securityLogger } from "./logger.js";
const SECURITY_PREFIX = "SECURITY:";
/** Chaves que nunca podem ser definidas pelo input (spoofing / injection). */
export const FORBIDDEN_INPUT_KEYS = new Set([
    "tenantId",
    "tenant_id",
    "userId",
    "user_id",
    "role",
    "userRole",
    "user_role",
    "vendedorId",
    "vendedor_id",
    "bypassSecurity",
    "bypass_security",
    "adminOverride",
    "admin_override",
    "__proto__",
    "constructor",
]);
function logInvalidAttempt(reason, meta) {
    securityLogger.warn({
        event: "context_rejected",
        reason,
        ...meta,
    }, `[${SECURITY_PREFIX}] tentativa de contexto inválido - ${reason}`);
}
function normalizePermissionUserRole(raw) {
    if (raw == null)
        return "";
    const oneLine = String(raw).replace(/\r\n|\r|\n/g, " ").trim();
    return oneLine.split(/\s+/)[0] ?? "";
}
export function stripForbiddenKeysFromInput(input) {
    const out = { ...input };
    for (const k of FORBIDDEN_INPUT_KEYS) {
        if (k in out)
            delete out[k];
    }
    const dados = out.dados;
    if (dados != null && typeof dados === "object" && !Array.isArray(dados)) {
        const d = { ...dados };
        for (const k of FORBIDDEN_INPUT_KEYS) {
            if (k in d)
                delete d[k];
        }
        out.dados = d;
    }
    return out;
}
