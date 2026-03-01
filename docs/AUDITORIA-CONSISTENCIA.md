# Auditoria de consistência — nada maquiado, base para anos sem problema

## O que já está sólido (não é maquiagem)

- **Autenticação no app**: Login usa **só tRPC** (`auth.login`). Cookie é definido no backend com `getSessionCookieOptions` (httpOnly, secure em produção, sameSite correto). O front **não** mexe em `document.cookie` — evita XSS.
- **Banco**: `getDb()` é sempre tratado (null → return []/undefined ou throw). Não há uso de DB sem checagem.
- **Erros**: Mutations críticas têm try/catch e feedback (toast). Não há `catch () {}` vazio no client.
- **Rotas e links**: Todo `setLocation` e todo item do menu apontam para rotas existentes.
- **Chart**: O único `dangerouslySetInnerHTML` é em `chart.tsx` para CSS de tema (dados do código, não do usuário) — uso seguro.

---

## O que é aceitável hoje mas deve evoluir para “anos sem problema”

### 1. Senhas em código (admin123 / vendedor123)

- **Onde**: `server/routers.ts` (auth.login) e `server/_core/index.ts` (POST /api/login).
- **Risco**: Qualquer um com acesso ao código sabe as senhas; não há troca sem deploy.
- **Recomendação**: Mover para tabela (ex.: `users` ou `vendedores`) com **hash (bcrypt)** e login que compara hash. Deixar credenciais em código só em dev, via env (ex.: `DEV_ADMIN_PASSWORD`).
- **Quando**: Antes de expor para mais pessoas ou ambientes; não é maquiagem, é evolução natural.

### 2. Dois pontos de login (tRPC + Express)

- **Situação**: O front usa **só tRPC** `auth.login`. O POST `/api/login` existe mas não é usado pelo React.
- **Problema**: Se no futuro algo usar `/api/login`, o cookie está com opções diferentes (no index hoje: httpOnly false, secure false) — menos seguro que o tRPC.
- **Recomendação**: Ou remover `/api/login` (se ninguém usar), ou fazê-lo usar as **mesmas** opções de cookie que o tRPC (`getSessionCookieOptions` + `COOKIE_NAME`). Assim não fica “maquiagem” de um login seguro e outro inseguro.

### 3. Uso de `as any`

- **Onde**: Vários pontos no server (routers, db) e no client (NovaVenda, GlobalSearch, listas).
- **Risco**: Esconde erros de tipo; refactors podem quebrar em runtime.
- **Recomendação**: Reduzir aos poucos nos fluxos críticos (ex.: input de `createVenda`, retornos de `getPedidoById`). Não é urgente para “funcionar agora”, mas melhora consistência a longo prazo.

### 4. `localStorage` para nome/role do usuário

- **Uso**: Só para exibir nome/role na UI; a **sessão real** é o cookie httpOnly.
- **Risco**: Se alguém alterar o localStorage, só a exibição muda; o backend continua validando o cookie. Baixo risco.
- **Opcional**: Confiar 100% no `auth.me` e não gravar usuário no localStorage; a UI pode mostrar “Carregando…” até `me` retornar. Já há prioridade para o backend no useAuth.

---

## Faxina recomendada agora (pouco esforço, ganho real)

### A. Unificar cookie do Express com o do tRPC

- No `server/_core/index.ts`, na rota POST `/api/login`:
  - Usar `COOKIE_NAME` e `getSessionCookieOptions(req)` para definir o cookie (mesmo nome e mesmas opções do tRPC).
  - Assim, se no futuro algo usar `/api/login`, a segurança fica igual ao login atual (httpOnly, etc.), sem “dois padrões”.

### B. Documentar a “única fonte da verdade” do login

- Deixar explícito no código (comentário ou doc) que o **login oficial do app** é o tRPC `auth.login`; o `/api/login` é legado e pode ser removido quando não houver mais consumidores.

---

## O que não precisa mudar para “não maquiar”

- **ErrorBoundary**: Já usado no `main.tsx`; erros não tratados são capturados.
- **Invalidação (pedidos, clientes, pendencias)**: Lógica correta; não é gambiarra.
- **PageHeader / PAGE_***: Padronização de layout; consistente.
- **Busca global**: Debounce e queries condicionadas; comportamento esperado.

---

## Resumo

| Item                         | Estado        | Ação sugerida                                      |
|-----------------------------|---------------|----------------------------------------------------|
| Cookie (tRPC)               | Sólido        | Nenhuma                                            |
| Cookie (Express /api/login) | Removido      | Apenas tRPC auth.login                             |
| Senhas em código            | FEITO         | Auth em DB com bcrypt; fallback em código para dev |
| getDb() null                | Sólido        | Nenhuma                                            |
| try/catch vazio             | Não existe    | Nenhuma                                            |
| Rotas/links                 | Sólido        | Nenhuma                                            |
| `as any`                    | Reduzir com tempo | Foco em inputs/APIs críticas                    |

Conclusão: **Auth em DB com bcrypt** implementada; rotas /api/login e /api/logout removidas. O resto é evolução (auth em DB, menos `as any`) para quando for priorizar “anos e anos sem problema”. Podemos seguir para os próximos passos (financeiro, precificação) e tratar auth em DB e tipagem em paralelo quando fizer sentido.
