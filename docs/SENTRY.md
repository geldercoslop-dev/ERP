# Sentry + stack de monitoramento

Checklist do que estÃ¡ no projeto vs o que vocÃª configura no painel.

---

## âœ… JÃ¡ feito no projeto

| Item | Onde | ObservaÃ§Ã£o |
|------|------|------------|
| **Sentry (erros)** | Client + Server | DSN no `.env` para ativar |
| **Session Replay** | `client/src/sentry.ts` | `replayIntegration()` â€“ grava sessÃ£o para reproduzir o que o usuÃ¡rio fez |
| **Performance / Tracing** | Client + Server | `browserTracingIntegration()`, `tracesSampleRate: 1.0` |
| **Source Maps** | `vite.config.ts` | Plugin `@sentry/vite-plugin` â€“ no **build** com `SENTRY_AUTH_TOKEN` faz upload dos source maps (stack trace legÃ­vel em produÃ§Ã£o) |
| **why-did-you-render** | `client/src/wdyr.ts` | **SÃ³ em DEV** â€“ console mostra por que cada componente re-renderizou (ajuda a otimizar) |

---

## ðŸ”§ Source Maps (upload no build)

Para stack traces legÃ­veis em produÃ§Ã£o:

1. Em [sentry.io](https://sentry.io) â†’ **Settings** â†’ **Auth Tokens** crie um token (scope: `project:releases`).
2. No Sentry, anote **Organization slug** e **Project slug** (ex.: org `minha-org`, project `vendas-app`).
3. No `.env` (ou no CI):

```env
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_ORG=minha-org
SENTRY_PROJECT=vendas-app
# Opcional: release Ãºnico por deploy (ex.: vendas-app@1.0.0 ou git sha)
SENTRY_RELEASE=vendas-app@1.0.0
```

4. Build: `pnpm run build`. Com o token definido, o plugin sobe os source maps; no client o `release` jÃ¡ estÃ¡ configurado para bater com o upload.

---

## ðŸ“¬ Slack + Issue Tracker (Linear / Jira / GitHub)

Isso Ã© configurado **no painel do Sentry**, nÃ£o no cÃ³digo:

1. **Slack:** Sentry â†’ **Settings** â†’ **Integrations** â†’ **Slack** â€“ conecte o workspace; em **Alerts** crie regras para enviar erros a um canal.
2. **Linear / Jira / GitHub:** Em **Settings** â†’ **Integrations** ative **Linear**, **Jira** ou **GitHub**. Depois, em cada **Issue** no Sentry vocÃª pode criar o link para o ticket no tracker.

Assim cada erro novo pode vir para o Slack e virar issue no seu tracker.

---

## ðŸ”¬ OpenTelemetry (observabilidade â€œenterpriseâ€)

Se no futuro vocÃª quiser traces distribuÃ­dos (front â†’ API â†’ DB, mÃ©tricas, logs unificados):

- Sentry jÃ¡ usa tracing; para integrar com **OpenTelemetry** (outros backends, Prometheus, etc.) dÃ¡ para usar `@sentry/opentelemetry` ou o SDK Node com `openTelemetryInstrumentations` no `Sentry.init()`.
- NÃ£o estÃ¡ no projeto hoje; dÃ¡ para adicionar quando fizer sentido (ex.: mÃºltiplos serviÃ§os, mÃ©tricas custom, export para Grafana).

---

## Resumo rÃ¡pido

- **Erros + Replay + Tracing:** jÃ¡ configurados; basta DSN (e, para source maps, token no build).
- **Slack / Linear / Jira / GitHub:** configurar em **Sentry â†’ Settings â†’ Integrations**.
- **why-did-you-render:** jÃ¡ ativo em dev; ver console do navegador.
- **OpenTelemetry:** opcional, para quando quiser stack mais â€œenterpriseâ€.

## Ativar Sentry (sÃ³ DSN)

1. [sentry.io/signup](https://sentry.io/signup) â†’ crie projeto (JavaScript/React + Node).
2. Copie o DSN e no `.env`:

```env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

3. Reinicie o app.

---

## Como testar se o Sentry estÃ¡ recebendo erros

**Backend:** Com o servidor rodando e `SENTRY_DSN` no `.env`, abra no navegador:

- **http://localhost:3000/api/debug-sentry**

Isso gera um erro de teste no servidor. Em alguns segundos o erro deve aparecer em [sentry.io](https://sentry.io) â†’ seu projeto â†’ **Issues**.

**Frontend:** Em qualquer tela, no console do navegador (F12), rode:

- `throw new Error("Teste Sentry frontend");`

O ErrorBoundary vai capturar e enviar para o Sentry (se `VITE_SENTRY_DSN` estiver no `.env`).
