---
title: Schema Hardening & Prevention Guide
slug: schema-hardening-guide
date: 2024-03-26
status: "IMPLEMENTED"
---

# 🛡️ Schema Hardening & Prevention Guide

## Overview

Este documento descreve as camadas de proteção implementadas para **prevenir regressões de schema** e detectar problemas rapidamente.

## Implementações Realizadas

### 1. ✅ Build-time Validation Script

**Arquivo**: `scripts/validate-schema.mjs`

**Objetivo**: Verificar schema ANTES da compilação TypeScript

**O que valida**:
- Todas as 16 tabelas multi-tenant têm coluna `tenant_id`
- Colunas críticas estão em snake_case (open_id, user_id, created_at)
- Tabelas de sistema NÃO têm tenant_id (correto design)
- Tabela `tenants` existe com pelo menos 1 tenant

**Como usar**:

```bash
# Executar validação manualmente
node scripts/validate-schema.mjs

# Ou com check-only (aviso, não quebra build)
node scripts/validate-schema.mjs --check-only

# Integrado ao build (executado automaticamente)
pnpm build  # Executa validate-schema antes da compilação
```

**Saída esperada**:
```
✅ SCHEMA VÁLIDO E CONSISTENTE!
```

**Se falhar**:
```
❌ ERROS ENCONTRADOS:
  - Tabela 'vendedores' NÃO possui coluna 'tenant_id'
  - Coluna 'users.openId' não encontrada (esperado snake_case)

💥 BUILD FALHOU: Schema inválido
```

---

### 2. ✅ Runtime Schema Guard

**Arquivo**: `server/services/schema-runtime-guard.ts`

**Objetivo**: Validar schema durante bootstrap (startup da aplicação)

**O que valida**:
- Tabelas users e vendedores têm tenant_id
- Colunas estão em snake_case
- Tabela tenants existe e tem >= 1 tenant
- Fornece diagnóstico detalhado se validação falhar

**Donde usado**:
- Integrado em `server/services/bootstrap.service.ts`
- Executado APÓS migrações Drizzle
- Logs mostram problemas mas NÃO quebra o servidor (fail-soft)

**Saída esperada** (logs):
```
[SCHEMA_GUARD] Iniciando validação de schema em runtime...
[SCHEMA_GUARD] ✓ Tabela users tem tenant_id
[SCHEMA_GUARD] ✓ Tabela vendedores tem tenant_id
[SCHEMA_GUARD] ✓ users.open_id em snake_case
[SCHEMA_GUARD] ✓ vendedores.user_id em snake_case
[SCHEMA_GUARD] ✓ Tabela tenants existe
[SCHEMA_GUARD] ✓ 1 tenant(s) configurado(s)
[SCHEMA_GUARD] ✅ Schema válido e consistente!
```

**Se detectar problema**:
```
[SCHEMA_GUARD] 🚨 VALIDAÇÃO FALHOU:
  ❌ Tabela 'vendedores' está sem coluna 'tenant_id'
  ❌ Coluna 'users.open_id' não encontrada
  
[SCHEMA_GUARD] 💥 Schema inválido! O banco pode estar corrompido ou desatualizado.
[SCHEMA_GUARD] 💡 Sugestões:
   1. Execute: docker-compose down -v && docker-compose up --build
   2. Verifique as migrations em /app/drizzle/
```

---

### 3. ✅ Automated Test Suite

**Arquivo**: `server/tests/schema-consistency.test.ts`

**Objetivo**: Testes que verificam schema consistency durante `npm test`

**O que testa**:
- ✓ Todas as 16 tabelas multi-tenant têm `tenant_id`
- ✓ Colunas críticas estão em snake_case
- ✓ Tabela `tenants` existe
- ✓ Nenhuma coluna legacy em camelCase (userId, openId, etc)
- ✓ Dados integridade: nenhuma linha com tenant_id NULL

**Como usar**:

```bash
# Executar testes de schema
pnpm test:schema

# Ou integrado em todos os testes
pnpm test
```

**Saída esperada**:
```
✓ server/tests/schema-consistency.test.ts (15 tests)

Multi-tenant tenant_id presence
  ✓ tabela users deve ter coluna tenant_id
  ✓ tabela vendedores deve ter coluna tenant_id
  ✓ tabela cargas deve ter coluna tenant_id
  ...

Snake_case column naming
  ✓ users.open_id deve existir em snake_case
  ✓ users.login_method deve existir em snake_case
  ✓ vendedores.user_id deve existir em snake_case
  ...

Tenants master table
  ✓ tabela tenants deve existir
  ✓ deve existir pelo menos 1 tenant configurado
  ✓ tenant default (id=1) deve existir

No legacy column naming
  ✓ vendedores não deve ter coluna userId (deve ser user_id)
  ✓ users não deve ter coluna openId (deve ser open_id)

Data integrity
  ✓ todas as linhas de vendedores devem ter tenant_id not null
  ✓ todas as linhas de users devem ter tenant_id not null
```

