# Relatório final — Auditoria e correções (com evidências)

**Data:** 2026-03-05  
**Projeto:** vendas-app (GRS)  
**Objetivos:** Impersonation, TS/authStore, estoque vendedor, input Buscar clicável, Login; **comissoes.list (updatedAt)**; **Bugs A/B/C** (cliente não aplica, admin vendedor, estoque não atualiza); **Hardening roles**.

---

## Bugs A / B / C (correções desta execução)

### BUG A — Confirm do cliente não aplica seleção (Nova Venda)

**Sintoma:** Ao selecionar cliente e confirmar "Cliente pertence a X. Continuar mesmo assim?" com OK, o cliente **não** era preenchido; o botão sumia; cabecário não atualizava.

**Causa raiz:** Em `selecionarClienteNaVenda` o fluxo era: confirm → `vinculateCliente.mutateAsync()` → `selecionarCliente(c)`. Se a mutation falhasse (rede, backend), `selecionarCliente` nunca era chamado.

**Correção:**  
- Criada função única **`applySelectedCliente(c)`** que seta cliente no estado e limpa busca.  
- Ordem alterada: após confirm OK → **primeiro** `applySelectedCliente(c)`; **depois** `vinculateCliente.mutateAsync` em try/catch (falha não impede a seleção).  
- **Arquivo:** `client/src/pages/NovaVenda.tsx` (applySelectedCliente, selecionarClienteNaVenda).

---

### BUG B — "Usuário não está vinculado a um vendedor" ao salvar como admin

**Sintoma:** Admin ao salvar pedido recebia toast/erro "Usuário não está vinculado a um vendedor."

**Causa raiz:** `createVenda` no backend exigia `getVendedorFromContext(ctx)`; para admin (não impersonando) não há vendedor no contexto.

**Correção:**  
- **Backend** (`server/routers.ts`): input de `createVenda` com **`vendedorId` opcional**. Lógica: se `ctx.vendedor` (impersonação) usa esse; se admin e `input.vendedorId` informado, usa `db.getVendedorById(input.vendedorId)`; senão para não-admin usa `getVendedorFromContext`. Se nenhum vendedor → BAD_REQUEST: admin recebe "Selecione o vendedor responsável pelo pedido.", vendedor recebe "Usuário não está vinculado a um vendedor."  
- **Frontend** (`client/src/pages/NovaVenda.tsx`): quando **admin e não impersonando** (`precisaEscolherVendedor`), exibe **select de vendedor** (lista de vendedores) e envia `vendedorId` no payload. Validação antes de enviar: se falta vendedor, toast "Selecione o vendedor responsável pelo pedido."  
- **Arquivos:** `server/routers.ts` (createVenda input + effective vendedor), `client/src/pages/NovaVenda.tsx` (estado selectedVendedorId, select, payload vendedorId).

---

### BUG C — Estoque não atualiza após pedido

**Sintoma:** Após criar pedido, a tela Estoque continuava igual; botão "Atualizar" não refletia mudança.

**Causa raiz:** O backend já decrementa estoque em transação ao criar pedido (createVenda, status GERADO). O front não invalidava a query de produtos após sucesso, então a lista de estoque continuava com cache antigo.

**Correção:**  
- Após **createVenda** com sucesso, chamar **`utils.produtos.list.invalidate()`** junto com clientes, pedidos e pendencias.  
- Botão "Atualizar" em Estoque já chama `refetch()` da query `produtos.list`; com a invalidação após venda, ao abrir Estoque ou clicar Atualizar os dados vêm atualizados.  
- **Arquivo:** `client/src/pages/NovaVenda.tsx` (invalidate produtos.list após sucesso).

---

### Fase 5 — Hardening de roles

- **`client/src/hooks/useAuth.tsx`:** expõe **`isAdmin`**, **`isVendedor`**, **`effectiveRoleView`** (`'admin' | 'vendedor'`). Regra: `effectiveRoleView === 'admin'` quando admin e **não** impersonando; caso contrário `'vendedor'`. Evita lógica negativa (`!isAdmin`) para definir "vista vendedor".  
- **`client/src/pages/Estoque.tsx`:** usa **`effectiveRoleView`** e deriva **`isAdminView = effectiveRoleView === 'admin'`** para exibição (totais, coluna custo, ações, máscara de estoque negativo).

---

## NovaVenda — vendedor select reset / select não controlado / confirmação cliente (2026-03-05)

