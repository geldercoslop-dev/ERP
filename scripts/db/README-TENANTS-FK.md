# Resolver erro 1451 (FK bloqueia DROP TABLE tenants)

## Problema

Ao rodar `drizzle-kit push`, o Drizzle tenta fazer `DROP TABLE tenants`, mas o MySQL retorna:

```text
#1451 - Cannot delete or update a parent row: a foreign key constraint fails
```

Várias tabelas têm FK apontando para `tenants.id`; enquanto essas FKs existirem, o MySQL não permite apagar `tenants`.

## Solução em 2 passos

### 1) Rodar o script SQL que remove as FKs e a tabela `tenants`

Execute o arquivo `drop-tenants-fks.sql` no seu MySQL (banco do projeto, ex.: `vendas_app`):

**Opção A – phpMyAdmin (XAMPP)**  
- Abra o banco (ex.: `vendas_app`).  
- Aba **SQL**.  
- Cole o conteúdo de `drop-tenants-fks.sql` e execute.

**Opção B – Linha de comando MySQL**

```bash
mysql -u vendas -p vendas_app < scripts/db/drop-tenants-fks.sql
```

(Ajuste usuário, senha e nome do banco conforme seu ambiente.)

Se alguma FK ou tabela já tiver sido removida antes, pode aparecer erro em uma linha (ex.: “Unknown table” ou “Can't DROP”). Pode ignorar e seguir; o importante é que as FKs que ainda existiam tenham sido dropadas e que `tenants` tenha sido dropada.

### 2) Rodar de novo o push do Drizzle

No diretório do projeto:

```bash
pnpm exec drizzle-kit push
```

Com as FKs e a tabela `tenants` já removidas, o push não deve mais tentar (ou conseguir) dropar `tenants` e o erro 1451 deixa de ocorrer nesse ponto.

## Por que isso acontece

- O **schema atual** do Drizzle (ex.: `drizzle/schema.ts`) **não** declara a tabela `tenants`; só usa `tenantId` / `tenant_id` nas tabelas.
- O **banco** ainda tinha a tabela `tenants` e FKs do tipo `*_tenantId_tenants_id_fk`.
- O `drizzle-kit push` gera alterações que incluem “remover o que não está no schema” → tenta `DROP TABLE tenants` antes de remover as FKs → MySQL bloqueia com 1451.

O script `drop-tenants-fks.sql` faz na ordem correta: primeiro remove as FKs que apontam para `tenants`, depois faz `DROP TABLE tenants`.

## Se ainda der erro de FK em outras tabelas

Se aparecer erro 1451 envolvendo **outras** tabelas (ex.: `sessions` → `users`, `vendedores` → `users`), a lógica é a mesma:

1. Descobrir qual FK está bloqueando (mensagem do MySQL).  
2. Remover essa FK com `ALTER TABLE ... DROP FOREIGN KEY ...`.  
3. Só então fazer o DROP da tabela pai, se ainda for necessário.

Depois disso, rodar de novo `drizzle-kit push`.
