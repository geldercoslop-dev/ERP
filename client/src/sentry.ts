/**
 * Sentry - monitoramento de erros em tempo real (React).
 * Inicializar o mais cedo possível (antes do React).
 */
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const release = import.meta.env.VITE_SENTRY_RELEASE;

if (dsn) {
  Sentry.init({
    dsn,
    release: release || undefined,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.5,
    replaysOnErrorSampleRate: 1.0,
    // Acesso total conforme solicitado: máximo de contexto para debugar
    sendDefaultPii: true,
    maxBreadcrumbs: 100,
  });
}

export default Sentry;
