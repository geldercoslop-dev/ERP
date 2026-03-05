# Relatório – Login obrigatório (sempre passar pela tela de login)

## O que era

- Ao abrir o sistema (nova aba ou URL direta), se existisse **cookie de sessão válido**, o app chamava `auth.me`, recebia o usuário e **entrava direto** na Home sem mostrar a tela de login.
- Não havia opção de “lembrar usuário” nem botão explícito para trocar de usuário (apenas “Sair”).

---

## O que foi mudado

### 1. Guard “login confirmado nesta sessão” (sessionStorage)

- **Chave:** `grs-login-confirmed` em **sessionStorage** (válida só na aba atual).
- **Regra:** O acesso às rotas protegidas só é liberado se **houver esse flag** e o `auth.me` retornar usuário.
- **Quando seta:** Apenas quando o usuário **envia o formulário de login com sucesso** (no `authStore.login()`).
- **Quando limpa:** No logout (tanto no `authStore.logout()` quanto no `useAuth` logout).
- **Efeito:** Mesmo com cookie válido, ao **abrir nova aba** ou **fechar e reabrir** o navegador, o sessionStorage não tem o flag → o guard redireciona para `/login`. Não há mais auto-login silencioso por cookie.

### 2. `checkAuth()` no authStore

- **Antes:** Se `auth.me` retornasse usuário, setava `isAuthenticated = true`.
- **Agora:** Só seta `isAuthenticated = true` se **`auth.me` retornar usuário e `hasLoginConfirmadoNestaSessao()` for true**.
- Se não houver flag (ex.: nova aba), mesmo com cookie válido o usuário fica “não autenticado” para o guard e é mandado para o login.

### 3. Login.tsx

- **Checkbox “Lembrar usuário”:** Se marcado, salva **apenas o username** em `localStorage` (chave `remembered_username`). **Senha nunca é salva.**
- **Ao abrir a tela:** Lê `remembered_username` e preenche o campo usuário; se existir valor, marca o checkbox.
- **Após login com sucesso:** Se o checkbox estiver marcado, grava o username no `localStorage`; senão, remove.
- **Autocomplete:** `autoComplete="username"` e `autoComplete="current-password"` para o navegador poder sugerir/salvar (senha fica no gerenciador do navegador, não no nosso código).
- **Mobile:** `autoCapitalize="none"` e `inputMode="text"` nos inputs.

### 4. useAuth (logout)

- Passa a limpar **sessionStorage** `grs-login-confirmed` no logout, além de cookies e localStorage já existentes.
- Assim, ao clicar em “Sair” ou “Trocar usuário”, na próxima abertura (ou nova aba) o usuário volta para a tela de login.

### 5. AppShell (menu lateral)

- **Botão “Trocar”** ao lado do ícone de Sair: faz o mesmo logout (limpa cookie e estado) e redireciona para `/login`. O “Lembrar usuário” continua valendo se estiver marcado (só o username fica no localStorage).

---

## Como testar

1. **Login → entra**  
   Abra `/login`, digite usuário e senha, marque ou não “Lembrar usuário”, clique em Entrar. Deve ir para a Home.

2. **F5 na Home**  
   Dê F5 na mesma aba. Deve **permanecer logado** (o flag `grs-login-confirmed` está no sessionStorage da mesma aba).

3. **Fechar aba e abrir de novo**  
   Feche a aba, abra de novo `http://localhost:3003` (ou `/vendas`, etc.). Deve **ir para a tela de login** (nova aba = sessionStorage vazio).

4. **Cookie existente, mas sem flag**  
   Com uma aba já logada, abra **outra aba** em `http://localhost:3003`. Deve **mostrar login** (cookie existe, mas na nova aba não há `grs-login-confirmed`).

5. **Lembrar usuário**  
   Marque “Lembrar usuário”, faça login, feche a aba e abra de novo. Na tela de login, o campo **usuário** deve vir preenchido; o de senha, vazio. Senha só pelo autocomplete do navegador, se tiver salvo.

6. **Trocar usuário / Sair**  
   Na Home, clique em “Trocar” ou no ícone de Sair. Deve ir para `/login`. Abrindo de novo em outra aba, deve continuar pedindo login.

---

## Como reverter se não gostar

1. **authStore.ts**  
   - Remover as funções e a chave `LOGIN_CONFIRMED_KEY`, `setLoginConfirmadoNestaSessao`, `hasLoginConfirmadoNestaSessao` e `clearLoginConfirmadoNestaSessao`.  
   - Em `checkAuth()`, voltar a setar `globalIsAuthenticated = true` quando `userData` existir (sem checar `confirmed`).  
   - Em `login()` (sucesso), remover a chamada a `setLoginConfirmadoNestaSessao(true)`.  
   - Em `logout()`, remover a chamada a `setLoginConfirmadoNestaSessao(false)`.

2. **Login.tsx**  
   - Remover estado e checkbox “Lembrar usuário”, remover leitura/gravação de `remembered_username` e os `autoCapitalize`/`inputMode` se quiser o layout anterior.

3. **useAuth.ts**  
   - Remover a linha `sessionStorage.removeItem("grs-login-confirmed")` do logout.

4. **AppShell.tsx**  
   - Remover o botão “Trocar” se quiser deixar só o ícone de Sair.

5. **Commit anterior**  
   - Se estiver em Git: `git checkout <commit-anterior> -- client/src/store/authStore.ts client/src/pages/Login.tsx client/src/_core/hooks/useAuth.ts client/src/components/layout/AppShell.tsx`

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `client/src/store/authStore.ts` | Flag `grs-login-confirmed` em sessionStorage; `checkAuth` só considera autenticado com flag + auth.me; `login` seta flag; `logout` limpa flag; export `clearLoginConfirmadoNestaSessao`. |
| `client/src/pages/Login.tsx` | Checkbox “Lembrar usuário”; localStorage `remembered_username`; `autoCapitalize="none"`, `inputMode="text"`; preenchimento inicial do usuário. |
| `client/src/_core/hooks/useAuth.ts` | Logout limpa `grs-login-confirmed` no sessionStorage. |
| `client/src/components/layout/AppShell.tsx` | Botão “Trocar” (logout + ir para login). |
| `docs/LOGIN_OBRIGATORIO_RELATORIO.md` | Este relatório. |

Backend (auth.me, cookie, logout) **não foi alterado**; apenas o comportamento do front e do guard.
