/**
 * Sentry – carregar ANTES do Express (obrigatório em ESM).
 * Rode com: tsx --import ./instrument.ts server/_core/index.ts
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
    maxBreadcrumbs: 100,
  });
}
