# RecuperaÃ§Ã£o do sistema â€“ roteiro de emergÃªncia

Passos curtos para quando algo quebra: "precisa estar logado", TRPCError de SQL, listas nÃ£o atualizam, botÃµes nÃ£o salvam.

**Riscos do sistema (o que evitar):** Ver [RISCO_ATUAL.md](./RISCO_ATUAL.md). **RelatÃ³rio consolidado (hardening + workflow):** Ver [RELATORIO_HARDENING_FINAL.md](./RELATORIO_HARDENING_FINAL.md).

---

## 1. MySQL / XAMPP

- **Sintoma:** Erro de conexÃ£o, `ECONNREFUSED`, "Database not available".
- **AÃ§Ãµes:**
  1. Abra o XAMPP Control Panel e verifique se o MySQL estÃ¡ **Running** (porta 3306).
  2. Se nÃ£o estiver, clique em **Start** no MySQL.
  3. Rode (um comando por vez):
     - `npm run check:db` e confira se "ConexÃ£o estabelecida" aparece.
     - Opcional: `npm run test:db` para outro teste de conexÃ£o.

---

## 2. SessÃ£o / cookies ("precisa estar logado")

- **Sintoma:** ApÃ³s login, redireciona de volta ao login ou "Acesso negado".
- **Ordem de checagem:**
  1. **Como verificar cookie/session_token no DevTools:** Abra DevTools (F12) â†’ aba **Application** (Chrome) ou **Storage** (Firefox) â†’ no menu Ã  esquerda, **Cookies** â†’ clique na URL do app (ex.: `http://localhost:3000`). Veja se existe `session_token`, `session` ou `auth_token`; o valor deve estar preenchido apÃ³s login. Se nÃ£o existir ou estiver vazio, o cookie nÃ£o estÃ¡ sendo setado ou o domÃ­nio/path estÃ¡ errado.
  2. **SÃ³ em DEV:** Abra `GET /api/debug/headers` e veja o que o servidor recebe: `cookie`, `xSessionToken`, `authorization`. Se estiver vazio, o front nÃ£o estÃ¡ enviando sessÃ£o.
  3. **Logs do servidor:** Procure por `[createContext]` e confira se o token estÃ¡ sendo recebido.
  4. **CORS/origem:** FaÃ§a login na **mesma URL** da barra de endereÃ§o (ex.: sempre `http://localhost:3000`). Evite misturar `localhost` e `127.0.0.1`.
  5. **tRPC client:** O fetch jÃ¡ usa `credentials: "include"` em `trpcClient.ts`; nÃ£o remova.

---

## 3. db:push em desenvolvimento

- **Quando usar:** Schema do cÃ³digo Ã  frente do banco (novas tabelas/colunas em DEV).
- **Comando:** `npm run db:push:dev` (com MySQL rodando).
- **Se pedir confirmaÃ§Ã£o:** Leia o que o Drizzle vai alterar; em DEV pode aceitar.
- **Nunca em produÃ§Ã£o:** Em PROD use sempre migrations (ver BASE_DE_DADOS.md e DEPLOY_PRODUCAO.md).

---

## 4. Migrations em produÃ§Ã£o

- **Quando:** AlteraÃ§Ãµes de schema em produÃ§Ã£o.
- **Ordem (um passo por vez):**
  1. Fazer backup do banco.
  2. Alterar `drizzle/schema.ts`.
  3. Rodar `npm run db:generate`.
  4. Revisar SQL em `drizzle/migrations`.
  5. Rodar `npm run db:migrate`.
  6. Conferir `GET /api/health` (schemaMatch true).
- **Detalhes:** Ver DEPLOY_PRODUCAO.md e BASE_DE_DADOS.md.

---

## 5. Onde olhar no Sentry

- **Erros de query:** Use o `traceId` e os extras `code`, `sqlMessage` para achar o log no servidor.
- **Erros de sessÃ£o:** Filtre por path (ex.: `auth.me`, `vendedores.list`) e confira se o erro Ã© UNAUTHORIZED/FORBIDDEN (sessÃ£o/cookie).

---

## 6. Quais logs pegar (TRPCError / SQL)

- No **terminal do servidor**, ao ocorrer erro:
  - `[TRPC onError] traceId: XXXXX` â†’ use esse ID para correlacionar com Sentry/log.
  - `MySQL err.code:` e `MySQL err.sqlMessage:` â†’ anote os dois; sÃ£o o motivo real do MySQL.
- Para "Failed query" ou erro de SELECT/INSERT: sempre coletar **err.code** e **err.sqlMessage** e, se possÃ­vel, a query (jÃ¡ logada em vÃ¡rios pontos do `db`).

---

## 7. Lista nÃ£o atualiza / botÃ£o nÃ£o salva

- **Lista:** Verifique se apÃ³s create/update/delete estÃ¡ sendo chamado `utils.xxx.list.invalidate()` (ou o helper `invalidateAfterMutation`). Ver CONVENCOES_DE_CODIGO.md.
- **BotÃ£o desabilitado:** BotÃµes de submit devem usar estado **local** (ex.: `isSubmitting`) e **nunca** sÃ³ o `isLoading` global do auth. Ver CONVENCOES_DE_CODIGO.md.
