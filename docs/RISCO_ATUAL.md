# Risco atual do sistema

Este documento descreve os riscos que o sistema corre se certas regras nao forem seguidas. O hardening foi feito para reduzir esses riscos.

---

## 1. Perda de dados por db:push destrutivo

**Risco:** Em producao, rodar `drizzle-kit push` pode aplicar alteracoes que apagam colunas ou tabelas.

**Mitigacao:** Use so `npm run db:push:dev` em desenvolvimento. Em producao use `npm run db:push:prod` (ele ABORTA e nao executa). Em producao: backup + migrations (db:generate, revisar SQL, db:migrate).

---

## 2. Banco MySQL fora do schema

**Risco:** O codigo espera tabelas/colunas que nao existem. Resultado: TRPCError, "Failed query", telas em branco.

**Mitigacao:** Conferir GET /api/health: `schemaMatch` deve ser true. Se false, aplicar migracao (prod) ou db:push:dev (dev). Nova tabela/coluna: atualizar schema.ts, db:generate, db:migrate, EXPECTED_SCHEMA_VERSION.

---

## 3. Sessao nao reconhecida (precisa estar logado)

**Risco:** Usuario fez login mas o sistema age como nao logado (cookie nao enviado, CORS, URL diferente).

**Mitigacao:** Ordem de diagnostico: 1) cookie no browser 2) /api/debug/headers 3) logs do createContext 4) CORS. Uma unica instancia tRPC e credentials: "include" (ja implementado). Login na mesma URL da barra de endereco.

---

## 4. CRUD salvar mas lista nao atualizar

**Risco:** Usuario salva, vê sucesso, mas a lista nao atualiza ate F5.

**Mitigacao:** Apos toda mutation (create/update/delete), invalidar a query da lista (utils.entidade.list.invalidate() ou invalidateAfterMutation). Ver CONVENCOES_DE_CODIGO.md.

---

## 5. Bugs dificeis de diagnosticar

**Risco:** Erro sem log claro ou ID de rastreio.

**Mitigacao:** Todo erro tRPC gera traceId (log e Sentry). Todo erro SQL loga err.code, err.errno, err.sqlState, err.sqlMessage e query. GET /api/health expoe status do banco e schemaVersion.

---

## 6. Deploy quebrar producao

**Risco:** Deploy sem backup ou sem migracao controlada.

**Mitigacao:** Backup antes de alterar schema. Usar migrations em prod, nunca db:push. Apos deploy: /api/health e smoke test. Rollback documentado em DEPLOY_PRODUCAO.md.

---

## Resumo

| Risco | O que fazer |
|-------|-------------|
| Perda de dados | Nao db:push em prod; migrations e backup. |
| Banco fora do schema | /api/health schemaMatch; migracao ou db:push:dev. |
| Precisa estar logado | Cookie, /api/debug/headers, logs context, CORS. |
| Lista nao atualiza | invalidateAfterMutation apos mutation. |
| Bugs dificeis | traceId nos logs; err.code e err.sqlMessage. |
| Deploy quebrar | Backup, migrations, healthcheck, smoke test. |
