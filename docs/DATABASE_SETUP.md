# Configuração do Banco de Dados

Este documento explica como configurar o banco de dados MySQL para o sistema ERP.

## Requisitos

- MySQL 5.7 ou superior
- Acesso de administrador ao MySQL para criar banco e usuário

## Passos para Configuração

### 1. Instalar o MySQL

Se você ainda não tem o MySQL instalado:

**Windows:**
- Baixe e instale o MySQL Community Server: https://dev.mysql.com/downloads/mysql/
- Ou instale o XAMPP que inclui MySQL: https://www.apachefriends.org/download.html

**macOS:**
```bash
brew install mysql
brew services start mysql
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
```

### 2. Criar Banco de Dados e Usuário

Execute os seguintes comandos no MySQL:

```sql
-- Criar banco de dados
CREATE DATABASE vendas_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Criar usuário
CREATE USER 'vendas'@'localhost' IDENTIFIED BY 'vendas123';

-- Conceder permissões
GRANT ALL PRIVILEGES ON vendas_app.* TO 'vendas'@'localhost';

-- Aplicar alterações
FLUSH PRIVILEGES;
```

### 3. Configurar o arquivo .env

Certifique-se de que seu arquivo `.env` na raiz do projeto contém as seguintes configurações:

```
DATABASE_URL=mysql://vendas:vendas123@localhost:3306/vendas_app
DB_HOST=localhost
DB_PORT=3306
DB_USER=vendas
DB_PASSWORD=vendas123
DB_NAME=vendas_app
```

### 4. Verificar a Conexão

Execute o comando para verificar se a conexão com o banco de dados está funcionando:

```bash
npm run check:db
```

Se tudo estiver configurado corretamente, você verá mensagens de sucesso.

### 5. Inicializar o Esquema do Banco de Dados

Execute o comando para criar as tabelas no banco de dados:

```bash
npm run db:push
```

## Solução de Problemas

### Erro de Conexão (ECONNREFUSED)

Se você receber o erro `ECONNREFUSED`:

1. Verifique se o MySQL está em execução
2. Verifique se o host e a porta estão corretos no arquivo `.env`
3. Verifique se não há firewall bloqueando a conexão

### Erro de Acesso Negado

Se você receber o erro `ER_ACCESS_DENIED_ERROR`:

1. Verifique se o usuário e senha estão corretos no arquivo `.env`
2. Verifique se o usuário tem permissões para acessar o banco de dados

### Erro de Banco de Dados Inexistente

Se você receber o erro `ER_BAD_DB_ERROR`:

1. Verifique se o nome do banco de dados está correto no arquivo `.env`
2. Verifique se o banco de dados foi criado corretamente

### Outros Erros

Execute o comando de diagnóstico para obter mais informações:

```bash
npm run check:db
```