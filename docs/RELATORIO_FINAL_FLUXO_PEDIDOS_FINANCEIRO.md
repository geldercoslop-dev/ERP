# Relatório Final — Fluxo Pedidos + Financeiro (GRS)

**Ciclo:** Fechar Fluxo Final de Pedidos (baixa/pendência) + preparar Financeiro com invariantes e auditoria.  
**Data:** 2025-03-05

---

## Resumo

Foram aplicadas melhorias de **auditoria** e **invalidação de cache** sem alterar regras de negócio nem o fluxo já implementado de NovaVenda/MeusPedidos/CargaBaixa.

---

## Mudanças por arquivo

### 1. `server/routers.ts`

- **Onde:** Handler de `pedidos.createVenda`, dentro do `for (const i of input.itens)`, ao baixar estoque (quando `statusPedido === 'GERADO'` e não há falta).
- **O quê:** Após cada `tx.update(db.produtos).set({ estoque: novoEstoque })`, passou a ser chamado `db.insertAuditLog(..., tx)` com:
  - `action: "SAIDA"`, `entity: "estoque"`, `entityId: produtoId`
  - `payloadJson`: `pedidoId`, `produtoId`, `quantidade`, `saldoAnterior`, `saldoNovo`
  - `actorUserId` / `actorVendedorId` conforme contexto (admin vs vendedor).
- **Motivo:** Garantir que toda baixa de estoque no pedido gere registro em `audit_log`, alinhado à regra “toda movimentação crítica gera audit_log”.

### 2. `client/src/pages/MeusPedidos.tsx`

- **Onde:** `onSuccess` da mutation `marcarEntregueMutation`.
- **O quê:** Além de `utils.pedidos.list.invalidate()`, passou a invalidar:
  - `utils.contasReceber.list.invalidate()`
  - `utils.comissoes.list.invalidate()`
- **Motivo:** Após marcar pedido como entregue, as telas de Contas a Receber e Comissões passam a refletir os novos registros sem precisar recarregar a página.

### 3. `client/src/pages/CargaBaixa.tsx`

- **Onde:** Após sucesso de `baixarPedido.mutateAsync(payload)` (após fechar o modal e limpar estado).
- **O quê:** Além de `utils.cargas.getById.invalidate({ id: cargaId })`, passou a invalidar:
  - `utils.cargas.list.invalidate()`
  - `utils.pedidos.list.invalidate()`
  - `utils.contasReceber.list.invalidate()`
  - `utils.comissoes.list.invalidate()`
- **Motivo:** Após dar baixa em um pedido da carga, listas de cargas, pedidos, contas a receber e comissões ficam atualizadas.

---

## Como testar rapidamente

1. **Auditoria de estoque no pedido**
   - Criar um pedido (Nova Venda) com itens de catálogo que tenham estoque suficiente.
   - Confirmar que o pedido é criado com status GERADO.
   - No banco, conferir em `audit_log` registros com `entity = 'estoque'` e `action = 'SAIDA'` para cada produto que teve estoque reduzido (payload com `pedidoId`, `produtoId`, `quantidade`, `saldoAnterior`, `saldoNovo`).

2. **Invalidação em “Meus Pedidos”**
   - Com um pedido GERADO/IMPRESSO, abrir “Marcar como entregue”, preencher forma de pagamento e confirmar.
   - Sem recarregar a página, abrir Contas a Receber e Comissões: devem aparecer as novas contas e a comissão do pedido entregue.

3. **Invalidação na baixa por carga**
   - Em Cargas, abrir uma carga EM_ROTA e ir em “Dar baixa”.
   - Dar baixa em um pedido (formas e valores).
   - Sem recarregar, abrir Contas a Receber e Comissões: devem aparecer os novos registros.

---

## Gates

Recomendado rodar no ambiente local:

```bash
npm run check
npm run test:core
npm run build
```

- **check:** `tsc --noEmit` — durante a execução não foi reportado erro de tipo nas alterações.
- **test:core:** executa `tsx server/tests/run-core-tests.ts` (pode depender de banco/config).
- **build:** build Vite + esbuild do server; validar que conclui sem erro.

Nenhuma alteração foi feita em contratos tRPC nem em assinaturas públicas; apenas uso de `insertAuditLog` já existente e invalidações de queries.

---

## Riscos / observações

- **Audit em createVenda:** O `insertAuditLog` é chamado dentro da mesma transação do command (com `tx`), então em caso de rollback o log não é persistido, mantendo consistência.
- **Front:** Apenas invalidação de cache; não há novo estado derivado nem lógica duplicada.
- **Baseline:** Fluxos de NovaVenda (vendedor, cliente, confirmação por `vendedorEfetivoId`), baixa em transação e geração de recebíveis/parcelas em `baixarPedidoDireto` foram mantidos como estavam.

---

## Documentos gerados

- `docs/PLANO_EXECUCAO_FLUXO_PEDIDOS_FINANCEIRO.md` — plano, fases e checklist.
- `docs/RELATORIO_FINAL_FLUXO_PEDIDOS_FINANCEIRO.md` — este relatório.
