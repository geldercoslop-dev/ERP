# Convenções de código – guardrails para novas telas e CRUDs

Regras permanentes para manter o sistema previsível e evitar "lista não atualiza", "botão não salva" e "precisa estar logado" sem motivo.

---

## A) Novos botões / formulários / telas

1. **Estado local `isSubmitting`** para botões de submit (criar/editar). Não desabilitar o botão apenas com um loading global (ex.: auth).
2. **Validação mínima** antes do submit (campos obrigatórios preenchidos).
3. **Toast de sucesso/erro** após mutation (já usando Sonner no projeto).
4. **Invalidate/refetch após mutation:** após create/update/delete, invalidar as queries de lista usadas na tela (ex.: `utils.vendedores.list.invalidate()` ou o helper `invalidateAfterMutation(utils, ["vendedores.list"])`).
5. **Não usar `isLoading` global** (auth/store) para controlar o `disabled` do botão de submit; use sempre estado local (ex.: `isSubmitting` ou `mutation.isPending`).

**Exemplo de padrão de botão:**

- `canSubmit` = todos os campos obrigatórios preenchidos.
- `isSubmitting` = `mutation.isPending` (ou soma de várias mutations da tela).
- `disabled={!canSubmit || isSubmitting}`.

---

## B) Novas tabelas / colunas (schema)

1. Alterar **apenas** `drizzle/schema.ts` (e tipos relacionados, se houver).
2. **Gerar migração versionada:** `npm run db:generate`.
3. **Aplicar em DEV:** `npm run db:migrate` (ou em DEV `db:push:dev` se for política do time; em PROD nunca db:push).
4. **Atualizar `expectedSchemaVersion`** em `server/_core/schemaVersion.ts`: incrementar (ex.: 1 → 2) quando a migração alterar o "contrato" do schema.
5. **Nunca usar `db:push` em produção;** sempre migrations + backup.

---

## C) "Erro de login" / "precisa estar logado"

Ordem de diagnóstico (não pule para CORS antes de checar):

1. **Cookie/session_token no browser:** DevTools → Application → Cookies. A URL do app deve ter cookie de sessão (session_token ou equivalente).
2. **Só em DEV:** `GET /api/debug/headers` e ver o que o servidor recebe (cookie, x-session-token, authorization).
3. **Logs do servidor:** `[createContext]` – token recebido? Valor correto?
4. Só depois disso: checar CORS e headers (credentials: "include", mesma origem, etc.).

---

## D) "TRPCError Failed query" / erro de SQL

1. **Sempre coletar** no log do servidor: **err.code** e **err.sqlMessage** (e traceId, se aparecer).
2. Rodar **GET /api/health** e conferir **schemaVersion** vs **expectedSchemaVersion**.
3. Se houver **mismatch:** aplicar a migração pendente (ou `db:push:dev` só em DEV) e/ou ajustar expectedSchemaVersion conforme a política do time.
4. Não "consertar a query" no escuro; use err.code e err.sqlMessage para decidir se o problema é coluna faltando, tabela errada, tipo errado, etc.
