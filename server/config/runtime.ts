/**
 * Configuração de runtime centralizada (evita `if (dev)` espalhado).
 *
 * ENABLE_GRACEFUL_SHUTDOWN:
 * - "true" → handlers de sinal / shutdown ativos (qualquer NODE_ENV)
 * - "false" → desativados explicitamente
 * - ausente → em produção ativo; em development inativo (evita conflito com tsx watch).
 *   Para testar shutdown em dev: ENABLE_GRACEFUL_SHUTDOWN=true
 */
function resolveEnableGracefulShutdown(): boolean {
  const raw = process.env.ENABLE_GRACEFUL_SHUTDOWN?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
}

export const RUNTIME = {
  isDev: process.env.NODE_ENV === "development",
  enableGracefulShutdown: resolveEnableGracefulShutdown(),
} as const;

export type RuntimeConfig = typeof RUNTIME;