**Sintomas:** Ao escolher vendedor no select o pedido “sumia” (reset); select não mostrava o nome selecionado (ficava placeholder); ao escolher cliente do mesmo vendedor ainda perguntava “cliente pertence a X?”; lista não podia permitir “admin” como vendedor.

**Causa raiz:**
- **Reset:** Auditoria mostrou que não há `useEffect` nem `key` que disparem reset ao mudar `selectedVendedorId`; `limparFormulario` só é chamado em “ALTERAR” e “NOVO PEDIDO”. O efeito percebido era o select não exibir o valor (placeholder) e/ou validação “Selecione o vendedor” ao salvar.
- **Select não controlado/exibição:** Valor e options já estavam coerentes (string); ajuste com `value={selectedVendedorId != null ? String(selectedVendedorId) : ""}` e `onValueChange` apenas `setSelectedVendedorId`; exibição com nome + cidade no `SelectItem`.
- **Confirmação errada:** A comparação usava `(user as any)?.id` (userId), não o vendedor do pedido. Deve usar **vendedorEfetivoId**: admin não impersonando = `selectedVendedorId`; impersonando ou vendedor = vendedor da sessão (`auth.vendedorId`).
- **Lista só vendedores:** Fonte já era `vendedores.list` (tabela vendedores); não lista usuários/admin.

**Correções:**
1. **authStore + useAuth:** Inclusão de **`vendedorId`** no retorno de `auth.me` (backend já enviava); `AuthMeResponse` e globais `globalVendedorId`; `checkAuth` preenche `globalVendedorId`; `useAuthStore` e `useAuth` expõem `vendedorId`.
2. **NovaVenda:** Cálculo **`vendedorEfetivoId`** = `precisaEscolherVendedor ? selectedVendedorId : authVendedorId`. Função **`shouldConfirmClienteOwnership(principal, vendedorEfetivoId)`**: só retorna true quando `principal.vendedorId !== vendedorEfetivoId` (e ambos não nulos). Em **`selecionarClienteNaVenda`** usa essa função; só exibe confirm quando cliente é de outro vendedor.
3. **Select:** Controlado com `value={selectedVendedorId != null ? String(selectedVendedorId) : ""}`; `onValueChange` só chama `setSelectedVendedorId` (nenhum reset). Opções com `nome` e `cidade` (id + nome + cidade). Trigger com `min-w-[140px]` para não cortar texto.
4. **Salvar:** Em erro de save não se reseta `selectedVendedorId` nem o formulário; comentário explícito no catch.

**Arquivos alterados:**  
`client/src/store/authStore.ts` (vendedorId em AuthMeResponse, globalVendedorId, checkAuth, useAuthStore).  
`client/src/hooks/useAuth.tsx` (vendedorId no retorno).  
`client/src/pages/NovaVenda.tsx` (vendedorEfetivoId, shouldConfirmClienteOwnership, selecionarClienteNaVenda, Select value/onValueChange/SelectItem cidade, comentário no catch).  
`docs/PLANO_EXECUCAO_BUGS_NOVAVENDA_VENDEDOR.md` (novo — auditoria).

**Roteiro de teste manual (NovaVenda vendedor):**
- **A) Admin não impersonando:** Preencher cliente, itens, pagamento; escolher vendedor no select → nada reseta; select mostra nome (e cidade); escolher cliente do **mesmo** vendedor → não aparece confirm; escolher cliente de **outro** vendedor → aparece confirm; ao OK cliente é aplicado sem perder dados; salvar → não pede vendedor de novo.
- **B) Admin impersonando:** Select de vendedor não aparece (ou desativado); ao salvar usa vendedor impersonado; confirm só se cliente de outro vendedor.
- **C) Vendedor logado:** Select não aparece; vendedorEfetivoId = sessão; confirm só se cliente de outro vendedor.
- **D)** Trocar vendedor no select não limpa formulário.
- **E)** Lista do select só mostra vendedores (tabela vendedores), nunca admin.

---

## 1. Lista de arquivos alterados

