# BASE + INFRA ARCHITECTURE v1.0

**STATUS**: STABLE - FROZEN ARCHITECTURE
**VERSION**: 1.0
**DATE**: 2026-04-25

---

## PURPOSE

Este documento define a arquitetura de validação e proteção da BASE + INFRA do ERP como padrão imutável.

**PRINCÍPIOS ABSOLUTOS**:
- NÃO refatorar sistema
- NÃO alterar schema
- NÃO alterar lógica de negócio
- SOMENTE blindagem preventiva e validação de integridade

---

## RESPONSIBILITY MATRIX

### 1. TypeScript (Compile-Time Layer)

**RESPONSABILIDADE**: Tipos estruturais

**O QUE FAZ**:
- Define tipos de dados
- Valida contracts em compile-time
- Garante type safety estático

**O QUE NÃO FAZ**:
- NÃO duplicar validações em runtime
- NÃO substituir validações de boundary

**ARQUIVOS**:
- `drizzle/schema.ts` - Schema de banco
- `server/types/*.ts` - Tipos de domínio
- `tsconfig.*.json` - Configuração TypeScript

---

### 2. type-guards.ts (Utility Layer)

**RESPONSABILIDADE**: Conversões e type narrowing básico

**O QUE FAZ**:
- Type guards básicos: `isString()`, `isNumber()`, `isBoolean()`, `isRecord()`, `isArray()`
- Conversões específicas: `toISODateString()`, `booleanToTinyint()`, `fromISODateString()`, `tinyintToBoolean()`
- Asserts específicos: `assertISODateString()`, `assertTinyint()`, `assertValidId()`
- Helpers: `safeString()`, `safeNumber()`, `safeGet()`, `createResponse()`

**O QUE NÃO FAZ**:
- NÃO validar negócio
- NÃO validar input externo
- NÃO duplicar validações de outras camadas

**ARQUIVO**: `server/_core/type-guards.ts`

---

### 3. validators.ts (Boundary Validation Layer)

**RESPONSABILIDADE**: Validação de input externo (API boundary)

**O QUE FAZ**:
- Validadores de negócio: `validatePayload()`, `validateMotivo()`, `validateMetadata()`, `validateId()`, `validatePagination()`, `validateCacheOptions()`, `validateFileName()`
- Sanitização: `sanitizeString()`
- Type guards específicos de negócio: `isNonEmptyString()`, `isPositiveNumber()`, `isInteger()`, `isPositiveInteger()`, `isEmail()`, `isUrl()`, `isDate()`, `isDateString()`
- Re-exporta type guards básicos (backward compatibility)

**O QUE NÃO FAZ**:
- NÃO duplicar type guards básicos (importa de type-guards.ts)
- NÃO validar schema
- NÃO validar consistência de banco

**ARQUIVO**: `server/_core/validators.ts`

---

### 4. service-guard.ts (Service Orchestration Layer)

**RESPONSABILIDADE**: Orquestração leve de validação

**O QUE FAZ**:
- Orquestra validação de schema-contract
- Conversões de tipo: `prepareInsertData()`, `prepareUpdateData()`
- Helpers: `guardInsert()`, `guardUpdate()`, `guardFieldExists()`
- Validação de campos existentes no schema

**O QUE NÃO FAZ**:
- NÃO validar tipos (garantido por TypeScript + prepareData)
- NÃO duplicar validações de type-guards
- NÃO validar boundary (responsabilidade de validators.ts)

**ARQUIVO**: `server/_core/service-guard.ts`

---

### 5. schema-contract.ts (Schema Validation Layer)

**RESPONSABILIDADE**: Validação estrutural schema vs uso

**O QUE FAZ**:
- Extrai metadados do schema: `extractSchemaMetadata()`
- Valida existência de campos: `fieldExistsInSchema()`, `getTableFields()`
- Valida dados contra schema: `validateInsertData()`, `validateUpdateData()`
- Asserts de schema: `assertFieldInSchema()`, `assertInsertDataValid()`, `assertUpdateDataValid()`
- Gera relatórios: `generateSchemaContractReport()`, `logSchemaContractReport()`

**O QUE NÃO FAZ**:
- NÃO validar tipos (responsabilidade de TypeScript)
- NÃO validar input externo (responsabilidade de validators.ts)
- NÃO validar DB (responsabilidade de schema-db-validator.ts)

**ARQUIVO**: `server/_core/schema-contract.ts`

---

### 6. bootstrap-guard.ts (Global Consistency Layer)

**RESPONSABILIDADE**: Consistência global (DB ↔ schema ↔ migrations)

**O QUE FAZ**:
- Orquestra validações de bootstrap
- Valida schema vs DB (via schema-db-validator)
- Valida schema contract (via schema-contract)
- Bloqueia startup em caso de drift crítico
- Health check para monitoramento

**O QUE NÃO FAZ**:
- NÃO validar dados de negócio
- NÃO validar input externo
- NÃO executar correções automáticas

**ARQUIVO**: `server/_core/bootstrap-guard.ts`

---

### 7. schema-db-validator.ts (DB Validation Layer)

**RESPONSABILIDADE**: Validação schema vs DB

**O QUE FAZ**:
- Extrai metadados do DB: `extractDBMetadata()`
- Compara schema com DB: `compareTableSchemaWithDB()`
- Detecta drift: campos faltando, type mismatches
- Gera relatórios: `generateSchemaDBValidationReport()`, `logSchemaDBValidationReport()`
- Asserts de sync: `assertSchemaInSyncWithDB()`

