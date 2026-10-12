# Fresh DB Bootstrap — ERP GRS

Procedimento oficial para inicializar um banco de dados **totalmente vazio** (local/dev/descartável) com o schema completo do ERP, incluindo as FKs físicas de `tenants`.

## Situação

O projeto está em modo **baseline locked**:

- `drizzle/schema.ts` é o **contrato de domínio** — fonte de verdade estrutural.
- As migrations atuais em `drizzle/` são **delta-only**, aplicadas **após** a baseline (squash da baseline).

## Importante

`npm run db:migrate` **NÃO** é o comando correto para um banco totalmente vazio. Ele assume um banco **já baselineado** e só aplica deltas incrementais.

## Causa técnica

As migrations antigas `0000`/`0001` criavam as tabelas base (`produtos`, `clientes`, `pedidos`, `users`, `vendedores`, etc.). Elas **não existem mais** no diretório `drizzle/` atual (journal começa em `0002_lucky_bloodstorm`).

Por isso o replay puro falha na `0004_migration_1777592998701`, que executa `ALTER TABLE produtos` sobre uma tabela que nenhuma migration da cadeia atual cria:

```
ER_NO_SUCH_TABLE: Table 'erp_p25_replay_XXX.produtos' doesn't exist
```

## Comando oficial — banco novo local/dev

1. **Criar database vazio** (o script não cria nem dropa banco — ele já deve existir vazio)

   ```sql
   CREATE DATABASE erp_dev;
   ```

2. **Apontar `DATABASE_URL` da sessão para o banco e rodar o bootstrap**

   ```powershell
   $env:DATABASE_URL = 'mysql://root:root@localhost:3306/erp_dev'
   npm run db:bootstrap:fresh
   Remove-Item Env:DATABASE_URL
   ```

   Exemplo com banco temporário (nome com padrão `erp_p*`/`_fresh`/`_replay`/`_test`/`_dev`):

   ```powershell
   $env:DATABASE_URL = 'mysql://root:root@localhost:3306/erp_p26_fresh_20261012_130000'
   npm run db:bootstrap:fresh
   Remove-Item Env:DATABASE_URL
   ```

   O script `server/scripts/bootstrap-fresh-db.ts` executa **uma única vez** todo o pipeline seguro:

   - recusa `NODE_ENV=production` e host não local (aceita apenas `localhost`/`127.0.0.1`/`::1`);
   - recusa nome de database fora dos padrões dev/test/temp (flag `--allow-local-empty-db` para override consciente);
   - aborta se o banco não estiver vazio (única exceção: `__drizzle_migrations` vazia);
   - `drizzle-kit push` aplica `schema.ts` (tabelas + FKs físicas, incluindo `users.tenant_id`/`vendedores.tenant_id → tenants.id`);
   - marca `__drizzle_migrations` com as entries do journal atual (hash `sha256` do `.sql` + `created_at` = `when` do journal — mesmo cálculo do `drizzle-orm` migrator e do `migration-guard`);
   - seed idempotente: `tenants.id=1`, `users.id=1` (admin), `vendedores.id=1`;
   - `npm run db:migrate` → `exit 0` (nada pendente);
   - valida FKs, regras `RESTRICT|NO ACTION`, órfãos `0` e seeds;
   - sai com `FRESH_DB_BOOTSTRAP_OK` ou `FRESH_DB_BOOTSTRAP_ABORT` + motivo.

   Nome fora do padrão (`erp`, `erp_prod`, etc.) ainda pode ser usado conscientemente em dev:

   ```powershell
   npm run db:bootstrap:fresh -- --allow-local-empty-db
   ```

   O override **não** remove as outras proteções: host precisa ser local e o banco precisa estar vazio.

3. **`npm run db:migrate` continua sendo o caminho para banco já baselineado** — ele só aplica deltas pendentes do journal em cima de uma baseline existente. Não use para banco vazio.

## Validações obrigatórias pós-bootstrap

- **schema-consistency**: `66/66`
  ```powershell
  node node_modules/vitest/vitest.mjs run server/tests/schema-consistency.test.ts
  ```
- **FKs tenants** (`information_schema.KEY_COLUMN_USAGE`):
  - `users.tenant_id → tenants.id`
  - `vendedores.tenant_id → tenants.id`
- **Regras**: `RESTRICT` **ou** `NO ACTION` no MySQL (são sinônimos — `NO ACTION` é o nome físico que o `drizzle-kit push` grava; `RESTRICT` é o nome gravado pela migration `0011`).
- **Órfãos**: `users` sem tenant válido = `0`; `vendedores` sem tenant válido = `0`.
- **Suíte geral**: `37/37` files, `423/423` tests.
  ```powershell
  node node_modules/vitest/vitest.mjs run
  ```

## Achado P25

A missão **P25-FRESH-DB-MIGRATION-REPLAY** validou esse procedimento no banco temporário `erp_p25_replay_20261012_131528`:

- `db:migrate` puro falhou na `0004` (delta-only confirmado);
- `drizzle-kit push` criou 31 tabelas + 38 FKs (únicas diferenças: nome de constraint em `stock_movements_produto_id`);
- journal marcado com as 11 entradas + `db:migrate` → `exit 0`;
- seed tenant `id=1` + admin baseline;
- schema-consistency `66/66`, suíte geral **37/37 files e 423/423 tests** no banco temporário;
- banco temporário dropado ao final; `erp` principal intacto (34 tabelas, FKs intactas, 0 órfãos).

## Limite

⚠️ **Não usar este procedimento em produção** sem backup completo e plano de migração revisado. `db:push` é ferramenta de sincronização direta de schema — em produção o caminho é sempre migrations versionadas + backup.
