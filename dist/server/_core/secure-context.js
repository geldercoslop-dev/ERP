/**
 * Contexto de segurança canônico - validações genéricas
 * IDs numéricos alinhados ao banco (tenant/usuário); não usar string para não duplicar conversões.
 *
 * Nota: serviços de domínio continuam usando `ServiceActor` em paralelo; este tipo cobre a camada de execução.
 */
import { ValidationError } from './errors/typed-errors.js';
export function isSecureContext(value) {
    if (value == null || typeof value !== "object")
        return false;
    const o = value;
    return (typeof o.tenantId === "number" &&
        o.tenantId > 0 &&
        typeof o.userId === "number" &&
        o.userId > 0 &&
        (o.role === "admin" || o.role === "vendedor" || o.role === "system"));
}
export function assertSecureContext(value) {
    if (!isSecureContext(value)) {
        throw new ValidationError("SecureContext inválido: tenantId, userId e role são obrigatórios");
    }
}
/**
 * Deriva o papel seguro a partir do que o HTTP/JWT costuma enviar.
 */
export function secureRoleFromRequest(userRole, vendedorId) {
    const r = (userRole || "").toLowerCase();
    if (r === "admin")
        return "admin";
    if (vendedorId != null && Number.isFinite(vendedorId) && vendedorId > 0)
        return "vendedor";
    if (r === "vendedor" || r === "user")
        return "vendedor";
    return "system";
}
/** Para PermissionContext legado que usa userRole string. */
export function permissionUserRoleFromSecure(ctx) {
    if (ctx.role === "admin")
        return "admin";
    if (ctx.role === "vendedor")
        return "vendedor";
    return "user";
}
