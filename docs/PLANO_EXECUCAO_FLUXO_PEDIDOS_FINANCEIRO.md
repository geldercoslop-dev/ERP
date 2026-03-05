# Plano de Execução — Fluxo Final de Pedidos + Financeiro (GRS)

**Ciclo:** Fechar Fluxo Final de Pedidos (baixa/pendência) + preparar Financeiro (recebimentos/parcelas/boletos) com invariantes e auditoria.

**Data:** 2025-03-05

---

## Fase 0 — Auditoria inicial (concluída)

### Rotas/procedures relevantes
- **pedidos:** `list`, `getById`, `createVenda`, `marcarEntregue`, `updateStatus`, `delete`
- **cargas:** `baixarPedido` (baixa por carga)
- **contasReceber:** `list`, `create`, `marcarRecebida`, `delete`
- **comissoes:** `list`, `marcarPaga`
- **pendencias:** `list`, `updateStatus`

### Tabelas (Drizzle)
- `pedidos`, `itensPedido`, `pendencias`, `contasReceber`, `comissoes`, `boletos`, `caixaMensal`, `auditLog`, `idempotencyKeys`, `produtos`

### Invariantes existentes
- Estoque alterado apenas no backend (createVenda com FOR UPDATE; ajuste via `produtos.atualizarEstoque` / `ajusteEstoque.rapido`).
- Baixa de pedido em transação: `executeCommand` + `baixarPedidoDireto(tx)` ou `baixarPedidoCarga` → `baixarPedidoDireto`.
- `audit_log`: create/update/delete em vendedor, pedido (create + BAIXA), impersonation; ajuste de estoque e nota de entrada já registram SAIDA/ENTRADA.

### Impactos no front
- **createVenda:** invalida `pedidos.list`, `clientes.list`, `pendencias.list`, `produtos.list`.
- **marcarEntregue:** invalida apenas `pedidos.list` — falta invalidar `contasReceber.list` e `comissoes.list`.
- **cargas.baixarPedido:** invalida `cargas.getById` — falta invalidar `contasReceber.list`, `comissoes.list`, `pedidos.list`.

### Lacunas identificadas
1. Baixa de estoque em `createVenda` (quando status GERADO) não gera registro em `audit_log` (entity `estoque`, action `SAIDA`).
2. Após marcar pedido como entregue (direto ou via carga), listas de Contas a Receber e Comissões não são invalidadas no cliente.

---

## Fase 1 — Auditoria de baixa de estoque em createVenda

**Objetivo:** Garantir que toda movimentação crítica de estoque (saída no pedido) gere registro em `audit_log`.

**Arquivos:** `server/routers.ts`

**Mudanças:**
- No handler de `createVenda`, dentro do `for (const i of input.itens)`, após `tx.update(db.produtos).set({ estoque: novoEstoque })` quando `statusPedido === 'GERADO' && !falta`, chamar `db.insertAuditLog({ actorUserId, actorVendedorId, action: 'SAIDA', entity: 'estoque', entityId: i.produtoId, payloadJson: { pedidoId, produtoId, quantidade, saldoAnterior, saldoNovo }, traceId }, tx)`.

**Riscos:** Nenhum; insertAuditLog já aceita `tx` e não altera regra de negócio.

---

## Fase 2 — Invalidação de cache após baixa (marcarEntregue e CargaBaixa)

**Objetivo:** Após baixa de pedido (direta ou via carga), o front deve refletir novas contas a receber e comissões.

**Arquivos:**
- `client/src/pages/MeusPedidos.tsx`
- `client/src/pages/CargaBaixa.tsx`

**Mudanças:**
- Em **MeusPedidos:** no `onSuccess` de `marcarEntregueMutation`, além de `utils.pedidos.list.invalidate()`, chamar `utils.contasReceber.list.invalidate()` e `utils.comissoes.list.invalidate()`.
- Em **CargaBaixa:** após sucesso de `baixarPedido.mutateAsync`, além de `utils.cargas.getById.invalidate({ id: cargaId })`, chamar `utils.contasReceber.list.invalidate()`, `utils.comissoes.list.invalidate()` e `utils.pedidos.list.invalidate()`.

**Riscos:** Baixo; apenas invalidação de cache React Query.

---

## Fase 3 — Gates e relatório final

**Objetivo:** Validar que nenhum gate quebrou e entregar documentação.

**Ações:**
- Executar: `npm run check`, `npm run test:core`, `npm run build`.
- Redigir `docs/RELATORIO_FINAL_FLUXO_PEDIDOS_FINANCEIRO.md` com mudanças por arquivo, como testar e resultado dos gates.

---

## Checklist de aceite (critérios do ciclo)

- [x] Criar pedido e baixar: transação, audit_log, estoque consistente.
- [x] Se estoque ficar negativo (insuficiente): pendência gerada; pedido PENDENTE_ESTOQUE (já implementado).
- [x] Financeiro: ao salvar pedido com BOLETO/parcelas → na baixa (marcarEntregue) gera recebíveis/parcelas (já em `baixarPedidoDireto`).
- [ ] Gates 100% OK (a executar no final).
