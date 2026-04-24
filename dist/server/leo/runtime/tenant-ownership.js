/**
 * Funções específicas do LEO para tenant ownership
 * Extraídas do core para isolamento semântico
 */
import { getUserById, getVendedorById, getVendedorByUserId } from "../../db/core.js";
import { securityLogger } from "../../_core/logger.js";
import { InfrastructureError } from "../../_core/errors/typed-errors.js";
const SECURITY_PREFIX = "SECURITY:";
function logInvalidAttempt(reason, meta) {
    securityLogger.warn({
        event: "leo_tool_context_rejected",
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
/**
 * Garante que o tenant existe no vínculo usuário tenant (via linha users ou vendedores).
 * Não aceita tenantId que não seja o do registro no banco.
 */
export async function validateTenantOwnership(userId, claimedTenantId, options) {
    if (!Number.isInteger(userId) || userId <= 0) {
        logInvalidAttempt("userId inválido", { userId, claimedTenantId });
        throw new InfrastructureError(`${SECURITY_PREFIX} userId inválido`);
    }
    if (!Number.isInteger(claimedTenantId) || claimedTenantId <= 0) {
        logInvalidAttempt("tenantId inválido", { userId, claimedTenantId });
        throw new InfrastructureError(`${SECURITY_PREFIX} tenantId inválido`);
    }
    const user = await getUserById(userId);
    if (user) {
        const userTenantId = user.tenantId;
        if (userTenantId == null || userTenantId !== claimedTenantId) {
            logInvalidAttempt("tenantId não pertence ao usuário (users)", {
                userId,
                claimedTenantId,
                dbTenantId: userTenantId,
            });
            throw new InfrastructureError(`${SECURITY_PREFIX} tenantId não pertence ao usuário autenticado`);
        }
        if (user.role === "admin") {
            if (options?.claimedVendedorId != null) {
                const v = await getVendedorById(options.claimedVendedorId);
                const vTenantId = v ? v.tenantId : undefined;
                if (!v || vTenantId == null || vTenantId !== userTenantId) {
                    logInvalidAttempt("vendedorId inconsistente para admin", {
                        userId,
                        claimedVendedorId: options.claimedVendedorId,
                    });
                    throw new InfrastructureError(`${SECURITY_PREFIX} vendedorId inválido para o tenant`);
                }
            }
            return {
                tenantId: userTenantId,
                userId: user.id,
                role: "admin",
                userRole: "admin",
            };
        }
        const vByUser = await getVendedorByUserId(user.id);
        const vByUserTenantId = vByUser ? vByUser.tenantId : undefined;
        if (vByUser && vByUserTenantId != null && vByUserTenantId === userTenantId) {
            if (options?.claimedVendedorId != null && options.claimedVendedorId !== vByUser.id) {
                logInvalidAttempt("vendedorId não coincide com o vínculo do usuário", {
                    userId,
                    claimedVendedorId: options.claimedVendedorId,
                    resolvedVendedorId: vByUser.id,
                });
                throw new InfrastructureError(`${SECURITY_PREFIX} vendedorId não pertence ao usuário`);
            }
            return {
                tenantId: userTenantId,
                userId: user.id,
                role: "vendedor",
                userRole: "vendedor",
                vendedorId: vByUser.id,
            };
        }
        return {
            tenantId: userTenantId,
            userId: user.id,
            role: "system",
            userRole: "user",
        };
    }
    const vById = await getVendedorById(userId);
    const vByIdTenantId = vById ? vById.tenantId : undefined;
    if (vById && vByIdTenantId != null && vByIdTenantId === claimedTenantId) {
        if (options?.claimedVendedorId != null && options.claimedVendedorId !== vById.id) {
            logInvalidAttempt("vendedorId não coincide (sessão por id de vendedor)", {
                userId,
                claimedVendedorId: options.claimedVendedorId,
                resolvedVendedorId: vById.id,
            });
            throw new InfrastructureError(`${SECURITY_PREFIX} vendedorId não pertence ao contexto`);
        }
        const uid = vById.userId != null && vById.userId > 0 ? vById.userId : vById.id;
        return {
            tenantId: vByIdTenantId,
            userId: uid,
            role: vById.admin ? "admin" : "vendedor",
            userRole: vById.admin ? "admin" : "vendedor",
            vendedorId: vById.id,
        };
    }
    logInvalidAttempt("usuário ou vendedor não encontrado para o tenant declarado", {
        userId,
        claimedTenantId,
    });
    throw new InfrastructureError(`${SECURITY_PREFIX} usuário não encontrado ou não pertence ao tenant`);
}
/**
 * Extrai apenas IDs do objeto bruto; role/userRole do cliente são ignorados para autorização
 * (usados só para log legado após reconstrução).
 */
export function parseClaimedToolContext(raw) {
    if (raw == null || typeof raw !== "object") {
        logInvalidAttempt("contexto ausente ou não objeto", {});
        throw new InfrastructureError(`${SECURITY_PREFIX} contexto de execução ausente`);
    }
    const o = raw;
    const userId = Number(o.userId);
    const tenantId = Number(o.tenantId);
    const vidRaw = o.vendedorId;
    const claimedVendedorId = vidRaw != null && Number.isFinite(Number(vidRaw)) ? Number(vidRaw) : undefined;
    const ignoredClientRole = typeof o.userRole === "string"
        ? normalizePermissionUserRole(o.userRole)
        : typeof o.role === "string"
            ? normalizePermissionUserRole(String(o.role))
            : undefined;
    if (!Number.isInteger(userId) || userId <= 0) {
        logInvalidAttempt("userId ausente ou inválido no contexto", { tenantId });
        throw new InfrastructureError(`${SECURITY_PREFIX} userId obrigatório e válido no contexto`);
    }
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        logInvalidAttempt("tenantId ausente ou inválido no contexto", { userId });
        throw new InfrastructureError(`${SECURITY_PREFIX} tenantId obrigatório e válido no contexto`);
    }
    return { userId, tenantId, claimedVendedorId, ignoredClientRole };
}
/**
 * Reconstrói identidade autoritativa para execução de tool (DB é fonte da verdade).
 */
export async function reconstructLeoToolExecutionIdentity(rawContext) {
    const claimed = parseClaimedToolContext(rawContext);
    return validateTenantOwnership(claimed.userId, claimed.tenantId, {
        claimedVendedorId: claimed.claimedVendedorId,
    });
}
/** Converte identidade resolvida para SecureToolContext (sem __fromTool). */
export function toSecureToolContext(identity) {
    return {
        tenantId: identity.tenantId,
        userId: identity.userId,
        role: identity.role,
        vendedorId: identity.vendedorId,
        userRole: identity.userRole,
    };
}
/** Chaves que nunca podem ser definidas pelo input da tool (spoofing / injection). */
export const FORBIDDEN_TOOL_INPUT_KEYS = new Set([
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
export function stripForbiddenKeysFromInput(input) {
    const out = { ...input };
    for (const k of FORBIDDEN_TOOL_INPUT_KEYS) {
        if (k in out)
            delete out[k];
    }
    const dados = out.dados;
    if (dados != null && typeof dados === "object" && !Array.isArray(dados)) {
        const d = { ...dados };
        for (const k of FORBIDDEN_TOOL_INPUT_KEYS) {
            if (k in d)
                delete d[k];
        }
        out.dados = d;
    }
    return out;
}
