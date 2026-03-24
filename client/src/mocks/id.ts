/** ID único para registros locais (mock / offline). */
export function newLocalId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
