# Correção schema contas_pagar – planoContaId → planoContasId

## Problema
Erro MySQL: `Unknown column 'planoContaId' in field list` ao rodar `contasPagar.list` e `boletos.gerarRelatorio`.

## Causa
A migration **0003** (`drizzle/0003_wild_hedge_knight.sql`) adiciona a coluna com o nome **`planoContasId`** (com 's'):
```sql
ALTER TABLE `contas_pagar` ADD `planoContasId` int;
```
O schema Drizzle em `drizzle/schema.ts` estava definido como **`planoContaId`** (sem 's'), fazendo o Drizzle gerar SQL com nome de coluna inexistente.

## Correção aplicada
- Em `drizzle/schema.ts`: em `contasFixas` e `contasPagar`, o campo foi padronizado para **`planoContasId`** com nome de coluna real `"planoContasId"`.
- Em `server/db.ts`: no insert de contas a pagar geradas a partir de contas fixas, o campo usado passou a ser **`planoContasId`**.

## SQL para confirmar colunas no MySQL
```sql
SHOW COLUMNS FROM contas_pagar;
```
Deve listar, entre outras, as colunas:
- **`planoContasId`** (int, NULL) – adicionada na migration 0003
- **`fornecedorId`** (int, NULL) – criada na migration 0002

## Evidência
Após a correção:
- `contasPagar.list` deve executar sem erro.
- `boletos.gerarRelatorio` (que usa listagem de contas) deve executar sem erro.
- Gate: `npm run check`, `npm run db:migrate`, `npm run db:validate`, `npm run test:core` devem passar.
