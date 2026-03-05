# Plano de execução — Bugs NovaVenda (vendedor select / reset / confirmação)

**Data:** 2026-03-05

---

## Fase 0 — Achados da auditoria

### client/src/pages/NovaVenda.tsx

| Ponto | Localização | Achado |
|-------|-------------|--------|
| State `selectedVendedorId` | Linha 87 | `const [selectedVendedorId, setSelectedVendedorId] = useState<number \| null>(null);` |
| Select renderizado | Linhas 618-630 | `precisaEscolherVendedor` → `<Select value={selectedVendedorId ? String(selectedVendedorId) : ""} onValueChange={(v) => setSelectedVendedorId(v ? Number(v) : null)}>`. SelectItem value={String(v.id)}, label v.nome. |
| `limparFormulario()` | Linha 546-553 | Reseta pedidoId, dialogSucesso, loading, **selectedVendedorId**, buscaCliente, cliente, itens, etc. |
| Chamadas a `limparFormulario` | Linhas 971, 1039 | 971: botão "ALTERAR" (com confirm). 1039: botão "NOVO PEDIDO" no dialog de sucesso. **Nenhuma chamada ao mudar vendedor no Select.** |
| useEffect que altera estado do form | Linhas 140-194 | Apenas quando `pedidoEdit` / `editId` (edição de pedido). **Não depende de selectedVendedorId.** |
| `applySelectedCliente` | Linhas 232-249 | Função única que seta cliente no estado e limpa buscaCliente. |
| `selecionarClienteNaVenda` | Linhas 252-266 | Busca principal (getVendedorPrincipal); confirma se `principal.vendedorId !== (user as any)?.id` (**erro: user.id é userId, não vendedorId**); depois applySelectedCliente(c) e vinculate em try/catch. |
| Keys no form | 602, 728, 770, 783, 917 | key={c.id}, key={p.id}, key={item.id}, etc. **Nenhum key={selectedVendedorId}** que force remount. |

**Conclusão reset:** Não há efeito nem key que limpe o formulário ao trocar o vendedor. O “reset” pode ser (a) Select não exibir o valor selecionado (placeholder visível) e usuário achar que não escolheu; (b) ou bug de re-render em outro componente. Correção: garantir Select controlado e exibição do valor; não chamar nenhuma lógica de reset no onValueChange.

### client/src/hooks/useAuth.tsx e authStore

| Ponto | Achado |
|-------|--------|
| useAuth | Retorna user, isImpersonating, vendedorNome, isAdmin, isVendedor, effectiveRoleView. **Não retorna vendedorId.** |
| authStore (checkAuth) | Popula globalIsImpersonating e globalVendedorNome a partir de auth.me. **Não armazena vendedorId** (auth.me no backend retorna vendedorId). |
| effectiveRoleView | `isAdmin && !isImpersonating ? "admin" : "vendedor"`. Correto. |

**Ação:** Incluir `vendedorId` no retorno de auth.me (já existe no backend) e no authStore/useAuth para usar em `vendedorEfetivoId` e na regra de confirmação.

### Backend (createVenda)

| Ponto | Arquivo/Linha | Achado |
|-------|---------------|--------|
| createVenda input | server/routers.ts ~1361 | `vendedorId: z.number().int().positive().optional()` |
| Vendedor efetivo | ~1456-1472 | isAdmin + ctx.vendedor → se admin e input.vendedorId → getVendedorById; senão getVendedorFromContext. BAD_REQUEST se !vendedor. |

Fonte do select: `vendedores.list` (adminProcedure) → `db.getAllVendedores()` — apenas tabela vendedores. OK.

---

## Causa provável dos sintomas

1. **“Pedido some ao escolher vendedor”:** Select pode não estar exibindo o valor (Radix exige value igual ao de um SelectItem); ou conversão/estado incorreto. Não há limparFormulario atrelado ao Select.
2. **“Select não mostra nome selecionado”:** value="" quando não há seleção; quando há, value deve ser String(id). Garantir que options estão preenchidas e value coincide.
3. **“Pergunta cliente pertence a VALDINEIA mesmo sendo dela”:** Comparação atual usa `(user as any)?.id` (userId), não vendedorId. Deve usar `vendedorEfetivoId` (quando admin não impersonando = selectedVendedorId; quando impersonando/vendedor = ctx.vendedor.id = auth.vendedorId).
4. **“Lista só vendedores”:** vendedores.list já retorna apenas vendedores. Garantir que não há opção “admin” (getAllVendedores não retorna users).

---

## Checklist de aceitação (executado)

- **Fase 1:** Nenhum useEffect/key que resete ao mudar vendedor; onValueChange só setSelectedVendedorId. OK.
- **Fase 2:** Select controlado `value={selectedVendedorId != null ? String(selectedVendedorId) : ""}`; SelectItem com nome + cidade; tipo number no state. OK.
- **Fase 3:** vendedorEfetivoId após useState de selectedVendedorId; shouldConfirmClienteOwnership(principal, vendedorEfetivoId); selecionarClienteNaVenda usa essa função. OK.
- **Fase 4:** Fonte vendedores.list (getAllVendedores); só vendedores. OK.
- **Fase 5:** Erro no save não reseta selectedVendedorId; comentário no catch. OK.
- **Fase 6:** npm run check OK; npm run test:core OK; npm run build OK. Relatório atualizado.

## Evidências (arquivos/linhas)

| Item | Arquivo | Linhas |
|------|---------|--------|
| vendedorId no auth | authStore.ts | AuthMeResponse, globalVendedorId, checkAuth, useAuthStore return |
| vendedorId no useAuth | useAuth.tsx | retorno vendedorId |
| vendedorEfetivoId | NovaVenda.tsx | após useState selectedVendedorId |
| shouldConfirmClienteOwnership | NovaVenda.tsx | antes de selecionarClienteNaVenda |
| Select value/onValueChange | NovaVenda.tsx | bloco VENDEDOR (Select, SelectTrigger, SelectContent, SelectItem) |
| Não resetar no erro | NovaVenda.tsx | catch do salvarPedido (comentário) |