**Se falhar**:
```
❌ tabela vendedores deve ter coluna tenant_id
  Error: Timeout...
  
❌ users.open_id deve existir em snake_case
  AssertionError: expected 0 to be 1
```

---

### 4. ✅ Integration into Build Pipeline

**Package.json**:
```json
{
  "scripts": {
    "prebuild": "node scripts/validate-schema.mjs",
    "build": "pnpm run build:server",
    "build:server": "tsc -p tsconfig.server.json",
    "validate:schema": "node scripts/validate-schema.mjs",
    "test:schema": "vitest run server/tests/schema-consistency.test.ts"
  }
}
```

**Fluxo de execução**:
```
pnpm build
  ↓
prebuild: node scripts/validate-schema.mjs  ← 🔴 Se falhar aqui, build para
  ↓
build:server: tsc -p tsconfig.server.json   ← Só chegaqui se schema válido
```

---

## Preventive Measures Summary

| Layer | When | Tool | Behavior |
|-------|------|------|----------|
| **Build-time** | `pnpm build` | validate-schema.mjs | Fail-fast: impede compilação |
| **Runtime** | Server startup | schema-runtime-guard.ts | Logs warning, server continua |
| **Test** | `pnpm test:schema` | vitest tests | Fail-fast: testes falham |
| **CI/CD** | Pipeline | package.json prebuild | Automático antes de deploy |

---

## Schema Structure Enforced

### Tables WITH tenant_id (Multi-tenant)
```sql
users
vendedores
cargas
clientes
cores
produtos
pedidos
comissoes
contas_fixas
contas_pagar
contas_receber
counters
grupos_precificacao
itens_pedido
plano_contas
pedidos_carga
```

### Tables WITHOUT tenant_id (System/Technical)
```sql
__drizzle_migrations    -- Drizzle internal
tenants                 -- Master tenant table (no tenant_id, é o "root")
cliente_vendedores      -- Junction table
idempotency_keys        -- Technical
job_execution_log       -- Logging
pendencias_compra       -- Legacy?
fornecedores            -- May need review
```

---

## Column Naming Convention

**ALL columns MUST be snake_case**:

```typescript
// ✅ CORRECT
const users = {
  id: int().primaryKey(),
  tenant_id: int().notNull(),
  open_id: varchar().unique(),        // NOT openId
  login_method: varchar(),             // NOT loginMethod
  created_at: timestamp().defaultNow(),// NOT createdAt
  updated_at: timestamp(),             // NOT updatedAt
};

// ❌ WRONG (legacy)
const users = {
  id: int().primaryKey(),
  tenantId: int().notNull(),           // Wrong!
  openId: varchar().unique(),          // Wrong!
  loginMethod: varchar(),              // Wrong!
  createdAt: timestamp().defaultNow(), // Wrong!
  updatedAt: timestamp(),              // Wrong!
};
```

---

## How to Recover from Schema Regression

### If build fails on schema validation:

```bash
# 1. Read the error carefully - it says exactly what's wrong
node scripts/validate-schema.mjs

# 2. Reset database and re-apply migrations
docker-compose down -v
docker volume prune -f
docker-compose up --build -d

# 3. Check if specific tables are missing columns
docker exec erp-mysql-1 mysql -e \
  "SHOW COLUMNS FROM vendedores;" -u root -proot -D erp

# 4. If columns are wrong, apply migration manually
docker cp fix-schema.sql erp-mysql-1:/tmp/
docker exec erp-mysql-1 bash -c "mysql < /tmp/fix-schema.sql" \
  -u root -proot -D erp

# 5. Re-validate
node scripts/validate-schema.mjs
```

### If runtime guard detects issues:

```
Check the log messages in server startup:
  [SCHEMA_GUARD] ❌ Tabela 'vendedores' está sem coluna 'tenant_id'
  
Then run the recovery step from above.
```

---

## Key Files

| File | Purpose |
|------|---------|
| scripts/validate-schema.mjs | Build-time validation |
| server/services/schema-runtime-guard.ts | Runtime validation |
| server/tests/schema-consistency.test.ts | Automated tests |
| server/services/bootstrap.service.ts | Where runtime guard runs |
| drizzle/schema.ts | Source of truth for schema |
| package.json | Build pipeline integration |

---

## Next: Type Safety (TODO)

**Goal**: Ensure ALL entity types have explicit `tenant_id: number` typing

**What to do**:
1. Add `tenantId: number` to all entity types
2. Remove implicit `any` typing
3. Run TypeScript: `pnpm typecheck`

**Files to review**:
- server/db/core.ts
- shared/types/entities.ts
- All entity definitions

---

## Version History

| Date | Change |
|------|--------|
| 2024-03-26 | Initial implementation: build validation, runtime guard, tests, pipeline integration |

---

**Note**: This hardening prevents future schema regressions. If you encounter database issues, ALWAYS start by running the validation to identify exactly what's wrong.
