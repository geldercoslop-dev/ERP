# Relatório: problema "Você precisa estar logado" e botão Entrar

## 1. Sintomas

- **Na tela de login:** botão "Entrar" às vezes fica desabilitado (cursor "proibido") ou o usuário consegue clicar mas, após login bem-sucedido, ao usar o sistema…
- **Em outras telas (Vendedores, Fornecedores, etc.):** ao listar ou salvar (ex.: criar vendedor), o servidor responde **401** e a mensagem **"Você precisa estar logado para realizar esta ação"** aparece na UI.
- O Sentry registra o mesmo erro em rotas como `POST /api/trpc/vendedores.create` e `GET /api/trpc/vendedores.list`.

---

## 2. O que já está confirmado (evidência no servidor)

Nos logs do **Node/Express** (terminal do servidor), em toda requisição tRPC que exige autenticação aparece algo como:

```
[createContext] Requisição sem sessão válida. {
  hasCookie: false,
  cookieNames: '(nenhum)',
  hasSessionCookie: false,
  hasSessionHeader: false,
  host: 'localhost:3003',
  ...
}
```

Ou seja:

- **Nenhum cookie** de sessão chega ao servidor (`hasCookie: false`, `cookieNames: '(nenhum)'`).
- **Nenhum header** de token que implementamos chega (`hasSessionHeader: false`).

Conclusão: **o navegador não está enviando cookie de sessão, e o cliente também não está enviando o token no header** (ou algo no meio do caminho está removendo). O backend está rejeitando corretamente por “não logado”.

---

## 3. O que já foi tentado (resumo das alterações)

### 3.1 Cookie de sessão (servidor)

- **Onde:** `server/routers.ts` (auth.login).
- **O que:** o login já define cookie de sessão (`session_token` e `session`) na resposta (Set-Cookie).
- **Depois:** simplificado para definir cookie **uma vez** por resposta, sem múltiplos `domain` (localhost vs 127.0.0.1), para evitar conflito no navegador.
- **Resultado:** mesmo assim, nas requisições seguintes o servidor **nunca** vê o header `Cookie` (sempre `hasCookie: false`). Ou o navegador não guarda o cookie ou não o envia (ex.: same-site, segurança, ou algo na stack).

### 3.2 Fallback: token no header (X-Session-Token e Authorization)

- **Onde:**  
  - **Servidor:** `server/_core/context.ts` – leitura de sessão a partir de:
    - cookie (prioridade),
    - header `X-Session-Token`,
    - header `Authorization: Bearer <token>`.
  - **Cliente:** `client/src/lib/trpcClient.ts` e `client/src/store/authStore.ts`.
- **O que:** após login, o cliente guarda o `sessionToken` retornado pela API e envia em **todas** as requisições tRPC em dois headers:
  - `X-Session-Token: <token>`
  - `Authorization: Bearer <token>`
- **Resultado:** no servidor, **sempre** `hasSessionHeader: false`. Ou o token não está sendo guardado no cliente, ou não está sendo enviado, ou algum proxy/middleware está removendo o header.

### 3.3 Onde o token é guardado no cliente

- **Onde:** `client/src/lib/trpcClient.ts` e `client/src/store/authStore.ts`.
- **O que foi feito:**
  - `setSessionToken(token)` / `getSessionToken()`: grava e lê o token em:
    - variável em memória (`inMemoryToken`),
    - `sessionStorage` (chave `grs-session-token`),
    - e, para sobreviver a HMR, em `window.__GRS_SESSION_TOKEN`.
  - No **login** (authStore), ao receber `data.sessionToken` da API, é chamado **`setSessionToken(token)`** (antes havia um bug: usava `sessionStorage.setItem(SESSION_STORAGE_KEY, token)` com `SESSION_STORAGE_KEY` indefinido, o que quebrava e impedia o token de ser setado; isso foi corrigido para usar `setSessionToken`).
  - No **logout**, chama-se `setSessionToken(null)` e limpa sessionStorage.
- **Resultado:** mesmo após a correção, o servidor continua sem ver o header. Ou o login não está retornando `sessionToken`, ou o token não está sendo anexado ao `fetch` (ex.: outro código path, outro cliente HTTP), ou os headers estão sendo descartados antes de chegar ao backend.

### 3.4 auth.me em GET (evitar 405)

- **Onde:** `client/src/store/authStore.ts` – função que chama a API (ex.: `trpcBatchCall("auth.me", null)`).
- **O que:** a chamada a `auth.me` foi feita em **GET** (em vez de POST em batch), para evitar erro **405 Method Not Allowed** no servidor.
- **Servidor:** em `server/_core/index.ts`, no middleware tRPC/Express, foi ativado **`allowMethodOverride: true`** para aceitar POST em procedures do tipo query (ex.: quando o cliente usa `trpc.auth.me.useQuery()` em batch).
- **Resultado:** 405 em `auth.me` foi resolvido, mas o problema de “não logado” (401) permanece porque a **sessão/token continua não chegando** ao servidor.

### 3.5 CORS (same-origin)