| Arquivo | Alterações |
|---------|-------------|
| `client/src/store/authStore.ts` | Interface `AuthMeResponse`; `checkAuth()` tipado; `doStopImpersonation()`; globais `isImpersonating` / `vendedorNome`. |
| `client/src/components/layout/AppShell.tsx` | Modal "Trocar para vendedor" com cidade na lista (id + nome + cidade). |
| `client/src/pages/Estoque.tsx` | Busca em seção sticky (top-14, z-[100]); admin vê saldo real (incl. negativo), vendedor vê max(0, saldo); **effectiveRoleView / isAdminView** (hardening). |
| `client/src/components/layout/PageHeader.tsx` | Header com `pointer-events-none [&>*]:pointer-events-auto` para não bloquear clique em elementos atrás. |
| `client/src/pages/Login.tsx` | Comentário: acima do ENTRAR só checkbox + label. |
| **`client/src/pages/NovaVenda.tsx`** | **BUG A:** applySelectedCliente; seleção sempre aplicada antes de vinculate. **BUG B:** select vendedor para admin; vendedorId no createVenda. **BUG C:** utils.produtos.list.invalidate(). **NovaVenda vendedor:** vendedorEfetivoId, shouldConfirmClienteOwnership, Select controlado (value/onValueChange), nome+cidade no SelectItem, não resetar no erro de save. |
| **`client/src/hooks/useAuth.tsx`** | **isAdmin, isVendedor, effectiveRoleView**, **vendedorId**. |
| **`client/src/store/authStore.ts`** | AuthMeResponse **vendedorId**; **globalVendedorId**; checkAuth popula; useAuthStore retorna vendedorId. |
| `docs/PLANO_EXECUCAO_BUGS_NOVAVENDA_VENDEDOR.md` | Auditoria Fase 0 (achados, causa provável). |
| `server/routers.ts` | Comentário em `produtos.list`; **createVenda:** input vendedorId opcional; effective vendedor (ctx.vendedor / admin input / getVendedorFromContext); mensagem BAD_REQUEST por perfil. |
| `drizzle/schema.ts` | Tabela `comissoes`: removida coluna `updatedAt`. |
| `docs/PLANO_EXECUCAO_BUGS_ABC.md` | Plano de execução em fases. |
| `docs/RELATORIO_FINAL_AUDITORIA_CORRECOES.md` | Este relatório. |

---

## 2. Correção comissoes.list (updatedAt)

**Erro:** `GET /api/trpc/comissoes.list` → TRPCError / MySQL: *Unknown column 'updatedAt' in field list*.

**Causa raiz:** O schema Drizzle em `drizzle/schema.ts` definia a tabela `comissoes` com a coluna `updatedAt`. O banco em produção (ou em uso) **não** possui essa coluna — possivelmente criado por migração antiga ou script sem `updatedAt`.

**Correção:** Remoção da coluna `updatedAt` da definição da tabela `comissoes` em **`drizzle/schema.ts`** (linhas ~290–299). Assim, `db.select().from(comissoes)` em `server/db.ts` (funções `getComissoesByVendedor`, `getAllComissoes`) deixa de incluir `updatedAt` e o erro some. Ordenação segue por `createdAt` desc (já usada).

**Arquivos:** `drizzle/schema.ts` (definição de `comissoes`); `server/db.ts` não foi alterado (usa o schema).

---

## 3. Correção “Buscar produto…” em Estoque (clique/foco)

**Problema:** Campo “Buscar produto…” na página Estoque não recebia clique/foco (camada por cima).

**Causa raiz:** Conteúdo da página (incluindo o input) fica dentro de um layout com header sticky (`PageHeader` com `sticky top-0 z-10`). Ao rolar ou por ordem de empilhamento, o header ou outro elemento podia ficar por cima da área do input, interceptando `pointer-events`.

**Correção:**
1. **`client/src/components/layout/PageHeader.tsx`:** Header com `pointer-events-none` e filho direto com `pointer-events-auto`, para que a área “vazia” do header não bloqueie cliques em elementos atrás; botões e textos continuam clicáveis.
2. **`client/src/pages/Estoque.tsx`:** Barra de busca colocada em uma **seção sticky** no topo do `<main>` com `sticky top-14 z-[100]`, fundo sólido (`bg-background/98`), garantindo que fique sempre visível e acima de outras camadas, logo abaixo do header, e que o input receba foco e clique.

---

## 4. Regra final: Estoque admin vs vendedor (negativo)

**Regra de negócio:**
- **Admin:** vê saldo **real** (negativo, zero, positivo). Totais: “Total em Custo/Venda (estoque positivo)” e, quando houver negativo, linha “Total real (incl. negativo)”.
- **Vendedor:** vê **saldo exibido** = `max(0, saldoReal)`. Negativo aparece como 0. Pode vender e gerar pendência normalmente; backend e regra de pendência inalterados.

