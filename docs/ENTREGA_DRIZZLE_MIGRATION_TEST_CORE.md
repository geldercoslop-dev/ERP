# Entrega: Drizzle ESM + Migration + test:core

## Objetivo
Resolver erro ESM no `drizzle.config.ts`, garantir tabela `idempotency_keys` via **migrations** e fazer `npm run test:core` passar.

---

## 1) Migrations como única fonte da tabela idempotency_keys

- **Não existe mais criação manual em `ensureSchema()`** em `server/db.ts`. A tabela `idempotency_keys` é criada **apenas** pelas migrations Drizzle.
- **Migration usada:** `drizzle/0005_idempotency_keys.sql` cria a tabela já com:
  - `UNIQUE KEY idempotency_cmd_key (commandName, key)` — **obrigatória** para concorrência segura.
  - `INDEX idempotency_created_at_idx (createdAt)`.
  - Coluna `createdAt` com `DEFAULT CURRENT_TIMESTAMP`.
- Não existe migration 0006 no journal atual; a 0005 já define a estrutura final. O journal (`drizzle/meta/_journal.json`) contém as entradas 0000 a 0005.

---

## 2) Regra final: UNIQUE(commandName, key)

A constraint **UNIQUE(commandName, key)** é obrigatória. Ela garante que:
- Retries e cliques duplos não criem duplicatas.
- O código em `reserveIdempotencyKey` trata `ER_DUP_ENTRY` e devolve o resultado já existente.

---

## 3) Se a tabela não existir

Se o runtime acessar a tabela e ela não existir (ex.: migrate não foi rodado), as funções de idempotência em `server/db.ts` falham com mensagem clara:

**"Tabela idempotency_keys não existe. Rode: npm run db:migrate"**

---

## 4) Validação da tabela (script)

- **Script:** `server/scripts/validate-idempotency-table.ts`
- **Comando:** `npm run db:validate`
- O script conecta ao MySQL (mesmo pool/config do projeto), consulta INFORMATION_SCHEMA (colunas e índices) e valida:
  - Existência da tabela.
  - UNIQUE cobrindo `(commandName, key)` (índice `idempotency_cmd_key`).
  - Coluna `createdAt` com default `CURRENT_TIMESTAMP` ou `current_timestamp()`.
  - Índice em `createdAt` (`idempotency_created_at_idx`).
- Exit code 0 se OK; 1 com mensagem clara em caso de falha.

---

## 5) Comandos validados

| Comando | Descrição |
|--------|-----------|
| `npm run check` | `tsc --noEmit` sem erros. |
| `npm run db:migrate` | Aplica as migrações da pasta `drizzle/` (incluindo 0005). |
| `npm run db:validate` | Valida estrutura da tabela `idempotency_keys` no banco. |
| `npm run test:core` | Testes de núcleo (incl. idempotência) passam. |

---

## 6) Arquivos relevantes

| Arquivo | Papel |
|---------|--------|
| `drizzle/0005_idempotency_keys.sql` | Criação da tabela com UNIQUE e índice em createdAt. |
| `drizzle/meta/_journal.json` | Lista migrations 0000–0005. |
| `server/db.ts` | **Não** cria `idempotency_keys`; usa a tabela e falha com mensagem clara se não existir. |
| `server/scripts/run-migrate.ts` | Executa migrations (usado por `npm run db:migrate`). |
| `server/scripts/validate-idempotency-table.ts` | Validação programática da tabela (`npm run db:validate`). |
