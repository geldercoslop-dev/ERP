/**
 * Helpers tRPC HTTP (Express) — formato batch=1 usado pelo cliente/runtime.
 * @see scripts/runtime-attack-suite.ts
 */

/** @param {string} baseUrl ex: http://localhost:3001 */
export function trpcBatchUrl(baseUrl, procedure) {
  const u = new URL(baseUrl);
  u.pathname = `/api/trpc/${procedure}`;
  u.searchParams.set("batch", "1");
  return u.toString();
}

/**
 * Corpo batch índice 0 — alinhado ao client (`authStore` / trpcBatchCall):
 * `{ "0": { ...input } }` e não `{ "0": { "json": ... } }`.
 */
export function batchBody0(jsonInput) {
  return JSON.stringify({ 0: jsonInput });
}

/**
 * Parse resposta tRPC batch (sem SuperJSON).
 * @returns {unknown | null}
 */
export function parseTrpcBatchJson(text) {
  try {
    const data = JSON.parse(text);
    const row = Array.isArray(data) ? data[0] : data;
    const d = row?.result?.data;
    if (d != null && typeof d === "object" && "json" in d) {
      return d.json;
    }
    if (d != null && typeof d === "object") {
      return d;
    }
    if (data?.result?.data?.json !== undefined) {
      return data.result.data.json;
    }
  } catch {
    return null;
  }
  return null;
}

export function isTrpcError(text) {
  try {
    const data = JSON.parse(text);
    const err = Array.isArray(data) ? data[0]?.error : data?.error;
    return !!err;
  } catch {
    return false;
  }
}
