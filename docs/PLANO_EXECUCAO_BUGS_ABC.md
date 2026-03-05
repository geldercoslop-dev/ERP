# Plano de execução — Bugs A/B/C e consistência end-to-end

**Data:** 2026-03-05  
**Projeto:** vendas-app (GRS)

---

## Objetivo

Corrigir 3 bugs estruturais e fechar consistência cliente → pedido → estoque → pendência.

| Bug | Sintoma | Meta |
|-----|---------|------|
| **A** | Confirm do cliente em Nova Venda: OK não preenche cliente; botão some; cabecário não atualiza | Seleção sempre aplicada após confirm; applySelectedCliente único |
| **B** | Admin salva pedido → "Usuário não está vinculado a um vendedor" | Admin salva (vendedor selecionado ou impersonação); effectiveVendedorId claro |
| **C** | Estoque não atualiza após pedido; Atualizar não refaz query | Baixa em transação; invalidate + refetch; backend retorna estoque real |

---

## Fase 1 — Reproduzir e isolar (diagnóstico)

**Checkpoints:**
- [ ] npm run check, test:core, build
- [ ] Localizar em código: handler seleção cliente (NovaVenda), confirm e setState
- [ ] Localizar validação "vinculado a vendedor" (backend createVenda/criarPedido)
- [ ] Mapear pipeline: save pedido → qual endpoint → onde estoque decrementa; Estoque → produtos.list / refetch

**Arquivos-alvo (leitura):**
- `client/src/pages/NovaVenda.tsx` (ou equivalente)
- `server/routers.ts` (createVenda, pedidos, vendedor)
- `server/db.ts` (baixa estoque, getAllProdutosComPrecoVigente)
- `client/src/pages/Estoque.tsx` (refetch, query)

**Entrega:** Diagnóstico com causa provável por item + arquivo/função.

---

## Fase 2 — BUG A: Confirm cliente não aplica seleção

**Checkpoints:**
- [ ] Achar onSelect/confirm e early return ou reset
- [ ] Introduzir applySelectedCliente(cliente) e chamar sempre após confirm OK
- [ ] Garantir cabecário/header e estado alinhados

**Arquivos-alvo:** `client/src/pages/NovaVenda.tsx` (e componentes de cabeçalho se existir).

**Entrega:** Fluxo de seleção funcionando sempre; passos de teste documentados.

---

## Fase 3 — BUG B: Admin "não vinculado a vendedor"

**Checkpoints:**
- [ ] Origem da validação (backend procedure)
- [ ] effectiveVendedorId: impersonando → vendedor impersonado; vendedor → ctx; admin → exigir seleção
- [ ] UI: admin sem impersonar → select/modal "Vendedor do pedido"
- [ ] Backend: BAD_REQUEST amigável se faltar vendedorId quando obrigatório

**Arquivos-alvo:** `server/routers.ts`, `server/db.ts`, `client/src/pages/NovaVenda.tsx`.

**Entrega:** Admin salva pedido (com vendedor escolhido ou em impersonation).

---

## Fase 4 — BUG C: Estoque não atualiza após pedido

**Checkpoints:**
- [ ] Mapear: save pedido → endpoint → baixa estoque (transação?)
- [ ] Garantir decremento + audit; front invalidate produtos.list (e afins) após concluir pedido
- [ ] Botão Atualizar chama refetch(); backend retorna estoque real; front mascara só para vendedor

**Arquivos-alvo:** `server/routers.ts`, `server/db.ts` (pedido/estoque), `client/src/pages/NovaVenda.tsx` (invalidate), `client/src/pages/Estoque.tsx`.

**Entrega:** Após criar pedido, Estoque reflete mudança; refetch funciona.

---

## Fase 5 — Hardening roles (isAdmin / isVendedor / effectiveRoleView)

**Checkpoints:**
- [ ] Helpers: isAdmin, isVendedor, isImpersonating, effectiveRoleView
- [ ] Estoque e NovaVenda usam effectiveRoleView (evitar só !isAdmin)

**Arquivos-alvo:** hook ou store de auth, `Estoque.tsx`, `NovaVenda.tsx`.

**Entrega:** Lógica de role explícita e consistente.

---

## Fase 6 — Regressões e relatório final

**Checkpoints:**
- [ ] npm run check, test:core, build
- [ ] Atualizar docs/RELATORIO_FINAL_AUDITORIA_CORRECOES.md (data 2026-03-05, bugs A/B/C, arquivos, roteiro de teste)
- [ ] Corrigir qualquer erro novo

**Entrega:** Gates verdes + relatório completo.
