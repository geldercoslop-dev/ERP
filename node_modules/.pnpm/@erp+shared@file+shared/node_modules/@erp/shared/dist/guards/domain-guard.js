/**
 * Validação de valores de domínio em runtime (anti-regressão).
 * Use em inputs críticos (status, tipo enumerado) antes de persistir ou montar query.
 */
const isReadonlyStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
/**
 * Garante que `value` é um dos valores permitidos do enum (array readonly de strings).
 * @param value valor vindo de API / payload
 * @param allowed tupla readonly (ex.: PedidoStatusValues)
 * @param fieldName nome para mensagem de erro
 */
export function validateStatus(value, allowed, fieldName = "status") {
    if (!isReadonlyStringList(allowed)) {
        throw new Error("validateStatus: lista de valores inválida");
    }
    if (typeof value !== "string") {
        throw new Error(`${fieldName} inválido: esperado string, recebido ${typeof value}`);
    }
    const trimmed = value.trim();
    if (!allowed.includes(trimmed)) {
        throw new Error(`${fieldName} inválido: "${value}" (permitidos: ${allowed.join(", ")})`);
    }
    return trimmed;
}
