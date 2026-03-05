# Relatório final – Hardening e workflow Git

Resumo do que foi verificado/implementado e o que o usuário deve fazer agora.

---

## 1. Arquivos alterados ou criados (com caminho)

| Caminho | Ação |
|---------|------|
| `server/_core/loadEnv.ts` | Já existia – carrega .env e .env.development ou .env.production por NODE_ENV |
| `server/_core/index.ts` | Já existia – entry usa loadEnv; CORS só para /api; log só para /api/trpc (method, url, cookie, x-session-token, authorization); /api/health e /api/debug/headers (DEV) |
| `server/_core/context.ts` | Já existia – log de cookieToken, headerToken, authToken, token final |
| `server/db.ts` | Já existia – helper logMySqlError (err.code, err.errno, err.sqlState, err.sqlMessage, query) em todos os catches relevantes |
| `package.json` | Já existia – scripts db:push:dev, db:push:prod, db:generate, db:migrate |
| `server/scripts/db-push-prod.js` | Já existia – aborta com exit 1 e mensagem "proibido em prod" |
| `.env.example`, `.env.development.example`, `.env.production.example` | Já existiam |
| `docs/RECUPERACAO_SISTEMA.md` | Atualizado – menção a test:db no playbook MySQL |
| `docs/WORKFLOW_GIT.md` | **Criado** – branches (dev/main), regra de commit pequeno (tela pronta, botão, banco, bug) |
| `docs/LEMBRETE_COMMIT.md` | **Criado** – lembrete de commit pequeno e comandos (git checkout dev, add, commit, push) |
| `README.md` | Atualizado – links para WORKFLOW_GIT.md e LEMBRETE_COMMIT.md |

---

## 2. Scripts já existentes (nenhum novo adicionado nesta rodada)

- `db:push:dev` → cross-env NODE_ENV=development drizzle-kit push  
- `db:push:prod` → node server/scripts/db-push-prod.js (aborta, exit 1)  
- `check:db` → tsx server/scripts/check-database.ts  
- `test:db` → tsx server/scripts/test-db-connection.ts  

---

## 3. Comandos que o usuário deve rodar agora

**Garantir branch e commit (com Git instalado). Rodar um comando por linha:**

```
git checkout dev
```

```
git add .
```

```
git commit -m "Hardening e docs: WORKFLOW_GIT, LEMBRETE_COMMIT, RECUPERACAO atualizado"
```

```
git push
```

**Antes de testar (MySQL/XAMPP ligado). Rodar um comando por vez:**

```
npm run test:db
```

```
npm run check:db
```

```
npm run dev
```

Depois: abrir a URL no navegador, fazer login admin, seguir docs/TESTE_RAPIDO.md (vendedores, listas, /api/health).

---

## 4. Checklist de validação (TESTE_RAPIDO)

- [ ] MySQL ligado (XAMPP ou serviço na porta 3306)
- [ ] `npm run test:db` – conexão OK
- [ ] `npm run check:db` – "Conexão estabelecida"
- [ ] `npm run dev` – servidor sobe sem erro
- [ ] Login admin – redireciona para a aplicação
- [ ] Listar vendedores – lista carrega
- [ ] Criar vendedor – sucesso e lista atualiza sem F5
- [ ] Excluir vendedor – lista atualiza
- [ ] Listar pedidos / cargas / pendências – abrir as telas (listas disparam sem TRPCError crítico)
- [ ] GET /api/health – db.status "ok", schemaMatch true (ou justificativa documentada)

Se algo falhar: ver docs/RECUPERACAO_SISTEMA.md e coletar traceId, err.code, err.sqlMessage conforme docs.

---

## 5. Risco de perda de dados – quando usar e quando NÃO usar

**db:push (e db:push:dev)**  
- **Usar em DEV** quando o schema do código estiver à frente do banco (novas tabelas/colunas) e você tiver lido o que o Drizzle vai alterar. Pode apagar colunas ou dados se o schema for reduzido.  
- **NUNCA usar em produção.** Em produção use sempre: backup → alterar schema → `db:generate` → revisar SQL em drizzle/migrations → `db:migrate`. O script `db:push:prod` existe só para abortar e lembrar disso; não executa push.

**Resumo:** Em produção, nenhum comando destrutivo (truncate/drop) deve rodar automaticamente; migrations devem ser revisadas; backup antes de migração é obrigatório (ver docs/DEPLOY_PRODUCAO.md e docs/BASE_DE_DADOS.md).

---

## 6. Segurança (banco e diagnóstico)

- **db:push:dev** – existe em package.json; roda com `NODE_ENV=development` (cross-env). Só use em desenvolvimento.
- **db:push:prod** – existe; executa `node server/scripts/db-push-prod.js`, que **aborta com exit 1** e mensagem clara (proibido em prod).
- **GET /api/health** – existe em server/_core/index.ts; retorna `db.status`, `db.database`, `db.timeMs`, `schemaVersion`, `expectedSchemaVersion`, `schemaMatch`, `uptimeSeconds`, `nodeEnv`.
- **GET /api/debug/headers** – existe; só responde quando `NODE_ENV === "development"`; retorna cookie, xSessionToken, authorization.
