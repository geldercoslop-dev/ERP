# MIGRATION PIPELINE

## PROPÓSITO
Definir pipeline controlado e determinístico de migrations do Drizzle.

## PRINCÍPIO FUNDAMENTAL
**Migrations são controladas, lineares e auditáveis**

- Sem inferência de rename automática
- Sem prompts interativos
- Sem modificação direta de DB sem migration
- Sistema previsível, não rígido demais

---

## PIPELINE PADRÃO

### PASSO 1: ALTERAR SCHEMA.TS

**O que fazer:**
- Modificar `drizzle/schema.ts`
- Adicionar/alterar tabelas, colunas, relações
- Não modificar DB diretamente

**Exemplo:**
```typescript
// drizzle/schema.ts
export const auditLogs = mysqlTable('audit_logs', {
  id: serial('id').primaryKey(),
  action: varchar('action', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### PASSO 2: GERAR MIGRATION

**Comando:**
```bash
pnpm db:generate
```

**O que acontece:**
- Wrapper controlado executa `drizzle-kit generate`
- Gera migration SQL nomeada
- Sem prompts interativos
- Sem inferência de rename

**Resultado:**
```
drizzle/migrations/0001_add_audit_logs.sql
```

### PASSO 3: REVISAR SQL MANUALMENTE

**O que verificar:**
- SQL está correto
- Não há comandos perigosos
- Migration não está vazia
- Nome da migration é descritivo

**Exemplo:**
```sql
-- drizzle/migrations/0001_add_audit_logs.sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### PASSO 4: APLICAR MIGRATION

**Comando:**
```bash
pnpm db:migrate
```

**O que acontece:**
- Migration é aplicada no DB
- Journal é atualizado
- DB fica sincronizado com schema

### PASSO 5: VALIDAR

**Comandos:**
```bash
npx tsc --noEmit
pnpm verify:base
```

**O que verificar:**
- TypeScript compila
- Infraestrutura está OK
- Não há regressões

---

## REGRAS DO PIPELINE

### 1. SEM INFERÊNCIA DE RENAME

**Proibido:**
- ❌ Deixar Drizzle inferir renames automaticamente
- ❌ Usar prompts de rename/create
- ❌ Permitir decisões automáticas do Drizzle

**Obrigatório:**
- ✅ RENAME deve ser feito via migration explícita
- ✅ SQL manual para renames
- ✅ Revisão manual de cada migration

### 2. SEM PROMPTS INTERATIVOS

**Proibido:**
- ❌ Prompts de rename/create
- ❌ Perguntas de confirmação
- ❌ Interação manual durante generate

**Obrigatório:**
- ✅ Wrapper controlado (drizzle-wrapper.mjs)
- ✅ Modo não-interativo
- ✅ Respostas automáticas determinísticas

### 3. SEM MODIFICAÇÃO DIRETA DE DB

**Proibido:**
- ❌ ALTER TABLE direto no DB
- ❌ CREATE TABLE direto no DB
- ❌ Modificar DB sem migration
- ❌ Usar ferramentas de DB externas

**Obrigatório:**
- ✅ Todas as mudanças via migration
- ✅ Migrations versionadas
- ✅ Migrations auditáveis

---

## EVOLUÇÃO DO SISTEMA

### PERMITIDO LIVREMENTE

**SCHEMA:**
- ✅ Adicionar tabelas
- ✅ Adicionar colunas
- ✅ Alterar tipos de colunas
- ✅ Adicionar índices
- ✅ Adicionar relações
- ✅ Remover colunas (com migration)
- ✅ Remover tabelas (com migration)

**SERVIÇOS:**
- ✅ Evoluir services
- ✅ Adicionar novos services
- ✅ Modificar lógica de negócio

**LEO:**
- ✅ Evoluir LEO AI
- ✅ Adicionar novos tools
- ✅ Modificar learning engine

**DASHBOARDS/UI:**
- ✅ Criar dashboards
- ✅ Modificar UI
- ✅ Adicionar features de UX

### PROIBIDO

**INFRAESTRUTURA:**
- ❌ Introspect automático em produção
- ❌ Renames inferidos pelo Drizzle
- ❌ Schema gerado a partir do DB
- ❌ DB alterando schema.ts

**MIGRATIONS:**
- ❌ Migration aplicada sem revisão
- ❌ Migration vazia sem explicação
- ❌ Migration duplicada
- ❌ Migration sem nome

---

## SEGURANÇA DE MIGRATION

### 1. NOME ÚNICO

**Regra:**
- Cada migration deve ter nome único
- Nome deve ser descritivo
- Formato: `NNNN_descriptive_name.sql`

**Exemplo:**
```
0001_add_audit_logs.sql
0002_add_phone_to_users.sql
0003_rename_audit_logs_to_audit_logs_new.sql
```

### 2. AUDITÁVEL

**Regra:**
- Cada migration deve ser auditável
- SQL deve ser legível
- Migration deve ter comentário explicativo

**Exemplo:**
```sql
-- Migration: Add audit logs table
-- Date: 2026-04-26
-- Author: [nome]
-- Description: Add audit logs table for tracking user actions

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. NÃO VAZIA SEM EXPLICAÇÃO

**Regra:**
- Migration vazia deve ter explicação
- Ou deve ser deletada
- Ou deve ser marcada como NOOP

**Exemplo:**
```sql
-- Migration: NOOP - Schema already in sync
-- Date: 2026-04-26
-- Description: No changes needed, schema already matches DB

-- This migration is intentionally empty
```

### 4. NÃO SOBRESCRITA AUTOMATICAMENTE

**Regra:**
- Migration nunca deve ser sobrescrita
- Cada migration é imutável
- Se houver erro, criar nova migration

---

## VALIDAÇÃO PÓS-MIGRATION

### 1. TYPESCRIPT

```bash
npx tsc --noEmit
```

**O que verificar:**
- TypeScript compila sem erros
- Não há tipos quebrados
- Schema types estão corretos

### 2. VERIFY:BASE

```bash
pnpm verify:base
```

**O que verificar:**
- Phase 0 Guard passa
- TypeScript passa
- Redis/MySQL validações passam
- Não há regressões

### 3. DB:GENERATE

```bash
pnpm db:generate
```

**O que verificar:**
- Nova migration é gerada corretamente
- Não há prompts interativos
- Migration não está vazia sem motivo

---

## CRITÉRIOS DE SUCESSO

- ✅ Migrations sempre previsíveis
- ✅ Schema evolui sem travar sistema
- ✅ Zero prompts interativos
- ✅ Zero inferência de rename
- ✅ DB sempre controlado via migration
- ✅ Evolução do ERP não é bloqueada

---

## CRITÉRIOS DE FALHA

- ❌ Schema sobrescrito por introspect
- ❌ Rename automático do Drizzle
- ❌ Migration aplicada sem revisão
- ❌ Bloqueio de evolução do sistema

---

## REFERÊNCIA

- Schema: `drizzle/schema.ts`
- Source of Truth: `drizzle/SCHEMA_SOURCE_OF_TRUTH.md`
- Wrapper: `scripts/db/drizzle-wrapper.mjs`
- Regras: `drizzle/MIGRATION_PIPELINE.md`

---

**ÚLTIMA ATUALIZAÇÃO**: 2026-04-26
**STATUS**: ✅ ATIVO E OBRIGATÓRIO
**VERSÃO**: 1.0.0
