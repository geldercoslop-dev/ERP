# Entrega — TURBO 2 ERRO ZERO

## 1. Lista de arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `drizzle/schema.ts` | idempotency_keys: removido `.unique()` de `key`; adicionado `unique("idempotency_cmd_key").on(commandName, key)` e índice `createdAtIdx`. |
| `drizzle/0006_idempotency_unique_command_key.sql` | **Novo.** Migração: drop UNIQUE(key), add UNIQUE(commandName, key), índice createdAt. |
| `docs/IDEMPOTENCY_DB.md` | **Novo.** Constraint UNIQUE(commandName, key), por que evita duplicação em concorrência. |
| `docs/ERRO_ZERO_FINAL_CHECKLIST.md` | **Novo.** Checklist RBAC, idempotência, transação, backup, test:core. |
| `docs/ENTREGA_TURBO2_ERRO_ZERO.md` | **Novo.** Este documento. |
| `server/db.ts` | `getIdempotencyResult(commandName, key, tx?)`; `reserveIdempotencyKey(tx, commandName, key)`; `updateIdempotencyResult(tx, commandName, key, resultJson, traceId)`; `setIdempotencyResult` mantido como deprecated. `baixarPedidoDireto` com 3º parâmetro `tx` opcional; corpo em `runBody(t)`; se `tx` passado usa `runBody(tx)`, senão `client.transaction(runBody)`. `createContaReceber(data, tx?)` aceita `tx` opcional. |
| `server/_core/command.ts` | Fluxo atômico: dentro da tx, `reserveIdempotencyKey` (INSERT); se duplicata, SELECT e retorno de resultado ou `IdempotencyInProgressError`; handler; `updateIdempotencyResult`. Classe `IdempotencyInProgressError`. |
| `server/routers.ts` | createVenda e contasReceber.create passam a usar `executeCommand` (handler com tx); retorno com `ok` e `traceId`. marcarEntregue com `idempotencyKey` opcional e `executeCommand`, chamando `baixarPedidoDireto(..., tx)`. Tratamento de `IdempotencyInProgressError` → TRPCError CONFLICT. |
| `client/src/pages/NovaVenda.tsx` | Ajuste de tipo: `setPedidoId(Number(res.id))`, `setCliente(..., id: Number(res.clienteId))`. |
| `server/tests/run-core-tests.ts` | Teste idempotência com `reserveIdempotencyKey` + `updateIdempotencyResult` e `getIdempotencyResult("testCommand", key)`. Teste “2ª chamada” com mesmo key (cache). Teste concorrência: dois `executeCommand` em paralelo com mesma key → mesmo resultado. |

---

## 2. Confirmações explícitas

- **Idempotência atômica e dentro da transação em todos os comandos críticos:**  
  createVenda, contasReceber.create e baixarPedidoDireto (marcarEntregue) usam `executeCommand`. Dentro da mesma transação: reserva da chave (INSERT), execução do handler, gravação do resultado (UPDATE). Não há gravação de idempotência “depois” fora da tx.

- **UNIQUE constraint existe e cobre concorrência:**  
  Constraint `idempotency_cmd_key` UNIQUE(`commandName`, `key`) em `idempotency_keys` (schema + migração 0006). Dois requests simultâneos com a mesma (commandName, key) fazem um único INSERT com sucesso; o outro recebe ER_DUP_ENTRY e faz SELECT: se já existir resultJson retorna cache; se não (em processamento) retorna erro “em processamento”.

- **baixarPedidoDireto transacional e idempotente:**  
  baixarPedidoDireto aceita `tx` opcional e, quando chamado via executeCommand, usa a tx do command (reserva + baixa + update idempotência na mesma tx). marcarEntregue exige ownership, aceita `idempotencyKey` opcional e chama `executeCommand({ commandName: "baixarPedidoDireto", idempotencyKey }, handler)` com handler que chama `baixarPedidoDireto(..., tx)`.

---

## 3. Saída de npm run check e npm run test:core

- **npm run check:** Passou (exit 0).  
  ```
  > tsc --noEmit
  ```

- **npm run test:core:** Depende de MySQL rodando e migrações 0005 e 0006 aplicadas. No ambiente em que não há banco disponível, falha por “banco indisponível”. Com banco e migrações ok, os testes cobrem: estoque negativo, rollback de transação, idempotência (reserva+update+get), idempotência 2ª chamada (cache), concorrência (dois executeCommand em paralelo com mesma key).

---

## 4. Onde encontrar os novos docs

- **IDEMPOTENCY_DB.md:** `docs/IDEMPOTENCY_DB.md` — constraint UNIQUE(commandName, key), por que evita duplicação em requests simultâneos, uso no código.
- **ERRO_ZERO_FINAL_CHECKLIST.md:** `docs/ERRO_ZERO_FINAL_CHECKLIST.md` — checklist manual RBAC, idempotência, transação, audit/traceId, backup, test:core e migrações.
