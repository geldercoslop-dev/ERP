# Backup e Restore MySQL – Produção

Guia curto para backup, restore e validação pós-restore do banco GRS ERP (MySQL).

---

## 1. Backup (antes de migrate ou deploy)

**Via linha de comando (recomendado em produção):**

```bash
# Ajuste usuário, senha e nome do banco conforme seu .env (DB_USER, DB_PASSWORD, DB_NAME ou DATABASE_URL)
mysqldump -u USUARIO -p NOME_DO_BANCO > backups/vendas_app_$(date +%Y%m%d_%H%M).sql
```

Exemplo com variáveis de ambiente (Linux/macOS):

```bash
# Se usar DATABASE_URL: mysql://user:pass@host:3306/dbname
mysqldump -h localhost -P 3306 -u vendas -p vendas_app > backups/vendas_app_$(date +%Y%m%d_%H%M).sql
```

**Onde guardar:** pasta `backups/` na raiz (adicione `backups/` ao `.gitignore`). Em produção, copie o arquivo para storage externo (S3, outro servidor).

---

## 2. Restore

**Cuidado:** restore **sobrescreve** o banco atual. Só use em emergência ou em ambiente de teste.

```bash
mysql -u USUARIO -p NOME_DO_BANCO < backups/vendas_app_YYYYMMDD_HHMM.sql
```

Ou dentro do MySQL:

```sql
USE vendas_app;
SOURCE /caminho/completo/para/backups/vendas_app_YYYYMMDD_HHMM.sql;
```

---

## 3. Validação pós-restore

Após qualquer restore, rode na ordem:

```bash
# 1) TypeScript
npm run check

# 2) Aplicar migrations (se o backup for de versão anterior)
npm run db:migrate

# 3) Validar tabela de idempotência
npm run db:validate

# 4) Testes de núcleo
npm run test:core
```

Se todos passarem, o sistema está consistente. Confirme também:

- **Health:** `GET /api/health` deve retornar `dbStatus: "ok"` e `schemaMatch: true`.
- **Login:** testar login e uma operação (ex.: listar pedidos).

---

## 4. Resumo

| Etapa        | Comando / Ação |
|-------------|----------------|
| Backup      | `mysqldump -u USER -p DB > backups/arquivo.sql` |
| Restore     | `mysql -u USER -p DB < backups/arquivo.sql` |
| Pós-restore | `npm run check` → `npm run db:migrate` → `npm run db:validate` → `npm run test:core` |
| Conferência | `GET /api/health` + teste de login |

Para desenvolvimento local, veja também [BACKUP_BANCO_DEV.md](./BACKUP_BANCO_DEV.md) e [RECUPERACAO_SISTEMA.md](./RECUPERACAO_SISTEMA.md).
