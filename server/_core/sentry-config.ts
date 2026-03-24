/**
 * Indica se o DSN do Sentry está definido (validação em testes e health interno).
 * O init efetivo ocorre em `instrument.ts` (antes do Express).
 */
export function isSentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN?.trim());
}
