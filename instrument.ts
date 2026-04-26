/**
 * Sentry – carregar ANTES do Express (obrigatório em ESM).
 * Rode com: tsx --import ./instrument.ts server/_core/index.ts
 * 
 * NOTA: O carregamento do .env é feito exclusivamente em server/_core/loadEnv.ts
 * Este arquivo NÃO carrega .env para evitar dupla injeção.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1),
    sendDefaultPii: process.env.SENTRY_SEND_PII !== "0",
    maxBreadcrumbs: 100,
  });
} else if (process.env.NODE_ENV === "production") {
  // eslint-disable-next-line no-console
  console.warn("[Sentry] SENTRY_DSN ausente — erros não serão enviados ao painel.");
}
