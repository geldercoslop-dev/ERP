/**
 * Chaves que o cliente NUNCA deve enviar ao backend: tenant, identidade e papel
 * vêm da sessão / reconstrução no servidor.
 */
export const FORBIDDEN_IDENTITY_KEYS = new Set([
  "tenantId",
  "tenant_id",
  "userId",
  "user_id",
  "role",
  "userRole",
  "vendedorId",
  "vendedor_id",
  "isAdmin",
  "is_admin",
  "__proto__",
  "constructor",
]);

/**
 * Remove recursivamente chaves proibidas de objetos plain (inputs JSON).
 */
export function stripForbiddenIdentityKeys<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripForbiddenIdentityKeys(item)) as T;
  }
  if (typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_IDENTITY_KEYS.has(k)) continue;
      out[k] = stripForbiddenIdentityKeys(v);
    }
    return out as T;
  }
  return value;
}

const CTRL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Texto livre (chat, busca): remove caracteres de controlo e limita tamanho.
 */
export function sanitizePlainTextInput(raw: string, maxLen = 16_000): string {
  const s = String(raw ?? "").replace(CTRL_CHARS, "").trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}
