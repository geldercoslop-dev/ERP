# Idempotência no Banco — Constraint e Concorrência

## Constraint escolhida

**`UNIQUE(commandName, key)`** — índice único composto pelas colunas `commandName` e `key`.

- **Arquivo de migração:** `drizzle/0006_idempotency_unique_command_key.sql`
- **Nome da constraint:** `idempotency_cmd_key`

## Por que evita duplicação em requests simultâneos

1. **Reserva atômica:** O command faz primeiro um `INSERT` com `(commandName, key, resultJson=NULL)`. Só um dos requests simultâneos com a mesma `(commandName, key)` consegue inserir; o outro recebe erro de violação de UNIQUE.

2. **Sem race:** Quem inseriu executa o handler, preenche `resultJson` e dá commit. Quem falhou no INSERT faz `SELECT` pela mesma `(commandName, key)`: se já existir `resultJson`, devolve o resultado gravado (idempotência); se ainda estiver NULL, trata como “em processamento” e retorna erro amigável (ex.: 409).

3. **Mesma chave, comandos diferentes:** A mesma string `key` pode ser usada em comandos diferentes (ex.: `createVenda` e `contasReceber.create`), pois a unicidade é por `(commandName, key)`.

4. **Índice em `createdAt`:** Facilita limpeza/TTL de chaves antigas (ex.: remover registros com mais de 24h).

## TTL de retenção

- **Retenção:** 7 dias. Registros com `createdAt` anterior a 7 dias são candidatos à limpeza.
- **Script:** `scripts/maintenance/cleanup-idempotency.ts` (ou rodar via `scripts/BOTAO_LIMPAR_IDEMPOTENCY.bat` no Windows).

## Política para “em processamento” antigo

- **Registros com `resultJson` NULL** (comando ainda não concluído) há mais de **15 minutos** são considerados “travados” (ex.: processo caiu no meio).
- **Ação:** o script de limpeza **deleta** esses registros para que a mesma chave possa ser reutilizada. Alternativa: marcar como falha em coluna futura; por ora, deletar é suficiente.

## Uso no código

- **Reserva:** Dentro da transação, `INSERT` em `idempotency_keys` com `resultJson = NULL`.
- **Conclusão:** Após o handler executar com sucesso, `UPDATE` da mesma linha com `resultJson` e `traceId`.
- **Leitura em caso de conflito:** `SELECT ... WHERE commandName = ? AND key = ?` para decidir entre “retornar resultado” ou “em processamento”.
