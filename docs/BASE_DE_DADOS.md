# Base de dados – configuração e operações

Como configurar MySQL (XAMPP), variáveis de ambiente, e como rodar check:db, db:push:dev, db:generate e db:migrate. Política DEV vs PROD.

---

## 1. Configurar MySQL (XAMPP)

- Instale o XAMPP e inicie o **MySQL** pelo painel (porta 3306).
- Crie a base (se não existir):
  ```sql
  CREATE DATABASE IF NOT EXISTS vendas_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ```
- Crie um usuário com acesso (ex.):
  ```sql
  CREATE USER IF NOT EXISTS 'vendas'@'localhost' IDENTIFIED BY 'vendas123';
  GRANT ALL ON vendas_app.* TO 'vendas'@'localhost';
  FLUSH PRIVILEGES;
  ```

---

## 2. Variáveis de ambiente

O app carrega, nesta ordem:

- `.env` (base)
- `.env.development` ou `.env.production` conforme `NODE_ENV`

**Obrigatório (uma das opções):**

- **Opção 1:** `DATABASE_URL=mysql://usuario:senha@host:porta/base`
- **Opção 2:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

**Recomendado:**

- `PORT` (ex.: 3003)
- `VITE_TRPC_URL` (preferir `/api/trpc` para mesma origem e cookie)

Exemplos de arquivos: `.env.example`, `.env.development.example`, `.env.production.example` na raiz do projeto.

---

## 3. Comandos de banco

| Comando | Uso |
|--------|-----|
| `npm run check:db` | Testa conexão e lista tabelas/colunas (qualquer ambiente). |
| `npm run db:push:dev` | **Só DEV.** Sincroniza o schema do código com o banco (pode pedir confirmação). |
| `npm run db:push:prod` | **Não aplica nada.** Sai com erro lembrando de usar migrations em produção. |
| `npm run db:generate` | Gera migrações em `drizzle/migrations/` a partir de `drizzle/schema.ts`. |
| `npm run db:migrate` | Aplica migrações pendentes (DEV ou PROD; em PROD faça backup antes). |

---

## 4. Política DEV vs PROD

- **DEV:** Pode usar `db:push:dev` para alinhar o banco ao schema rapidamente. Opcionalmente use `db:generate` + `db:migrate` para testar o fluxo de migrações.
- **PROD:** **Nunca** rode `db:push`. Sempre:
  1. Backup.
  2. Alterar schema → `db:generate` → revisar SQL → `db:migrate`.
  3. Verificar `/api/health` (schemaVersion vs expectedSchemaVersion).

---

## 5. Schema version (expectedSchemaVersion)

- A versão esperada pelo código fica em **`server/_core/schemaVersion.ts`**: `EXPECTED_SCHEMA_VERSION` (ex.: 1).
- Crie um número simples (ex.: 1) e **incremente** quando gerar uma migração que altere o "contrato" do schema (novas tabelas/colunas que o código passa a depender).
- O `/api/health` compara a versão gravada no banco (tabela `schema_version`) com `EXPECTED_SCHEMA_VERSION` e retorna `schemaMatch: true/false`.
