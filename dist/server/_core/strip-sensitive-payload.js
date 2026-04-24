/**
 * Remove campos que nunca devem ser aplicados a partir de input externo (LLM, JSON genérico).
 * O servidor deve usar apenas actor / sessão / trustedVendedorId.
 */
const SENSITIVE_KEYS = new Set([
    "vendedorId",
    "vendedor_id",
    "VendedorId",
    "idVendedor",
    "sellerId",
]);
export function stripSensitiveIdsFromRecord(obj) {
    const out = { ...obj };
    for (const k of SENSITIVE_KEYS) {
        delete out[k];
    }
    return out;
}
export function stripSensitiveIdsFromUnknown(input) {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
        return {};
    }
    return stripSensitiveIdsFromRecord(input);
}
