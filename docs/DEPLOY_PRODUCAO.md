# Deploy em produção – processo seguro

Processo recomendado para colocar o sistema em produção sem quebrar o banco nem perder dados.

---

## 1. Backup antes de qualquer alteração de schema

- **phpMyAdmin:** Export da base (Export → Go).
- **Linha de comando:**
  ```bash
  mysqldump -u USUARIO -p NOME_DA_BASE > backup_$(date +%Y%m%d_%H%M).sql
  ```
- Guarde o backup em local seguro antes de rodar migrações.

---

## 2. Migrations (nunca db:push em produção)

1. **Altere o schema** em `drizzle/schema.ts` conforme necessário.
2. **Gere a migração:**
   ```bash
   npm run db:generate
   ```
3. **Revise os arquivos** em `drizzle/migrations/` (arquivos `.sql` e `meta/_journal.json`). Confira se não há DROP/TRUNCATE indesejados.
4. **Aplique em produção** (após backup):
   ```bash
   NODE_ENV=production npm run db:migrate
   ```
5. **Atualize o expectedSchemaVersion** em `server/_core/schemaVersion.ts`: incremente o número (ex.: 1 → 2) quando a migração que você aplicou assim o exigir.

---

## 3. Verificação /api/health

Após o deploy ou após migração:

- Acesse `GET /api/health`.
- Confira:
  - `db.status === "ok"`
  - `schemaMatch === true` (schemaVersion do banco igual ao expectedSchemaVersion do código).
- Se `schemaMatch === false`, o código espera uma versão de schema que o banco ainda não tem: aplique a migração correspondente ou ajuste o expectedSchemaVersion (conforme política do time).

---

## 4. Smoke tests após deploy

- Login (admin e vendedor, se aplicável).
- Listar vendedores.
- Criar um vendedor de teste e conferir na lista (lista atualiza sem reload).
- Editar e excluir (se permitido) e conferir novamente a lista.
- Uma tela de pedidos/cargas para confirmar que as queries com JOIN continuam funcionando.

---

## 5. Rollback

- Se algo der errado **após migração**: restaure o backup do banco (import do mysqldump ou phpMyAdmin).
- Reverta o deploy do código para a versão anterior.
- O expectedSchemaVersion no código deve bater com a versão do schema que o banco restaurado tem (pode ser necessário voltar o número em `schemaVersion.ts` se você tiver revertido migrações).

---

## 6. Variáveis de ambiente em produção

- Use `.env.production` ou variáveis do ambiente do servidor.
- Obrigatório: `DATABASE_URL` ou `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- Recomendado: `PORT`, `VITE_TRPC_URL` (ex.: `https://seu-dominio.com/api/trpc`), `SENTRY_DSN` e `VITE_SENTRY_DSN` para diagnóstico.
