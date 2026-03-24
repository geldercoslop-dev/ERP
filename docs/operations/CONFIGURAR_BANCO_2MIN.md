# Banco não conectado — resolver em 2 minutos

Se ao fazer login aparece **"database not available"** ou **"Usuário inválido"**, o problema **não é a senha**. O backend está rodando **sem banco configurado**.

O log mostra algo como:

```
[Database] Credenciais obrigatórias. Defina DATABASE_URL ou:
DB_HOST
DB_USER
DB_PASSWORD
DB_NAME
```

## Como resolver

1. Abra o arquivo **`.env`** na raiz do projeto:  
   `C:\GRS ATUAL\.env`

2. Se não existir, copie o exemplo e renomeie:
   - Copie `.env.example` para `.env`
   - Ou crie `.env` e cole o bloco abaixo

3. Coloque as variáveis do banco (descomente e ajuste para o seu MySQL):

   **Exemplo XAMPP padrão (senha vazia):**
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=grs
   DB_PORT=3306
   ```

   **Se o MySQL tiver senha:**
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=sua_senha_aqui
   DB_NAME=grs
   DB_PORT=3306
   ```

4. Crie o banco no MySQL (se ainda não existir):
   ```sql
   CREATE DATABASE grs;
   ```

5. Rode as migrações (primeira vez):
   ```bash
   npm run db:push
   ```
   ou
   ```bash
   npm run db:push:dev
   ```

6. Crie o usuário admin (primeira vez):
   ```bash
   npm run seed:admin
   ```
   (Use a senha que definir em `ADMIN_INITIAL_PASSWORD` no `.env`.)

7. Reinicie o servidor e tente o login de novo.

---

**Resumo:** O app precisa de `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (e opcionalmente `DB_PORT`) no `.env`. Sem isso, nenhum usuário é encontrado e o login falha.
