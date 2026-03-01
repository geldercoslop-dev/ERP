# Sentry + stack de monitoramento

Checklist do que está no projeto vs o que você configura no painel.

---

## ✅ Já feito no projeto

| Item | Onde | Observação |
|------|------|------------|
| **Sentry (erros)** | Client + Server | DSN no `.env` para ativar |
| **Session Replay** | `client/src/sentry.ts` | `replayIntegration()` – grava sessão para reproduzir o que o usuário fez |
| **Performance / Tracing** | Client + Server | `browserTracingIntegration()`, `tracesSampleRate: 1.0` |
| **Source Maps** | `vite.config.ts` | Plugin `@sentry/vite-plugin` – no **build** com `SENTRY_AUTH_TOKEN` faz upload dos source maps (stack trace legível em produção) |
| **why-did-you-render** | `client/src/wdyr.ts` | **Só em DEV** – console mostra por que cada componente re-renderizou (ajuda a otimizar) |

---

## 🔧 Source Maps (upload no build)

Para stack traces legíveis em produção:

1. Em [sentry.io](https://sentry.io) → **Settings** → **Auth Tokens** crie um token (scope: `project:releases`).
2. No Sentry, anote **Organization slug** e **Project slug** (ex.: org `minha-org`, project `vendas-app`).
3. No `.env` (ou no CI):

```env
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_ORG=minha-org
SENTRY_PROJECT=vendas-app
# Opcional: release único por deploy (ex.: vendas-app@1.0.0 ou git sha)
SENTRY_RELEASE=vendas-app@1.0.0
```

4. Build: `pnpm run build`. Com o token definido, o plugin sobe os source maps; no client o `release` já está configurado para bater com o upload.

---

## 📬 Slack + Issue Tracker (Linear / Jira / GitHub)

Isso é configurado **no painel do Sentry**, não no código:

1. **Slack:** Sentry → **Settings** → **Integrations** → **Slack** – conecte o workspace; em **Alerts** crie regras para enviar erros a um canal.
2. **Linear / Jira / GitHub:** Em **Settings** → **Integrations** ative **Linear**, **Jira** ou **GitHub**. Depois, em cada **Issue** no Sentry você pode criar o link para o ticket no tracker.

Assim cada erro novo pode vir para o Slack e virar issue no seu tracker.

---

## 🔬 OpenTelemetry (observabilidade “enterprise”)

Se no futuro você quiser traces distribuídos (front → API → DB, métricas, logs unificados):

- Sentry já usa tracing; para integrar com **OpenTelemetry** (outros backends, Prometheus, etc.) dá para usar `@sentry/opentelemetry` ou o SDK Node com `openTelemetryInstrumentations` no `Sentry.init()`.
- Não está no projeto hoje; dá para adicionar quando fizer sentido (ex.: múltiplos serviços, métricas custom, export para Grafana).

---

## Resumo rápido

- **Erros + Replay + Tracing:** já configurados; basta DSN (e, para source maps, token no build).
- **Slack / Linear / Jira / GitHub:** configurar em **Sentry → Settings → Integrations**.
- **why-did-you-render:** já ativo em dev; ver console do navegador.
- **OpenTelemetry:** opcional, para quando quiser stack mais “enterprise”.

## Ativar Sentry (só DSN)

1. [sentry.io/signup](https://sentry.io/signup) → crie projeto (JavaScript/React + Node).
2. Copie o DSN e no `.env`:

```env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

3. Reinicie o app.

---

## Como testar se o Sentry está recebendo erros

**Backend:** Com o servidor rodando e `SENTRY_DSN` no `.env`, abra no navegador:

- **http://localhost:3003/api/debug-sentry**

Isso gera um erro de teste no servidor. Em alguns segundos o erro deve aparecer em [sentry.io](https://sentry.io) → seu projeto → **Issues**.

**Frontend:** Em qualquer tela, no console do navegador (F12), rode:

- `throw new Error("Teste Sentry frontend");`

O ErrorBoundary vai capturar e enviar para o Sentry (se `VITE_SENTRY_DSN` estiver no `.env`).
