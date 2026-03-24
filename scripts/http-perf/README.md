# HTTP perf (produção-like)

Testes reais via HTTP com **autocannon** (dependência do repo) ou **k6** (opcional).

## Pré-requisitos

- API no ar: `http://localhost:<PORT>` (ex.: `pnpm dev` ou build + `node dist/...`).
- Credenciais de um **vendedor** (ou usuário com vendedor vinculado) para `auth.login`.
- Para **concorrência / mesma idempotencyKey**: `HTTP_PERF_CLIENTE_ID` (evita corrida na criação de cliente).
- Para **baixa de boleto**: usuário **admin** + `HTTP_PERF_BOLETO_ID` + `HTTP_PERF_VALOR_PAGO`.

## Autenticação

O SPA envia `X-Session-Token` e `Authorization: Bearer <mesmo token>` após login (`authStore`). O script replica isso automaticamente ao mesclar `postHeaders` com `x-session-token`. O servidor resolve cookie / header / Bearer no mesmo modelo que `createContext` e o middleware de API.

## CSRF e formato tRPC batch

O script obtém `GET /api/csrf-token` e envia **cookie `csrf-token`** + header **`x-csrf-token`** em todos os POST (igual ao fluxo real). O corpo batch segue o client (`{ "0": { ...input } }`), não `{ "0": { "json": ... } }`.

## Comando principal (autocannon)

```bash
set HTTP_PERF_BASE_URL=http://localhost:3001
set HTTP_PERF_USERNAME=seu_usuario
set HTTP_PERF_PASSWORD=sua_senha
set HTTP_PERF_CLIENTE_ID=1
pnpm exec node scripts/http-perf/run-http-perf.mjs
```

Variáveis úteis:

| Variável | Descrição |
|----------|-----------|
| `HTTP_PERF_ONLY` | `health`, `auth`, `pedidos`, `finance`, `concurrency`, `all` |
| `HTTP_PERF_DURATION` | Segundos por cenário autocannon (default 10) |
| `HTTP_PERF_AUTH_RPS` | Req/s no login (default 20) |
| `HTTP_PERF_PEDIDOS_CONN` | Conexões simultâneas em `createVenda` (default 35) |
| `HTTP_PERF_CLIENTE_ID` | Cliente existente (recomendado em concorrência / carga estável) |
| `HTTP_PERF_VENDEDOR_ID` | Com **login admin**, obrigatório para `createVenda` (senão erro de negócio). Com sessão vendedor (`v:…`), não usar. |
| `HTTP_PERF_ADMIN_USER` / `HTTP_PERF_ADMIN_PASSWORD` | Admin para `boletos.baixarParcial` |
| `HTTP_PERF_BOLETO_ID` / `HTTP_PERF_VALOR_PAGO` | Baixa parcial (carga leve; **não** use alta concorrência no mesmo boleto) |
| `HTTP_PERF_CONCURRENCY_TIMEOUT_MS` | Timeout por request no teste de 50 POST paralelos (default 120000) |
| `HTTP_PERF_DEBUG` | `1` imprime a primeira falha HTTP no cenário de concorrência |

Carga no servidor: ajuste pool/health MySQL (`DB_POOL_*`, `DB_HEALTH_*`, `HTTP_REQUEST_TIMEOUT_MS`) conforme `ENV_REQUIRED.md` se vir 503 sob stress.

**Índices DB (createVenda):** o schema Drizzle inclui `clientes_tenant_lookup_idx` e `counters_tenant_name_idx`. Após atualizar o schema, rode `pnpm db:push` (ou o SQL em `drizzle/manual-migrations/createvenda_perf_indexes.sql` se aplicável).

**Diagnóstico de fases (servidor):** `CREATE_VENDA_PERF_LOG=1` — logs estruturados em `pedidos.createVenda` com `perfPhases` (ms por etapa: vendedor, cliente/link, counter, estoque, pedido, itens em batch, conta).

Relatório gerado em: `docs/reports/HTTP_PERF_REAL_REPORT.md`

## k6 (opcional)

```bash
k6 run scripts/http-perf/k6-http-perf.js
```

Defina `K6_HTTP_PERF_BASE_URL`, `K6_HTTP_PERF_USER`, `K6_HTTP_PERF_PASS`.

## Critérios de validação

- Sem HTTP **500** nos cenários.
- Sem **timeout** (ajuste duração/conexões/servidor).
- Latência estável (ver média/p99 no relatório).
- **Auth**: `auth.login` + header `X-Session-Token` nas rotas protegidas.
- **Pedidos**: idempotência com a mesma chave → no máximo um `pedidoId` (com `HTTP_PERF_CLIENTE_ID`).
- **Pagamentos**: `boletos.baixarParcial` **não** expõe idempotency no router — o script não simula “guerra” de baixas no mesmo boleto; veja relatório e comentários no código.

## NPM

```bash
pnpm run test:http-perf
```

## Auditoria de logs (durante o load)

1. Grave o output do servidor (ex.: `Tee-Object server-load.log` no PowerShell).
2. Rode a carga (`pnpm run test:http-perf`).
3. Analise o log:

```bash
pnpm run audit:perf-logs -- server-load.log
```

Saída: **✔ ok** / **⚠ lento** / **❌ problema** conforme padrões (`[TRPC onError]`, pool MySQL, deadlock, etc.).  
Detalhes: `docs/operations/PERFORMANCE_AUDIT_LOGS.md`.
