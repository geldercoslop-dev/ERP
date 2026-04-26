# Scripts Legados

Esta pasta contém scripts que foram desativados e não fazem parte do runtime atual.

## Status
- **Não fazem parte do runtime** do sistema
- **Não participam da validação** da base
- Podem conter código antigo usando DB_* (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
- Mantidos apenas para referência histórica

## Scripts Movidos

### Scripts de Teste de Banco (desativados)
- `test-db-connection.js` - Teste de conexão antigo
- `test-db-connection.mjs` - Teste de conexão antigo (ESM)
- `test-produtos-query.js` - Teste de queries de produtos
- `testar-cache-db.mjs` - Teste de cache com banco
- `test-db-performance.mjs` - Teste de performance de banco
- `check-indexes.mjs` - Verificação de índices

### Scripts de Idempotência (desativados)
- `testar-idempotencia-db.mjs` - Teste de idempotência no banco
- `teste-idempotencia.js` - Teste de idempotência
- `teste-idempotencia.mjs` - Teste de idempotência (ESM)

### Scripts de Carga (desativados)
- `teste-carga-erp.js` - Teste de carga ERP
- `teste-carga-erp.mjs` - Teste de carga ERP (ESM)

### Scripts de Validação (desativados)
- `validar-db-real.mjs` - Validação de banco real
- `verify-audit-log.mjs` - Verificação de audit log
- `verificar-estrutura-tabelas.mjs` - Verificação de estrutura de tabelas

### Scripts de Inserção de Dados (desativados)
- `inserir-dados-teste.mjs` - Inserção de dados de teste
- `inserir-dados-teste-real.mjs` - Inserção de dados reais de teste

### Scripts PowerShell (desativados)
- `run-drop-tenants-fks.ps1` - Script para drop de FKs de tenants

## Motivo da Desativação

Estes scripts usavam variáveis de ambiente `DB_*` (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) 
com fallbacks para valores padrão (localhost, root, etc). Isso viola a arquitetura oficial do sistema.

**Arquitetura Oficial:**
- O sistema usa SOMENTE `DATABASE_URL` como fonte de conexão com banco
- Variáveis `DB_*` são PROIBIDAS em código ativo
- MYSQL_* é permitido SOMENTE no Docker (para subir container MySQL)

## Scripts Ativos Equivalentes

Os seguintes scripts ativos substituem a funcionalidade dos legados:
- `server/scripts/check-database.ts` - Verificação de conexão (usa DATABASE_URL)
- `server/scripts/test-db-connection.ts` - Teste de conexão (usa DATABASE_URL)
- `scripts/validate-schema.mjs` - Validação de schema (usa DATABASE_URL)

## Data da Migração
24 de abril de 2026

## Ação Necessária
Nenhuma. Estes scripts são mantidos apenas para referência e podem ser deletados no futuro 
se não houver necessidade histórica.
