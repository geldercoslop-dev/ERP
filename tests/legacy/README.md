# Tests Legados

Esta pasta contém testes que foram desativados e não fazem parte da suite de testes atual.

## Status
- **Não fazem parte da suite de testes** do sistema
- **Não participam da validação** da base
- Podem conter código antigo usando DB_* (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
- Mantidos apenas para referência histórica

## Tests Movidos

### Tests de Banco (desativados)
- `test-db-stress.cjs` - Teste de stress de banco
- `test-db-connection-direct.cjs` - Teste de conexão direta com banco

## Motivo da Desativação

Estes testes usavam variáveis de ambiente `DB_*` (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) 
com fallbacks para valores padrão (localhost, root, etc). Isso viola a arquitetura oficial do sistema.

**Arquitetura Oficial:**
- O sistema usa SOMENTE `DATABASE_URL` como fonte de conexão com banco
- Variáveis `DB_*` são PROIBIDAS em código ativo
- MYSQL_* é permitido SOMENTE no Docker (para subir container MySQL)

## Tests Ativos Equivalentes

Os seguintes tests ativos substituem a funcionalidade dos legados:
- `server/scripts/test-db-connection.ts` - Teste de conexão (usa DATABASE_URL)
- `server/scripts/check-database.ts` - Verificação de banco (usa DATABASE_URL)

## Data da Migração
24 de abril de 2026

## Ação Necessária
Nenhuma. Estes testes são mantidos apenas para referência e podem ser deletados no futuro 
se não houver necessidade histórica.
