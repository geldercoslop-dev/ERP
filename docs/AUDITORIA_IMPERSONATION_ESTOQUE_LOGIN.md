# Auditoria — Impersonation, Estoque, Login (com evidências no código)

**Data:** 2025-03-05  
**Objetivo:** Listar arquivos alterados e localizar no código cada ponto crítico.

---

## 1. Arquivos realmente alterados (working tree / escopo)

| Área | Arquivo |
|------|---------|
| authStore | `client/src/store/authStore.ts` |
| AppShell/header | `client/src/components/layout/AppShell.tsx` |
| Vendedores | `client/src/pages/Vendedores.tsx` |
| Estoque/Produtos (input search) | `client/src/pages/Estoque.tsx` |
| Login | `client/src/pages/Login.tsx` |
| server (routers/context/cookies) | `server/routers.ts`, `server/_core/context.ts` — apenas leitura para auditoria |

---

## 2. Localização no código (evidências)

### Botão "Trocar para vendedor" no header e validação admin

- **Arquivo:** `client/src/components/layout/AppShell.tsx`
- **Linhas:** 334–345
- **Trecho:** `{isAdmin && !isImpersonating && ( ... <button ... onClick={() => setTrocarVendedorModalOpen(true)}>Trocar para vendedor</button> )}`
- **Validação admin:** `isAdmin = user?.role === "admin"` (linha 227); botão só renderiza quando `isAdmin && !isImpersonating`.

### Onde é chamado `auth.impersonateVendedor`

- **Arquivo:** `client/src/components/layout/AppShell.tsx`
- **Linhas:** 229–237 (mutation), 437–440 (disparo)
- **Trecho:** `impersonateMutation = trpc.auth.impersonateVendedor.useMutation(...)`; no modal, `impersonateMutation.mutate({ vendedorId: trocarVendedorId })`.

### Onde é chamado `auth.stopImpersonation` / doStopImpersonation

- **Arquivo (store):** `client/src/store/authStore.ts`, função `doStopImpersonation()` (~332–344): `trpcBatchCall("auth.stopImpersonation", {})`, toast, `checkAuth()`, `window.location.href = "/"`.
- **Uso na UI:** `client/src/hooks/useAuth.tsx` expõe `voltarAoAdmin` do authStore (linha 17), que chama `doStopImpersonation()`; AppShell usa `voltarAoAdmin` no botão "Voltar ao admin" (AppShell.tsx ~288).

### Banner "Modo vendedor: NOME"

- **Arquivo:** `client/src/components/layout/AppShell.tsx`
- **Linhas:** 280–295
- **Trecho:** `{isImpersonating && ( <div className="fixed top-0 ..."> Modo vendedor: <span ...>{vendedorNome ?? "Vendedor"}</span> <button ... onClick={voltarAoAdmin}>Voltar ao admin</button> </div> )}`

### Botão "Entrar como vendedor" por linha em Vendedores.tsx

- **Arquivo:** `client/src/pages/Vendedores.tsx`
- **Resultado:** **NÃO existe.** Na lista (linhas 420–446) há apenas: "Vincular Login" (ou badge "Login vinculado"), "Editar", "Excluir". Nenhum botão "Entrar como vendedor" por linha.

### Estoque filtrado por vendedor?

- **Arquivo:** `server/routers.ts`
- **Procedure:** `produtos.list` (linhas 623–640): `protectedProcedure`, **sem** uso de `ctx.vendedor`; chama `db.getAllProdutosComPrecoVigente(new Date())` e apenas pagina (`page`, `pageSize`).
- **Conclusão:** **Não há filtro por vendedor.** Admin e vendedor recebem o mesmo estoque (não é causa de "tudo zerado" por permissão).

---

## 3. Resumo da auditoria

| Item | Status |
|------|--------|
| Botão "Trocar p/ vendedor" no header, só admin | OK (AppShell 334–345, isAdmin) |
| impersonateVendedor chamado no modal | OK (AppShell 229, 437–440) |
| doStopImpersonation no store + uso em "Voltar ao admin" | OK (authStore doStopImpersonation, useAuth → voltarAoAdmin) |
| Banner "Modo vendedor: NOME" + "Voltar ao admin" | OK (AppShell 280–295) |
| Sem botão "Entrar como vendedor" por linha em Vendedores | OK (removido) |
| produtos.list sem filtro por vendedor | OK (estoque global) |
