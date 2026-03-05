# Auditoria de Performance e Consistência — GRS ERP

**Escopo:** Queries sem índice, N+1, paginação server-side, listas completas desnecessárias.

---

## 1. Índices (schema atual)

- **pedidos:** `vendedor_idx` (vendedorId), `cliente_idx`, `status_idx`, `numero_idx`.
- **clientes:** `nome_idx`, `telefone_idx`.
- **contasReceber:** sem índice explícito em `vendedorId` no schema; filtro por vendedor em list.
- **boletos:** `cliente_idx`, `status_idx`, `vencimento_idx`; tabela tem `vendedorId` (FK).
- **comissoes:** `vendedor_idx`.
- **itensPedido:** `pedido_idx`.
- **audit_log:** `audit_entity_idx`, `audit_entity_id_idx`, `audit_created_at_idx`.
- **idempotency_keys:** `idempotency_key_idx` (key).

**Recomendação:** Adicionar índice em `contas_receber.vendedorId` se listas por vendedor forem frequentes (ex.: `CREATE INDEX idx_vendedor ON contas_receber(vendedorId);` via migração).

---

## 2. N+1

- **pedidos.list:** Uma query com join em vendedores; sem N+1.
- **clientes.list (vendedor):** `listClientesByVendedor` faz: 1) select pedidos (clienteId) por vendedor, 2) select clientes por lista de ids. Dois round-trips; não é N+1 clássico.
- **boletos.list (admin):** Uma query com join em clientes.
- **contasReceber.list:** Uma query; vendedor usa `getContasReceberByVendedor` (uma query).

Nenhum padrão N+1 óbvio identificado nas listagens principais.

---

## 3. Paginação server-side

- **pedidos.list:** Retorna **todos** os pedidos do vendedor (ou admin) que batem com filtros; **não há** paginação (sem `limit`/`offset`). Em bases grandes, pode travar. **Recomendação:** adicionar `limit`/`offset` ou cursor e paginação no front.
- **clientes.list:** Retorna lista completa (admin ou por vendedor). **Recomendação:** idem.
- **contasReceber.list:** Lista completa por status. **Recomendação:** paginação.
- **boletos.list:** Lista completa (admin ou vendedor). **Recomendação:** paginação.

**Conclusão:** Ainda não há paginação server-side nas listas principais; é desejável para Fase 6 (Performance).

---

## 4. Listas completas desnecessárias

- **produtos.list:** Retorna todos os produtos (catálogo). Em catálogo grande, considerar paginação ou busca sob demanda.
- **estoqueBaixo:** Usa `produtosRoutes.verificarEstoqueBaixo`; verificar se não carrega lista gigante.
- **diagnostico.run:** Admin-only; pode fazer várias queries; aceitável para ferramenta interna.

---

## 5. Resumo

| Item | Status | Ação sugerida |
|------|--------|----------------|
| Índices | Parcial | Índice em `contas_receber.vendedorId` se necessário. |
| N+1 | OK | Nenhum padrão crítico. |
| Paginação server-side | Ausente | Implementar em pedidos, clientes, contas a receber, boletos (Fase 6). |
| Listas completas | Várias | Reduzir com paginação e filtros. |
