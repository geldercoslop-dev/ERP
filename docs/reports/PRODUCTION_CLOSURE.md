# Fechamento produção — LEO, testes de carga e resiliência

## Parte 1 — LEO (fila por sessão)

- **Arquivo:** `server/leo/runtime/leo-session-gate.ts`
- **Regra:** uma execução ativa por `sessionKey`; demais requisições **aguardam em fila** (Promise chain).
- **Chave:** `buildLeoSessionKey(tenantId, userId, sessionId?, fallbackLabel?)`
  - Com `sessionId` (ex.: id da aba no frontend): `leo:{tenant}:sess:{sessionId}`
  - Sem `sessionId`: `leo:{tenant}:user:{userId}` ou label fallback.
- **Integrações:**
  - `server/services/ai/erp-ai.service.ts` — `perguntar` e `confirmarAcao` encapsulados com `leoSessionGate.run`.
  - `server/routers/leo.ts` — inputs aceitam `sessionId?: string` (opcional).
  - `server/leo/agent/agent-core.ts` — `handleRequest` serializado por sessão; `sessionId` também pode vir de `context.sessionId`.
  - `server/routers/leo.router.ts` — `ask` / `agentAsk` passam `sessionId` ao agent.

## Parte 2 — Load test (tRPC local)

- **Arquivo:** `util/test/load-test.ts`
- **Comportamento:** 20–50 chamadas paralelas a `auth.login`, `pedidos.list`, `contasReceber.list` via `appRouter.createCaller`.
- **Env:** `LOAD_CONCURRENCY`, `LOAD_TENANT_ID`
- **Script:** `pnpm run test:load`

## Parte 3 — DB stress / circuit breaker (testável sem MySQL)

- **Arquivo:** `server/services/ai/db-resilience.ts` — classe `DbCircuitBreaker`.
- **Script:** `pnpm run test:db-stress` → `util/test/db-stress-test.ts`

## Parte 4 — Anti-regressão

| Teste | Onde |
|-------|------|
| Fila LEO | `server/tests/leo-session-gate.test.ts`, `util/test/leo-test.ts` |
| Concorrência / idempotência (DB real) | `server/services/core-business-real.test.ts` |
| Suite agregada | `pnpm run test:anti-regression` → `util/test/run-all.ts` |

## Scripts `package.json`

- `test:anti-regression` — leo + db-stress + vitest (gate + core-business-real)
- `test:leo-gate` — script tsx rápido
- `test:load` — carga tRPC
- `test:db-stress` — circuit breaker

## Validação

```bash
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run test:anti-regression
```

## Riscos remanescentes (honestidade)

- Load test e `core-business-real` dependem de **MySQL** e dados/credenciais de dev.
- Middleware global de circuit breaker de DB **não** foi alterado; o breaker em `db-resilience` é para **serviços/testes** explícitos.
- Carga HTTP real (nginx/latência rede) não é coberta pelos scripts tRPC locais.