**O QUE NÃO FAZ**:
- NÃO executar correções automáticas
- NÃO validar lógica de negócio
- NÃO validar input externo

**ARQUIVO**: `server/_core/schema-db-validator.ts`

---

## VALIDATION PIPELINE

### Execution Order (Sequential)

1. **Schema Check** (schema-contract.ts)
   - Valida estrutura do schema
   - Detecta campos faltando
   - Falha se schema inválido

2. **Migration Check** (schema-db-validator.ts)
   - Valida schema vs DB
   - Detecta drift de estrutura
   - Falha se DB out of sync

3. **Service Usage Check** (service-guard.ts)
   - Valida campos usados em services
   - Detecta campos não existentes
   - Falha se field não existe

4. **Bootstrap Validation** (bootstrap-guard.ts)
   - Orquestra todas as validações
   - Bloqueia startup se qualquer etapa falhar
   - SEM fallback silencioso

### Failure Behavior

**QUALQUER FALHA → SISTEMA PARA IMEDIATAMENTE**

- NÃO fallback automático
- NÃO correção silenciosa
- NÃO warnings ignorados
- Bloqueio determinístico

---

## ANTI-DRIFT RULES

### Rule 1: Schema Field Addition

**REQUISITO**: Qualquer novo campo no schema deve ser refletido no service

**ENFORCEMENT**:
- service-guard valida campos usados em services
- Se service usa campo não existente → BLOQUEIO
- Se schema tem campo não usado → WARNING

**SEM CORREÇÃO AUTOMÁTICA**

---

### Rule 2: Migration Consistency

**REQUISITO**: Qualquer migration deve bater com journal

**ENFORCEMENT**:
- schema-db-validator compara schema vs DB
- Se drift detectado → BLOQUEIO
- Se migration sem journal → BLOQUEIO

**SEM CORREÇÃO AUTOMÁTICA**

---

### Rule 3: Schema Mismatch

**REQUISITO**: Qualquer schema mismatch deve falhar no bootstrap

**ENFORCEMENT**:
- bootstrap-guard executa todas as validações
- Se qualquer mismatch → BLOQUEIO
- Se type mismatch → BLOQUEIO

**SEM CORREÇÃO AUTOMÁTICA**

---

## CONFIGURATION

### Development Mode

```typescript
{
  enableRuntimeValidation: true,
  enableSchemaDBCheck: true,
  enableSchemaContractCheck: true,
  blockOnCriticalDrift: true,
  logViolations: true,
  throwOnViolation: true
}
```

**COMPORTAMENTO**:
- Runtime validation ativada
- Bloqueio em qualquer drift
- Throw em violações
- Logs detalhados

---

### Production Mode

```typescript
{
  enableRuntimeValidation: false,
  enableSchemaDBCheck: false,
  enableSchemaContractCheck: true,
  blockOnCriticalDrift: false,
  logViolations: true,
  throwOnViolation: false
}
```

**COMPORTAMENTO**:
- Runtime validation desativada (performance)
- Schema DB check desativado (performance)
- Schema contract check mantido (crítico)
- Não bloqueia produção (log apenas)
- Logs de warnings

---

## BACKWARD COMPATIBILITY

### Re-exports

**validators.ts** re-exporta type guards básicos de type-guards.ts:
- `isString`, `isNumber`, `isBoolean`, `isObject` (alias de `isRecord`), `isArray`

**MOTIVO**: Manter compatibilidade com código existente

**FUTURO**: Migrar imports para type-guards.ts gradualmente

---

## FUTURE CHANGES

### Allowed Changes

✅ Adicionar novos validadores de negócio em validators.ts
✅ Adicionar novas conversões em type-guards.ts
✅ Melhorar logging e relatórios
✅ Adicionar novos checks de integridade

### Forbidden Changes

❌ Alterar responsabilidades das camadas
❌ Introduzir validação duplicada
❌ Adicionar correção automática de schema
❌ Remover validações críticas
❌ Alterar ordem do validation pipeline

---

## VALIDATION CHECKLIST

### Before Deploying

- [ ] TypeScript compila sem erros
- [ ] Bootstrap checks passam
- [ ] Schema vs DB sync
- [ ] Schema contract valid
- [ ] Service guards passam
- [ ] Zero duplicação de validação
- [ ] Zero drift silencioso possível

---

## REFERENCES

### Related Files

- `server/_core/type-guards.ts` - Type guard utilities
- `server/_core/validators.ts` - Boundary validation
- `server/_core/service-guard.ts` - Service orchestration
- `server/_core/schema-contract.ts` - Schema validation
- `server/_core/schema-db-validator.ts` - DB validation
- `server/_core/bootstrap-guard.ts` - Bootstrap protection
- `drizzle/schema.ts` - Database schema definition
- `docs/TYPE-SAFETY-PATTERNS.md` - Type safety patterns

### Related Documentation

- `docs/TYPE-SAFETY-PATTERNS.md` - Patterns de type safety
- `docs/architecture/ARQUITETURA.md` - Arquitetura geral

---

## VERSION HISTORY

### v1.0 (2026-04-25)

- ✅ Definição inicial de responsabilidades
- ✅ Consolidação de type guards
- ✅ Remoção de duplicação
- ✅ Freeze de arquitetura
- ✅ Anti-drift enforcement

---

**STATUS**: STABLE - FROZEN ARCHITECTURE

**ALTERAÇÕES REQUEEREM APROVAÇÃO DE ARQUITETURA**
