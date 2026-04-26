# EVOLUTION RULES

## PROPÓSITO
Definir o que é permitido e proibido na evolução do sistema ERP.

## PRINCÍPIO FUNDAMENTAL
**Evolução do sistema deve ser livre, mas infraestrutura deve ser controlada**

- Schema pode evoluir livremente
- Migrations são controladas
- DB nunca gera schema automaticamente
- Sistema é previsível, não rígido demais

---

## EVOLUÇÃO PERMITIDA LIVREMENTE

### 1. SCHEMA DESENVOLVIMENTO

**ADICIONAR:**
- ✅ Adicionar novas tabelas
- ✅ Adicionar novas colunas
- ✅ Adicionar índices
- ✅ Adicionar relações (foreign keys)
- ✅ Adicionar constraints
- ✅ Adicionar enums

**ALTERAR:**
- ✅ Alterar tipos de colunas (com migration)
- ✅ Alterar nullability (com migration)
- ✅ Alterar default values (com migration)
- ✅ Alterar comprimento de varchar (com migration)

**REMOVER:**
- ✅ Remover colunas (com migration)
- ✅ Remover tabelas (com migration)
- ✅ Remover índices (com migration)
- ✅ Remover relações (com migration)

**EXEMPLO:**
```typescript
// drizzle/schema.ts
export const auditLogs = mysqlTable('audit_logs', {
  id: serial('id').primaryKey(),
  action: varchar('action', { length: 255 }).notNull(),
  userId: int('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 2. SERVIÇOS

**ADICIONAR:**
- ✅ Criar novos services
- ✅ Adicionar novos métodos em services
- ✅ Adicionar novas abstrações
- ✅ Adicionar novos helpers

**ALTERAR:**
- ✅ Modificar lógica de negócio
- ✅ Refatorar código
- ✅ Otimizar performance
- ✅ Melhorar error handling

**REMOVER:**
- ✅ Remover services não utilizados
- ✅ Remover métodos obsoletos
- ✅ Limpar código morto

### 3. LEO AI

**ADICIONAR:**
- ✅ Criar novos tools do LEO
- ✅ Adicionar novas features de LEO
- ✅ Adicionar novos modelos de learning
- ✅ Adicionar novas integrações

**ALTERAR:**
- ✅ Evoluir learning engine
- ✅ Modificar prompts
- ✅ Ajustar parâmetros
- ✅ Melhorar accuracy

**REMOVER:**
- ✅ Remover tools não utilizados
- ✅ Remover features obsoletas

### 4. DASHBOARDS E UI

**ADICIONAR:**
- ✅ Criar novos dashboards
- ✅ Adicionar novas páginas
- ✅ Adicionar novos componentes
- ✅ Adicionar novas visualizações

**ALTERAR:**
- ✅ Modificar layouts
- ✅ Alterar cores e estilos
- ✅ Melhorar UX
- ✅ Ajustar responsividade

**REMOVER:**
- ✅ Remover dashboards não utilizados
- ✅ Remover páginas obsoletas

### 5. MONITORING E ANALYTICS

**ADICIONAR:**
- ✅ Adicionar novos monitores
- ✅ Adicionar novos alerts
- ✅ Adicionar novos logs
- ✅ Adicionar novas métricas

**ALTERAR:**
- ✅ Ajustar thresholds
- ✅ Modificar alertas
- ✅ Melhorar dashboards de monitoring

**REMOVER:**
- ✅ Remover monitores não utilizados
- ✅ Remover alerts obsoletos

---

## EVOLUÇÃO PROIBIDA

### 1. INFRAESTRUTURA CRÍTICA

**PROIBIDO:**
- ❌ Introspect automático em produção
- ❌ Renames inferidos pelo Drizzle
- ❌ Schema gerado a partir do DB
- ❌ DB alterando schema.ts
- ❌ Sobrescrever schema.ts automaticamente

**RAZÃO:**
- Schema.ts é source of truth
- DB é resultado das migrations
- Nunca o contrário

### 2. MIGRATIONS

**PROIBIDO:**
- ❌ Migration aplicada sem revisão
- ❌ Migration vazia sem explicação
- ❌ Migration duplicada
- ❌ Migration sem nome
- ❌ Migration sobrescrita
- ❌ Migration aplicada fora de ordem

**RAZÃO:**
- Migrations devem ser auditáveis
- Migrations devem ser lineares
- Migrations devem ser previsíveis

### 3. CORE DE EXECUÇÃO

**PROIBIDO:**
- ❌ Alterar core de execução sem revisão
- ❌ Modificar bootstrap sem revisão
- ❌ Alterar arquitetura sem revisão
- ❌ Bypass de gates de segurança
- ❌ Remover ExecutionGate

**RAZÃO:**
- Core é crítico para estabilidade
- Alterações podem quebrar sistema
- Gates protegem contra regressões

### 4. DUPLICAÇÃO DE INFRA

**PROIBIDO:**
- ❌ Criar nova camada de Redis
- ❌ Criar nova camada de MySQL
- ❌ Criar novo registry
- ❌ Criar novo sistema de filas
- ❌ Criar novo sistema de cache

**RAZÃO:**
- Duplicação cria confusão
- Duplicação aumenta manutenção
- Duplicação pode causar bugs

### 5. NOVOS GATES PARALELOS

**PROIBIDO:**
- ❌ Criar gates paralelos ao ExecutionGate
- ❌ Criar validações duplicadas
- ❌ Bypass de gates existentes
- ❌ Desabilitar gates de segurança

**RAZÃO:**
- Gates devem ser centralizados
- Gates duplicados criam confusão
- Gates protegem contra regressões

---

## PROCESSO DE EVOLUÇÃO

### 1. PARA MUDANÇAS DE SCHEMA

**PASSO 1:** Alterar schema.ts
```typescript
// drizzle/schema.ts
export const users = mysqlTable('users', {
  // ... colunas existentes
  phone: varchar('phone', { length: 20 }), // NOVA COLUNA
});
```

**PASSO 2:** Gerar migration
```bash
pnpm db:generate
```

**PASSO 3:** Revisar SQL
```sql
-- drizzle/migrations/0001_add_phone_to_users.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
```

**PASSO 4:** Aplicar migration
```bash
pnpm db:migrate
```

**PASSO 5:** Validar
```bash
npx tsc --noEmit
pnpm verify:base
```

### 2. PARA MUDANÇAS DE SERVIÇOS

**PASSO 1:** Alterar service
```typescript
// server/services/users.service.ts
export async function getUserWithPhone(id: number) {
  // ... nova lógica
}
```

**PASSO 2:** Testar
```bash
pnpm test
```

**PASSO 3:** Validar
```bash
npx tsc --noEmit
pnpm verify:base
```

### 3. PARA MUDANÇAS DE LEO

**PASSO 1:** Alterar tool
```typescript
// server/tools/learning-sales.tool.ts
export async function getMetrics(tenantId: string) {
  // ... nova lógica
}
```

**PASSO 2:** Testar
```bash
pnpm test:leo
```

**PASSO 3:** Validar
```bash
npx tsc --noEmit
pnpm verify:base
```

---

## CRITÉRIOS DE SUCESSO

- ✅ Schema evolui sem travar sistema
- ✅ Services evoluem livremente
- ✅ LEO evolui livremente
- ✅ Dashboards/UI evoluem livremente
- ✅ Monitoring evolui livremente
- ✅ Infraestrutura permanece controlada
- ✅ Migrations são previsíveis
- ✅ Zero prompts interativos
- ✅ Zero inferência de rename

---

## CRITÉRIOS DE FALHA

- ❌ Schema sobrescrito por introspect
- ❌ Rename automático do Drizzle
- ❌ Migration aplicada sem revisão
- ❌ Bloqueio de evolução do sistema
- ❌ Core de execução alterado sem revisão
- ❌ Duplicação de infraestrutura
- ❌ Gates de segurança bypassados

---

## REFERÊNCIA

- Schema: `drizzle/schema.ts`
- Source of Truth: `drizzle/SCHEMA_SOURCE_OF_TRUTH.md`
- Pipeline: `drizzle/MIGRATION_PIPELINE.md`
- Infra Rules: `server/_core/env/INFRA_RULES.md`

---

**ÚLTIMA ATUALIZAÇÃO**: 2026-04-26
**STATUS**: ✅ ATIVO E OBRIGATÓRIO
**VERSÃO**: 1.0.0
