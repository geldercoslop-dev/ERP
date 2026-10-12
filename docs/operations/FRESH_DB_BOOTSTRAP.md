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

## Procedimento oficial — banco novo local/dev

1. **Criar database vazio**

   ```sql
   CREATE DATABASE erp_dev;
   ```

2. **Rodar schema push apontando para o banco**

   `drizzle.config.ts` tem a URL hardcoded para `erp`; para outro banco, use flags explícitas:

   ```powershell
   npx drizzle-kit push --dialect=mysql --url="mysql://root:root@localhost:3306/erp_dev" --schema=drizzle/schema.ts
   ```

   Isso cria todas as tabelas **com FKs físicas** derivadas de `schema.ts` (incluindo `users.tenant_id` e `vendedores.tenant_id → tenants.id`).

3. **Garantir tenant `id=1`**

   ```sql
   INSERT INTO tenants (id, nome_empresa, plano, status)
   VALUES (1, 'GRS Móveis', 'default', 'ACTIVE')
   ON DUPLICATE KEY UPDATE id = id;
   ```

4. **Garantir admin/vendedor baseline**

   ```powershell
   $env:DATABASE_URL = 'mysql://root:root@localhost:3306/erp_dev'
   npx tsx server/scripts/seed-tenant.ts
   ```

   Parte da suíte usa `vendedorId: 1` hardcoded — garanta que exista `vendedores.id=1` (o script `seed-tenant.ts` cria o par user+vendedor `Administrador`).

5. **Marcar journal como baseline aplicado** (se o fluxo exigir)

   Copiar as linhas de `__drizzle_migrations` de um banco já baselineado, ou inserir os hashes do journal, para que o migrador reconheça o estado e não tente reaplicar deltas sobre objetos já criados pelo push.

6. **Rodar `npm run db:migrate`**

   Com o journal marcado, deve sair `exit 0` — "Validação de consistência OK", nada pendente.

7. **Rodar validações** (ver seção abaixo).

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
