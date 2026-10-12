# Estado Estável — ERP GRS

Referência rápida do estado estável atual do repositório.

## Branch estável

```
backup/base-infra-stable
```

## Tags estáveis

| Tag | Commit | Marco |
|-----|--------|-------|
| `TENANT_FKS_PHYSICAL_V1` | `8867b656a` | FKs físicas `users`/`vendedores` → `tenants` (migration 0011) |
| `FRESH_DB_BOOTSTRAP_STABLE_V1` | `6effe2c52` | Comando oficial `db:bootstrap:fresh` |

## Comandos de banco

- **Banco totalmente vazio (local/dev/descartável)**:

  ```powershell
  npm run db:bootstrap:fresh
  ```

  Detalhes: [`FRESH_DB_BOOTSTRAP.md`](FRESH_DB_BOOTSTRAP.md)

- **Banco já baselineado** (aplica apenas deltas pendentes):

  ```powershell
  npm run db:migrate
  ```

## Regras operacionais

- **Não** usar `db:migrate` puro em banco vazio (falha na `0004` — ver FRESH_DB_BOOTSTRAP.md).
- **Não** usar `db:push` em produção sem plano e backup revisados.
- **Não** mover nem recriar tags estáveis (`TENANT_FKS_PHYSICAL_V1`, `FRESH_DB_BOOTSTRAP_STABLE_V1`).
- **Não** usar `--no-verify` — os hooks de pre-commit/pre-push são obrigatórios.
- **Não** usar `git add .` / `git add -A` — stagear arquivos explicitamente.
- **Não** alterar migrations antigas ou `drizzle/schema.ts` sem missão formal com janela autorizada.

## Validações padrão

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.server.json --noEmit   # TSC
node scripts/router-db-wall.mjs                                          # RDW
node scripts/anti-regress-check.js                                       # AR
node scripts/architecture-contract-guard.mjs                             # ACG
node scripts/guardrail-check.js                                          # GR
node node_modules/vitest/vitest.mjs run server/tests/schema-consistency.test.ts  # SC (66/66)
```