**Implementação:** Em **`client/src/pages/Estoque.tsx`**:
- `isVendedorView = !isAdmin`.
- Na tabela: quantidade exibida = `isVendedorView ? Math.max(0, qReal) : qReal`.
- Resumo/totais: para vendedor, totais com saldo exibido (≥ 0); para admin, totais por positivo e, quando diferente, total real (incl. negativo).
- Backend (`produtos.list`) continua retornando saldo real; nenhuma alteração na regra de estoque negativo ou pendência.

---

## 5. O que foi corrigido por etapa (resumo anterior + novas frentes)

- **Auditoria / Trocar–Voltar / authStore / Login:** Conforme seções anteriores do relatório.
- **comissoes.list:** Remoção de `updatedAt` do schema `comissoes` (acima).
- **Input Buscar (Estoque):** PageHeader com pointer-events + seção sticky da busca com z-[100] e top-14 (acima).
- **Estoque admin vs vendedor:** Saldo exibido mascarado para vendedor (negativo = 0); admin vê real e totais real/positivo (acima).

---

## 6. Como testar manualmente (passo a passo)

1. **Login admin** → Trocar para vendedor → Voltar ao admin (sem novo login).
2. **BUG A — Seleção de cliente:** Nova Venda → buscar cliente que pertence a outro vendedor → confirmar "Continuar mesmo assim?" com OK → cliente deve ser preenchido (nome, endereço, cabecário); botão não some.
3. **BUG B — Salvar pedido admin:** Como admin (sem impersonar) → Nova Venda → **selecionar vendedor** no campo "VENDEDOR" → preencher cliente e itens → Salvar → deve salvar sem erro "vinculado a vendedor". Sem selecionar vendedor → ao Salvar deve aparecer "Selecione o vendedor responsável pelo pedido."
4. **BUG B — Admin impersonando:** Trocar para vendedor → Nova Venda → salvar pedido → deve salvar normalmente (vendedor do contexto).
5. **BUG C — Estoque após pedido:** Criar um pedido com item de catálogo (estoque > 0) → concluir → abrir Estoque → clicar **Atualizar** → quantidade do produto deve ter diminuído.
6. **Estoque:** Clicar no campo “Buscar produto…”, digitar, Tab → foco e digitação normais.
7. **Comissões:** Acessar tela/rota que chama `comissoes.list` (ex.: Financeiro, Minhas Comissões, Relatórios) → não deve dar erro “updatedAt”.
8. **Estoque admin:** Saldos negativos visíveis; totais “real (incl. negativo)” quando houver negativo.
9. **Estoque vendedor:** Saldos negativos aparecem como 0; venda pode gerar pendência.

---

## 7. Comandos executados e resultados

| Comando | Resultado |
|---------|-----------|
| `npm run check` | **OK** (exit 0). |
| `npm run test:core` | **OK** (exit 0). MySQL ligado. |
| `npm run build` | **OK** (exit 0). |

**Os três gates passaram.**

---

## 8. Evidências no código (referência rápida)

| Ponto | Arquivo | Observação |
|-------|---------|------------|
| comissoes sem updatedAt | `drizzle/schema.ts` | Tabela `comissoes` sem coluna `updatedAt`. |
| getComissoesByVendedor | `server/db.ts` | ~1519–1526; usa `comissoes` do schema (sem updatedAt). |
| Input Buscar clicável | `Estoque.tsx` | Seção sticky top-14 z-[100] com o input. |
| PageHeader não bloqueia | `PageHeader.tsx` | `pointer-events-none [&>*]:pointer-events-auto`. |
| Estoque admin real / vendedor 0 | `Estoque.tsx` | `isVendedorView`, `qExibida = max(0, qReal)`, resumo com totalReal*. |
| Trocar/Voltar, authStore, etc. | Vários | Conforme tabela e seções anteriores. |
| BUG A applySelectedCliente | `NovaVenda.tsx` | applySelectedCliente(c) antes de vinculate; try/catch em vinculate. |
| BUG B vendedorId createVenda | `routers.ts` | input vendedorId opcional; effective vendedor (ctx.vendedor \| admin input). |
| BUG B select vendedor admin | `NovaVenda.tsx` | selectedVendedorId, Select quando precisaEscolherVendedor, payload vendedorId. |
| BUG C invalidate produtos | `NovaVenda.tsx` | utils.produtos.list.invalidate() após createVenda sucesso. |
| effectiveRoleView / isAdminView | `useAuth.tsx`, `Estoque.tsx` | isAdmin, isVendedor, effectiveRoleView; Estoque usa isAdminView. |

---

*Relatório atualizado em 2026-03-05. Auditoria detalhada em `docs/AUDITORIA_IMPERSONATION_ESTOQUE_LOGIN.md`.*
