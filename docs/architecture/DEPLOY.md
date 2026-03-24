# Deploy — GRS ERP

Processo seguro para colocar o sistema em produção.

---

## 1. Backup antes de alteração de schema

- **Linha de comando:**  
  `mysqldump -u USUARIO -p NOME_DA_BASE > backup_$(date +%Y%m%d_%H%M).sql`
- **Script:** `npm run backup:db` (salva em `backups/`)
- Guardar backup em local seguro antes de rodar migrações

---

## 2. Migrações (nunca db:push em produção)

1. Alterar schema em `drizzle/schema.ts`
2. Gerar migração: `npm run db:generate`
3. Revisar arquivos em `drizzle/migrations/` (evitar DROP/TRUNCATE indesejados)
4. Aplicar em produção (após backup): `NODE_ENV=production npm run db:migrate`
5. Atualizar `expectedSchemaVersion` em `server/_core/schemaVersion.ts` se a migração exigir

---

## 3. Verificação /api/health

Após deploy ou migração:

- Acessar `GET /api/health`
- Confirmar: `db.status === "ok"`, `schemaMatch === true`
- Se `schemaMatch === false`, aplicar migração correspondente ou ajustar expectedSchemaVersion

---

## 4. Smoke tests após deploy

- Login (admin e vendedor)
- Listar vendedores; criar/editar e conferir lista
- Tela de pedidos/cargas para validar queries

---

## 5. Rollback

- Restaurar backup do banco (mysqldump import)
- Reverter deploy do código para versão anterior
- Ajustar expectedSchemaVersion no código se o banco restaurado tiver versão menor

---

## 6. Variáveis em produção

- `.env.production` ou variáveis do servidor
- Obrigatório: `DATABASE_URL` ou `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Recomendado: `PORT`, `VITE_TRPC_URL`, `ADMIN_INITIAL_PASSWORD`

Operação do dia a dia: `docs/OPERACAO.md`. Arquitetura: `docs/ARQUITETURA.md`.
