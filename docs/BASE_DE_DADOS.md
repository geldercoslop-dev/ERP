# Base de dados â€“ configuraÃ§Ã£o e operaÃ§Ãµes

Como configurar MySQL (XAMPP), variÃ¡veis de ambiente, e como rodar check:db, db:push:dev, db:generate e db:migrate. PolÃ­tica DEV vs PROD.

---

## 1. Configurar MySQL (XAMPP)

- Instale o XAMPP e inicie o **MySQL** pelo painel (porta 3306).
- Crie a base (se nÃ£o existir):
  ```sql
  CREATE DATABASE IF NOT EXISTS vendas_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ```
- Crie um usuÃ¡rio com acesso (ex.):
  ```sql
  CREATE USER IF NOT EXISTS 'vendas'@'localhost' IDENTIFIED BY 'vendas123';
  GRANT ALL ON vendas_app.* TO 'vendas'@'localhost';
  FLUSH PRIVILEGES;
  ```

---

## 2. VariÃ¡veis de ambiente

O app carrega, nesta ordem:

- `.env` (base)
- `.env.development` ou `.env.production` conforme `NODE_ENV`

**ObrigatÃ³rio (uma das opÃ§Ãµes):**

- **OpÃ§Ã£o 1:** `DATABASE_URL=mysql://usuario:senha@host:porta/base`
- **OpÃ§Ã£o 2:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

**Recomendado:**

- `PORT` (ex.: 3000)
- `VITE_TRPC_URL` (preferir `/api/trpc` para mesma origem e cookie)

Exemplos de arquivos: `.env.example`, `.env.development.example`, `.env.production.example` na raiz do projeto.

---

## 3. Comandos de banco

| Comando | Uso |
|--------|-----|
| `npm run check:db` | Testa conexÃ£o e lista tabelas/colunas (qualquer ambiente). |
| `npm run db:push:dev` | **SÃ³ DEV.** Sincroniza o schema do cÃ³digo com o banco (pode pedir confirmaÃ§Ã£o). |
| `npm run db:push:prod` | **NÃ£o aplica nada.** Sai com erro lembrando de usar migrations em produÃ§Ã£o. |
| `npm run db:generate` | Gera migraÃ§Ãµes em `drizzle/migrations/` a partir de `drizzle/schema.ts`. |
| `npm run db:migrate` | Aplica migraÃ§Ãµes pendentes (DEV ou PROD; em PROD faÃ§a backup antes). |

---

## 4. PolÃ­tica DEV vs PROD

- **DEV:** Pode usar `db:push:dev` para alinhar o banco ao schema rapidamente. Opcionalmente use `db:generate` + `db:migrate` para testar o fluxo de migraÃ§Ãµes.
- **PROD:** **Nunca** rode `db:push`. Sempre:
  1. Backup.
  2. Alterar schema â†’ `db:generate` â†’ revisar SQL â†’ `db:migrate`.
  3. Verificar `/api/health` (schemaVersion vs expectedSchemaVersion).

---

## 5. Schema version (expectedSchemaVersion)

- A versÃ£o esperada pelo cÃ³digo fica em **`server/_core/schemaVersion.ts`**: `EXPECTED_SCHEMA_VERSION` (ex.: 1).
- Crie um nÃºmero simples (ex.: 1) e **incremente** quando gerar uma migraÃ§Ã£o que altere o "contrato" do schema (novas tabelas/colunas que o cÃ³digo passa a depender).
- O `/api/health` compara a versÃ£o gravada no banco (tabela `schema_version`) com `EXPECTED_SCHEMA_VERSION` e retorna `schemaMatch: true/false`.
