# Auditoria de performance — observação de logs sob carga

Objetivo: durante o load (`pnpm run test:http-perf` ou ferramenta externa), **capturar o stdout/stderr do servidor** e classificar sinais de lentidão, gargalo de DB e erros intermitentes.

## Como capturar logs

**Windows (PowerShell)** — terminal do backend:

```powershell
pnpm dev 2>&1 | Tee-Object -FilePath server-load.log
```

**Linux/macOS:**

```bash
pnpm dev 2>&1 | tee server-load.log
```

Em outro terminal, rode a carga. Depois:

```bash
pnpm run audit:perf-logs -- server-load.log
```

Ou:

```bash
node scripts/http-perf/audit-logs.mjs server-load.log
```

## O que procurar (manual)

| Sinal | Interpretação |
|--------|----------------|
| `[TRPC onError]` + `sqlMessage` | Erro de negócio ou SQL sob concorrência |
| `[Database] Unexpected pool error` | Pool MySQL em stress ou rede instável |
| `Connection lost. Attempting to recreate pool` | Conexões caindo — possível gargalo ou timeout de rede |
| `ER_LOCK_DEADLOCK` / `Lock wait timeout` | Contenção de escrita (pedidos/caixa/boletos) |
| `Too many connections` | Aumentar `max_connections` no MySQL ou reduzir pool/concorrência do app |
| `ETIMEDOUT` / `PROTOCOL_CONNECTION_LOST` | DB lento ou rede; correlacionar com p99 do autocannon |
| `429` / `TOO_MANY_REQUESTS` | Rate limit (ex.: auth.login em rajada) |

## Saída do analisador

- **✔ ok** — nenhum padrão crítico/aviso configurado encontrado no arquivo.
- **⚠ lento** — reconexão de pool, timeouts, indícios de query lenta, rate limit.
- **❌ problema** — TRPC onError em massa, deadlock, pool fatal, processo instável.

> Ajuste o nível de log do MySQL (`slow_query_log`) se precisar de evidência explícita de queries lentas; o analisador reconhece mensagens comuns quando presentes no arquivo.

## Relacionado

- `scripts/http-perf/README.md` — teste HTTP e variáveis de ambiente.
- `docs/reports/HTTP_PERF_REAL_REPORT.md` — relatório gerado pelo runner de carga.
