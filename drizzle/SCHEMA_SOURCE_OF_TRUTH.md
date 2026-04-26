# SCHEMA SOURCE OF TRUTH

## PROPÓSITO
Definir o papel do `schema.ts` como fonte de verdade de desenvolvimento do ERP.

## PRINCÍPIO FUNDAMENTAL
**schema.ts = SOURCE OF TRUTH DE DESENVOLVIMENTO**

- ✔ Pode evoluir livremente
- ❌ Não pode ser sobrescrito por introspect automático
- ❌ Não pode ser gerado a partir do DB

---

## REGRAS IMUTÁVEIS

### 1. SCHEMA.TS É CONTRATO DE DOMÍNIO

**OBRIGATÓRIO:**
- ✅ `schema.ts` é a única fonte de verdade para estrutura do DB
- ✅ Todas as tabelas, colunas e relações são definidas aqui
- ✅ Schema evolui via código, não via DB
- ✅ Migrations são geradas a partir do schema, não o contrário

**PROIBIDO:**
- ❌ Usar introspect para gerar schema.ts automaticamente
- ❌ Sobrescrever schema.ts com schema do DB
- ❌ Modificar DB diretamente sem migration
- ❌ Deixar Drizzle inferir mudanças automaticamente

### 2. EVOLUÇÃO DO SCHEMA

**PERMITIDO:**
- ✅ Adicionar novas tabelas
- ✅ Adicionar novas colunas
- ✅ Modificar tipos de colunas (com migration)
- ✅ Adicionar índices
- ✅ Adicionar relações
- ✅ Remover colunas (com migration)
- ✅ Remover tabelas (com migration)

**PROIBIDO:**
- ❌ Renomear tabelas sem migration explícita
- ❌ Renomear colunas sem migration explícita
- ❌ Deixar Drizzle inferir renames automaticamente
- ❌ Alterar schema em produção sem migration

### 3. RELAÇÃO COM MIGRATIONS

**FLUXO:**
```
schema.ts (alteração)
    ↓
drizzle generate (wrapper controlado)
    ↓
migration SQL (nomeada)
    ↓
revisão manual
    ↓
aplicação no DB
```

**REGRA:**
- Schema é source of truth
- Migrations são derivadas do schema
- DB é resultado das migrations
- Nunca o contrário

---

## ARQUITETURA

```
drizzle/
├── schema.ts              # CONTRATO DE DOMÍNIO (source of truth)
├── migrations/           # MIGRATIONS CONTROLADAS
│   ├── 0001_*.sql
│   ├── 0002_*.sql
│   └── ...
├── meta/
│   ├── _journal.json      # JOURNAL DE MIGRATIONS
│   └── *.json
└── config.ts             # CONFIGURAÇÃO DO DRIZZLE
```

---

## VALIDAÇÃO

### 1. CONSISTÊNCIA

**O que verificar:**
- schema.ts existe
- meta/_journal.json existe
- migrations estão numeradas corretamente
- migrations não estão vazias sem explicação

### 2. INTEGRIDADE

**O que verificar:**
- schema.ts não foi sobrescrito por introspect
- migrations são lineares (sem branches)
- migrations não têm conflitos
- migrations são aplicáveis em ordem

### 3. SEGURANÇA

**O que verificar:**
- Não há migrations vazias
- Não há migrations duplicadas
- Não há migrations sem nome
- Não há migrations sem revisão

---

## EXEMPLOS

### ADICIONAR TABELA

```typescript
// drizzle/schema.ts
export const auditLogs = mysqlTable('audit_logs', {
  id: serial('id').primaryKey(),
  action: varchar('action', { length: 255 }).notNull(),
  userId: int('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});
```

```bash
# Gerar migration
pnpm db:generate

# Revisar SQL
# drizzle/migrations/0001_add_audit_logs.sql

# Aplicar migration
pnpm db:migrate
```

### ADICIONAR COLUNA

```typescript
// drizzle/schema.ts
export const users = mysqlTable('users', {
  // ... colunas existentes
  phone: varchar('phone', { length: 20 }), // NOVA COLUNA
});
```

```bash
# Gerar migration
pnpm db:generate

# Revisar SQL
# drizzle/migrations/0002_add_phone_to_users.sql

# Aplicar migration
pnpm db:migrate
```

### RENOMEAR TABELA (COM MIGRATION EXPLÍCITA)

```typescript
// drizzle/schema.ts
export const auditLogs = mysqlTable('audit_logs_new', { // NOVO NOME
  // ...
});
```

```sql
-- drizzle/migrations/0003_rename_audit_logs.sql
-- Migration manual explícita
ALTER TABLE audit_logs RENAME TO audit_logs_new;
```

---

## COMANDOS

### GERAR MIGRATION

```bash
# Wrapper controlado (non-interactive)
pnpm db:generate

# Ou diretamente
node scripts/db/drizzle-wrapper.mjs generate
```

### APLICAR MIGRATIONS

```bash
# Aplicar migrations pendentes
pnpm db:migrate

# Ou diretamente
node scripts/db/drizzle-wrapper.mjs migrate
```

### PUSH (DESENVOLVIMENTO APENAS)

```bash
# Push direto para DB (DEV apenas)
pnpm db:push

# CUIDADO: Não usar em produção
```

---

## REFERÊNCIA

- Schema: `drizzle/schema.ts`
- Pipeline: `drizzle/MIGRATION_PIPELINE.md`
- Wrapper: `scripts/db/drizzle-wrapper.mjs`
- Regras: `drizzle/SCHEMA_SOURCE_OF_TRUTH.md`

---

**ÚLTIMA ATUALIZAÇÃO**: 2026-04-26
**STATUS**: ✅ ATIVO E OBRIGATÓRIO
**VERSÃO**: 1.0.0
