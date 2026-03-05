# Entrega: Drizzle consistente + migrations + test:core

## Lista de arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `drizzle.config.ts` | Já estava com `out: "./drizzle"`, `dialect: "mysql"`, `dbCredentials.url` — nenhuma mudança. |
| `drizzle/0005_idempotency_keys.sql` | Reescrito: tabela criada já com UNIQUE(commandName, key), índice em createdAt, DEFAULT CURRENT_TIMESTAMP. |
| `drizzle/0006_idempotency_unique_command_key.sql` | **Removido** — lógica incorporada na 0005. |
| `drizzle/meta/_journal.json` | Entrada 0006 removida; journal só lista 0000–0005 (reflete arquivos em `./drizzle`). |
| `server/db.ts` | Removido bloco de criação de `idempotency_keys` em `ensureSchema` (fonte de verdade = migrations). |
| `server/scripts/validate-idempotency-table.ts` | Script de validação (opcional) para checar tabela no banco. |

---

## Diffs principais

### drizzle.config.ts (sem alteração)

```ts
export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: getDbUrl(),
  },
});
```

### drizzle/0005_idempotency_keys.sql (antes → depois)

**Antes:**
```sql
CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  ...
  CONSTRAINT `idempotency_keys_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE INDEX `idempotency_key_idx` ON `idempotency_keys` (`key`);
```

**Depois:**
```sql
-- Idempotência: evita duplicação por retry/clique duplo em commands críticos.
-- Regra final: UNIQUE(commandName, key) para concorrência segura.
CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `key` varchar(64) NOT NULL,
  `commandName` varchar(64) NOT NULL,
  `resultJson` text,
  `traceId` varchar(32),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `idempotency_cmd_key` (`commandName`, `key`),
  INDEX `idempotency_created_at_idx` (`createdAt`)
) ENGINE=InnoDB;
```

### drizzle/meta/_journal.json

Entradas 0004 e 0005 mantidas; entrada 0006 removida. Journal final (trecho):

```json
"entries": [
  { "idx": 0, "tag": "0000_puzzling_mysterio", ... },
  { "idx": 1, "tag": "0001_busy_vargas", ... },
  { "idx": 2, "tag": "0002_gray_vengeance", ... },
  { "idx": 3, "tag": "0003_wild_hedge_knight", ... },
  { "idx": 4, "tag": "0004_add_aberta_cargas", ... },
  { "idx": 5, "tag": "0005_idempotency_keys", ... }
]
```

---

## Saída do terminal: db:migrate

```
> vendas-app@1.0.0 db:migrate
> tsx server/scripts/run-migrate.ts
...
Migrações aplicadas com sucesso.
```
(Exit code: 0)

---

## Validação no MySQL (script validate-idempotency-table.ts)

```
--- Colunas idempotency_keys ---
id int(11) DEFAULT null
key varchar(64) DEFAULT null
commandName varchar(64) DEFAULT null
resultJson text DEFAULT NULL
traceId varchar(32) DEFAULT NULL
createdAt timestamp DEFAULT current_timestamp()

--- Índices ---
idempotency_cmd_key UNIQUE: true COL: commandName
idempotency_cmd_key UNIQUE: true COL: key
idempotency_created_at_idx UNIQUE: false COL: createdAt
PRIMARY UNIQUE: true COL: id

OK: tabela idempotency_keys existe com UNIQUE(commandName, key) e createdAt DEFAULT CURRENT_TIMESTAMP.
```

---

## Saída do terminal: test:core

```
> vendas-app@1.0.0 test:core
> tsx server/tests/run-core-tests.ts
...
[test:core] Todos os testes passaram.
```
(Exit code: 0)

---

## Resumo

- **PASSO 1:** `drizzle.config.ts` já com `out: "./drizzle"`, dialect mysql, dbCredentials por url.
- **PASSO 2:** 0005 cria a tabela já com UNIQUE(commandName, key) e DEFAULT CURRENT_TIMESTAMP; 0006 removido.
- **PASSO 3:** Journal contém apenas as migrations existentes em `./drizzle` (0000–0005).
- **PASSO 4:** `npm run db:migrate` executado com sucesso; validação confirma tabela e índice UNIQUE(commandName, key).
- **PASSO 5:** `npm run test:core` conclui com “Todos os testes passaram.” (exit 0).

Não há criação manual de tabela em `ensureSchema`; a fonte de verdade é o schema Drizzle + migrations.
