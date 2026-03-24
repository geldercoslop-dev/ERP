# RelatÃ³rio â€“ Login obrigatÃ³rio (sempre passar pela tela de login)

## O que era

- Ao abrir o sistema (nova aba ou URL direta), se existisse **cookie de sessÃ£o vÃ¡lido**, o app chamava `auth.me`, recebia o usuÃ¡rio e **entrava direto** na Home sem mostrar a tela de login.
- NÃ£o havia opÃ§Ã£o de â€œlembrar usuÃ¡rioâ€ nem botÃ£o explÃ­cito para trocar de usuÃ¡rio (apenas â€œSairâ€).

---

## O que foi mudado

### 1. Guard â€œlogin confirmado nesta sessÃ£oâ€ (sessionStorage)

- **Chave:** `grs-login-confirmed` em **sessionStorage** (vÃ¡lida sÃ³ na aba atual).
- **Regra:** O acesso Ã s rotas protegidas sÃ³ Ã© liberado se **houver esse flag** e o `auth.me` retornar usuÃ¡rio.
- **Quando seta:** Apenas quando o usuÃ¡rio **envia o formulÃ¡rio de login com sucesso** (no `authStore.login()`).
- **Quando limpa:** No logout (tanto no `authStore.logout()` quanto no `useAuth` logout).
- **Efeito:** Mesmo com cookie vÃ¡lido, ao **abrir nova aba** ou **fechar e reabrir** o navegador, o sessionStorage nÃ£o tem o flag â†’ o guard redireciona para `/login`. NÃ£o hÃ¡ mais auto-login silencioso por cookie.

### 2. `checkAuth()` no authStore

- **Antes:** Se `auth.me` retornasse usuÃ¡rio, setava `isAuthenticated = true`.
- **Agora:** SÃ³ seta `isAuthenticated = true` se **`auth.me` retornar usuÃ¡rio e `hasLoginConfirmadoNestaSessao()` for true**.
- Se nÃ£o houver flag (ex.: nova aba), mesmo com cookie vÃ¡lido o usuÃ¡rio fica â€œnÃ£o autenticadoâ€ para o guard e Ã© mandado para o login.

### 3. Login.tsx

- **Checkbox â€œLembrar usuÃ¡rioâ€:** Se marcado, salva **apenas o username** em `localStorage` (chave `remembered_username`). **Senha nunca Ã© salva.**
- **Ao abrir a tela:** LÃª `remembered_username` e preenche o campo usuÃ¡rio; se existir valor, marca o checkbox.
- **ApÃ³s login com sucesso:** Se o checkbox estiver marcado, grava o username no `localStorage`; senÃ£o, remove.
- **Autocomplete:** `autoComplete="username"` e `autoComplete="current-password"` para o navegador poder sugerir/salvar (senha fica no gerenciador do navegador, nÃ£o no nosso cÃ³digo).
- **Mobile:** `autoCapitalize="none"` e `inputMode="text"` nos inputs.

### 4. useAuth (logout)

- Passa a limpar **sessionStorage** `grs-login-confirmed` no logout, alÃ©m de cookies e localStorage jÃ¡ existentes.
- Assim, ao clicar em â€œSairâ€ ou â€œTrocar usuÃ¡rioâ€, na prÃ³xima abertura (ou nova aba) o usuÃ¡rio volta para a tela de login.

### 5. AppShell (menu lateral)

- **BotÃ£o â€œTrocarâ€** ao lado do Ã­cone de Sair: faz o mesmo logout (limpa cookie e estado) e redireciona para `/login`. O â€œLembrar usuÃ¡rioâ€ continua valendo se estiver marcado (sÃ³ o username fica no localStorage).

---

## Como testar

1. **Login â†’ entra**  
   Abra `/login`, digite usuÃ¡rio e senha, marque ou nÃ£o â€œLembrar usuÃ¡rioâ€, clique em Entrar. Deve ir para a Home.

2. **F5 na Home**  
   DÃª F5 na mesma aba. Deve **permanecer logado** (o flag `grs-login-confirmed` estÃ¡ no sessionStorage da mesma aba).

3. **Fechar aba e abrir de novo**  
   Feche a aba, abra de novo `http://localhost:3000` (ou `/vendas`, etc.). Deve **ir para a tela de login** (nova aba = sessionStorage vazio).

4. **Cookie existente, mas sem flag**  
   Com uma aba jÃ¡ logada, abra **outra aba** em `http://localhost:3000`. Deve **mostrar login** (cookie existe, mas na nova aba nÃ£o hÃ¡ `grs-login-confirmed`).

5. **Lembrar usuÃ¡rio**  
   Marque â€œLembrar usuÃ¡rioâ€, faÃ§a login, feche a aba e abra de novo. Na tela de login, o campo **usuÃ¡rio** deve vir preenchido; o de senha, vazio. Senha sÃ³ pelo autocomplete do navegador, se tiver salvo.

6. **Trocar usuÃ¡rio / Sair**  
   Na Home, clique em â€œTrocarâ€ ou no Ã­cone de Sair. Deve ir para `/login`. Abrindo de novo em outra aba, deve continuar pedindo login.

---

## Como reverter se nÃ£o gostar

1. **authStore.ts**  
   - Remover as funÃ§Ãµes e a chave `LOGIN_CONFIRMED_KEY`, `setLoginConfirmadoNestaSessao`, `hasLoginConfirmadoNestaSessao` e `clearLoginConfirmadoNestaSessao`.  
   - Em `checkAuth()`, voltar a setar `globalIsAuthenticated = true` quando `userData` existir (sem checar `confirmed`).  
   - Em `login()` (sucesso), remover a chamada a `setLoginConfirmadoNestaSessao(true)`.  
   - Em `logout()`, remover a chamada a `setLoginConfirmadoNestaSessao(false)`.

2. **Login.tsx**  
   - Remover estado e checkbox â€œLembrar usuÃ¡rioâ€, remover leitura/gravaÃ§Ã£o de `remembered_username` e os `autoCapitalize`/`inputMode` se quiser o layout anterior.

3. **useAuth.ts**  
   - Remover a linha `sessionStorage.removeItem("grs-login-confirmed")` do logout.

4. **AppShell.tsx**  
   - Remover o botÃ£o â€œTrocarâ€ se quiser deixar sÃ³ o Ã­cone de Sair.

5. **Commit anterior**  
   - Se estiver em Git: `git checkout <commit-anterior> -- client/src/store/authStore.ts client/src/pages/Login.tsx client/src/_core/hooks/useAuth.ts client/src/components/layout/AppShell.tsx`

---

## Arquivos alterados

| Arquivo | AlteraÃ§Ã£o |
|---------|-----------|
| `client/src/store/authStore.ts` | Flag `grs-login-confirmed` em sessionStorage; `checkAuth` sÃ³ considera autenticado com flag + auth.me; `login` seta flag; `logout` limpa flag; export `clearLoginConfirmadoNestaSessao`. |
| `client/src/pages/Login.tsx` | Checkbox â€œLembrar usuÃ¡rioâ€; localStorage `remembered_username`; `autoCapitalize="none"`, `inputMode="text"`; preenchimento inicial do usuÃ¡rio. |
| `client/src/_core/hooks/useAuth.ts` | Logout limpa `grs-login-confirmed` no sessionStorage. |
| `client/src/components/layout/AppShell.tsx` | BotÃ£o â€œTrocarâ€ (logout + ir para login). |
| `docs/LOGIN_OBRIGATORIO_RELATORIO.md` | Este relatÃ³rio. |

Backend (auth.me, cookie, logout) **nÃ£o foi alterado**; apenas o comportamento do front e do guard.