- **Onde:** `server/_core/index.ts` – middleware CORS.
- **O que:** quando **não há** header `Origin` (requisição same-origin), o middleware **não** aplica nenhum header CORS (não define `Access-Control-Allow-Origin` etc.), só chama `next()` (ou responde 200 para OPTIONS). Objetivo: não interferir em cookie/credenciais em same-origin.
  - Incluídos `localhost:3003` e `127.0.0.1:3003` em `allowedOrigins`.
  - Incluído `X-Session-Token` (e já existia `Authorization`) em `Access-Control-Allow-Headers`.
- **Resultado:** não mudou o fato de cookie/headers de sessão não aparecerem no servidor.

### 3.6 Botão “Entrar” na tela de login

- **Onde:** `client/src/pages/Login.tsx`.
- **O que:** o botão passou a depender de estado **local** `isLoggingIn` (e de `canSubmit` = usuário e senha preenchidos), e **não** do `isLoading` global do authStore. Na rota `/login`, o `checkAuth()` não roda por design, então o `isLoading` global podia ficar `true` para sempre e deixar o botão desabilitado (cursor “proibido”).
- **Resultado:** melhora na UX do botão; não altera o problema de sessão/token não chegarem ao servidor.

### 3.7 Logs de diagnóstico no servidor

- **Onde:** `server/_core/context.ts`.
- **O que:** quando não há sessão válida (e em dev), o servidor loga: `hasCookie`, `cookieNames`, `hasSessionCookie`, `hasSessionHeader`, `host`, e uma dica.
- **Resultado:** confirmou de forma repetida que **nenhum cookie e nenhum header de token** estão chegando nas requisições que exigem autenticação.

---

## 4. Stack técnica (resumo)

- **Frontend:** React, Vite, tRPC client (React Query), mesma origem que o backend (ex.: `http://localhost:3003`).
- **Backend:** Node, Express, tRPC (Express adapter), porta 3003.
- **Autenticação:** sessão por cookie (`session_token` / `session`) **ou** por token no header (`X-Session-Token` ou `Authorization: Bearer`). O contexto tRPC (`createContext`) lê cookie primeiro, depois os dois headers.
- **Fluxo de login:** POST para `auth.login` → servidor valida e retorna `{ ok: true, sessionToken: "v:123" ou "admin-session" }` e define Set-Cookie. O cliente deveria guardar `sessionToken` e enviá-lo nas próximas requisições.

---

## 5. O problema real (resumo)

- **Sintoma:** usuário “logado” na UI mas todas as chamadas tRPC protegidas retornam 401 “Você precisa estar logado”.
- **Causa observada:** o servidor **nunca** recebe:
  - cookie de sessão (`Cookie`), nem
  - token nos headers (`X-Session-Token` ou `Authorization`).
- **Hipóteses ainda em aberto:**
  1. O **navegador** não está guardando o cookie (Set-Cookie ignorado/rejeitado) ou não o envia (ex.: política de cookie, same-site, contexto).
  2. O **cliente** não está realmente chamando `setSessionToken` com o valor certo (ex.: `sessionToken` não vem na resposta de login, ou só uma parte do app usa o token).
  3. As requisições que falham **não** passam pelo `fetch` que adiciona os headers (ex.: outro cliente, outro link do tRPC, cache).
  4. Algum **proxy, middleware ou extensão** está removendo cookie ou headers antes de chegar ao backend.
  5. **HMR / recarregamento** pode estar zerando estado antes da primeira requisição após o login (por isso tentamos também `window.__GRS_SESSION_TOKEN` e sessionStorage).

---

## 6. Arquivos principais envolvidos

| Arquivo | Papel |
|--------|--------|
| `server/_core/context.ts` | Lê cookie e headers (`X-Session-Token`, `Authorization`) e monta `ctx.user`. |
| `server/routers.ts` | Login: define cookie e retorna `sessionToken`. |
| `server/_core/index.ts` | CORS e middleware tRPC (`allowMethodOverride`). |
| `client/src/lib/trpcClient.ts` | `setSessionToken` / `getSessionToken`; no `fetch` do httpBatchLink adiciona os dois headers quando há token. |
| `client/src/store/authStore.ts` | Login chama `setSessionToken(data.sessionToken)`; `trpcBatchCall` envia os mesmos headers; logout chama `setSessionToken(null)`. |
| `client/src/pages/Login.tsx` | Botão Entrar com estado local `isLoggingIn`. |

---

## 7. Pedido de ajuda

Precisamos de ideias para:

1. **Por que o servidor nunca vê cookie nem os headers de token** (mesmo com o cliente configurado para enviar e com a correção do `setSessionToken`).
2. **Como debugar de forma definitiva** no cliente (ex.: confirmar que, logo após o login, `getSessionToken()` retorna valor e que a próxima requisição tRPC inclui `X-Session-Token` e `Authorization` no Request Headers).
3. **Alternativas** (ex.: outra forma de enviar a sessão, outro fluxo de login, ou mudança de ambiente/configuração) que funcionem quando cookie e headers atuais não chegarem ao backend.

Se quiser, pode enviar este relatório inteiro para o GPT (ou outro assistente) e pedir sugestões concretas de próximo passo (código ou comandos de debug).
