# Recuperação do sistema – roteiro de emergência

Passos curtos para quando algo quebra: "precisa estar logado", TRPCError de SQL, listas não atualizam, botões não salvam.

**Riscos do sistema (o que evitar):** Ver [RISCO_ATUAL.md](./RISCO_ATUAL.md). **Relatório consolidado (hardening + workflow):** Ver [RELATORIO_HARDENING_FINAL.md](./RELATORIO_HARDENING_FINAL.md).

---

## 1. MySQL / XAMPP

- **Sintoma:** Erro de conexão, `ECONNREFUSED`, "Database not available".
- **Ações:**
  1. Abra o XAMPP Control Panel e verifique se o MySQL está **Running** (porta 3306).
  2. Se não estiver, clique em **Start** no MySQL.
  3. Rode (um comando por vez):
     - `npm run check:db` e confira se "Conexão estabelecida" aparece.
     - Opcional: `npm run test:db` para outro teste de conexão.

---

## 2. Sessão / cookies ("precisa estar logado")

- **Sintoma:** Após login, redireciona de volta ao login ou "Acesso negado".
- **Ordem de checagem:**
  1. **Como verificar cookie/session_token no DevTools:** Abra DevTools (F12) → aba **Application** (Chrome) ou **Storage** (Firefox) → no menu à esquerda, **Cookies** → clique na URL do app (ex.: `http://localhost:3003`). Veja se existe `session_token`, `session` ou `auth_token`; o valor deve estar preenchido após login. Se não existir ou estiver vazio, o cookie não está sendo setado ou o domínio/path está errado.
  2. **Só em DEV:** Abra `GET /api/debug/headers` e veja o que o servidor recebe: `cookie`, `xSessionToken`, `authorization`. Se estiver vazio, o front não está enviando sessão.
  3. **Logs do servidor:** Procure por `[createContext]` e confira se o token está sendo recebido.
  4. **CORS/origem:** Faça login na **mesma URL** da barra de endereço (ex.: sempre `http://localhost:3003`). Evite misturar `localhost` e `127.0.0.1`.
  5. **tRPC client:** O fetch já usa `credentials: "include"` em `trpcClient.ts`; não remova.

---

## 3. db:push em desenvolvimento

- **Quando usar:** Schema do código à frente do banco (novas tabelas/colunas em DEV).
- **Comando:** `npm run db:push:dev` (com MySQL rodando).
- **Se pedir confirmação:** Leia o que o Drizzle vai alterar; em DEV pode aceitar.
- **Nunca em produção:** Em PROD use sempre migrations (ver BASE_DE_DADOS.md e DEPLOY_PRODUCAO.md).

---

## 4. Migrations em produção

- **Quando:** Alterações de schema em produção.
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
- **Erros de sessão:** Filtre por path (ex.: `auth.me`, `vendedores.list`) e confira se o erro é UNAUTHORIZED/FORBIDDEN (sessão/cookie).

---

## 6. Quais logs pegar (TRPCError / SQL)

- No **terminal do servidor**, ao ocorrer erro:
  - `[TRPC onError] traceId: XXXXX` → use esse ID para correlacionar com Sentry/log.
  - `MySQL err.code:` e `MySQL err.sqlMessage:` → anote os dois; são o motivo real do MySQL.
- Para "Failed query" ou erro de SELECT/INSERT: sempre coletar **err.code** e **err.sqlMessage** e, se possível, a query (já logada em vários pontos do `db`).

---

## 7. Lista não atualiza / botão não salva

- **Lista:** Verifique se após create/update/delete está sendo chamado `utils.xxx.list.invalidate()` (ou o helper `invalidateAfterMutation`). Ver CONVENCOES_DE_CODIGO.md.
- **Botão desabilitado:** Botões de submit devem usar estado **local** (ex.: `isSubmitting`) e **nunca** só o `isLoading` global do auth. Ver CONVENCOES_DE_CODIGO.md.
