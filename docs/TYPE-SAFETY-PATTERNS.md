# TYPE SAFETY & SCHEMA PROTECTION PATTERNS

## Overview

This document defines the official patterns for type safety, schema consistency, and anti-drift protection in the ERP system.

## Table of Contents

1. [Critical Type Patterns](#critical-type-patterns)
2. [Schema Contract Rules](#schema-contract-rules)
3. [Service Guard Rules](#service-guard-rules)
4. [Bootstrap Protection](#bootstrap-protection)
5. [Usage Examples](#usage-examples)

---

## Critical Type Patterns

### 1. Date Handling (ISO String Pattern)

**Rule:** All database timestamps must be ISO 8601 strings, not Date objects.

**Why:** Drizzle ORM uses `timestamp({ mode: 'string' })` which expects ISO strings.

**Pattern:**

```typescript
import { toISODateString, fromISODateString, isISODateString } from '../_core/type-guards.js';

// ✅ CORRECT: Convert Date to ISO string before DB operations
const createdAt = toISODateString(new Date());
await db.insert(pedidos).values({ createdAt });

// ✅ CORRECT: Convert ISO string back to Date for calculations
const row = await db.select().from(pedidos).where(eq(pedidos.id, id));
const dataEntrega = fromISODateString(row[0].dataEntrega);
if (dataEntrega) {
  const daysUntil = Math.ceil((dataEntrega.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ✅ CORRECT: Validate ISO string format
if (isISODateString(inputDate)) {
  // Safe to use
}

// ❌ WRONG: Direct Date object in DB operation
await db.insert(pedidos).values({ createdAt: new Date() }); // Type error

// ❌ WRONG: Date object in query condition
await db.select().from(pedidos).where(gte(pedidos.createdAt, new Date())); // Type error
```

**Available Functions:**

- `toISODateString(date: Date | string | null | undefined): string | null` - Convert to ISO string
- `fromISODateString(isoString: string | null | undefined): Date | null` - Convert from ISO string
- `isISODateString(v: unknown): v is string` - Type guard for ISO format
- `assertISODateString(v: unknown, context?: string): asserts v is string` - Runtime assertion

---

### 2. Boolean/Tinyint Pattern

**Rule:** Database boolean fields are stored as tinyint (0 or 1). Always use numbers for persistence.

**Why:** MySQL doesn't have a native boolean type; tinyint is the standard convention.

**Pattern:**

```typescript
import { booleanToTinyint, tinyintToBoolean, isTinyint } from '../_core/type-guards.js';

// ✅ CORRECT: Convert boolean to tinyint before DB operations
await db.insert(produtos).values({ 
  ativo: booleanToTinyint(true) // 1
});

// ✅ CORRECT: Convert tinyint to boolean for business logic
const produto = await db.select().from(produtos).where(eq(produtos.id, id));
const isActive = tinyintToBoolean(produto[0].ativo); // true if 1, false if 0

// ✅ CORRECT: Direct tinyint in DB operations
await db.update(produtos).set({ ativo: 1 }).where(eq(produtos.id, id));

// ❌ WRONG: Boolean in DB operation
await db.insert(produtos).values({ ativo: true }); // Type error

// ❌ WRONG: Boolean comparison with tinyint
if (produto.ativo === true) { ... } // Wrong type
```

**Available Functions:**

- `booleanToTinyint(value: boolean | number | null | undefined): 0 | 1` - Convert to tinyint
- `tinyintToBoolean(value: number | boolean | null | undefined): boolean` - Convert from tinyint
- `isTinyint(v: unknown): v is 0 | 1` - Type guard for tinyint
- `assertTinyint(v: unknown, context?: string): asserts v is 0 | 1` - Runtime assertion

---

### 3. ID Pattern

**Rule:** IDs must be positive integers or non-empty strings, matching schema definition.

**Pattern:**

```typescript
import { isValidId, assertValidId } from '../_core/type-guards.js';

// ✅ CORRECT: Validate ID before use
if (isValidId(inputId)) {
  await db.select().from(pedidos).where(eq(pedidos.id, inputId));
}

// ✅ CORRECT: Assert ID is valid
assertValidId(pedidoId, 'pedidoService.getPedido');

// ❌ WRONG: Using invalid ID
await db.select().from(pedidos).where(eq(pedidos.id, -1)); // Invalid
await db.select().from(pedidos).where(eq(pedidos.id, '')); // Invalid
```

**Available Functions:**

- `isValidId(v: unknown): v is number | string` - Type guard for valid IDs
- `assertValidId(v: unknown, context?: string): asserts v is number | string` - Runtime assertion

---

## Schema Contract Rules

### 1. Field Existence Validation

**Rule:** Never use fields that don't exist in the schema.

**Pattern:**

```typescript
import { 
  fieldExistsInSchema, 
  assertFieldInSchema,
  getTableFields 
} from '../_core/schema-contract.js';

// ✅ CORRECT: Check field exists before use
if (fieldExistsInSchema('produtos', 'descricao')) {
  // Safe to use
}

// ✅ CORRECT: Assert field exists (throws if not)
assertFieldInSchema('produtos', 'descricao', 'produtoService.create');

// ✅ CORRECT: Get all fields for a table
const fields = getTableFields('produtos');
console.log(fields); // ['id', 'tenantId', 'descricao', ...]

// ❌ WRONG: Using non-existent field
await db.insert(produtos).values({ valorVenda: 100 }); // Field doesn't exist
```

---

### 2. Insert/Update Validation

**Rule:** Validate data against schema before insert/update operations.

**Pattern:**

```typescript
import { 
  validateInsertData, 
  validateUpdateData,
  assertInsertDataValid,
  assertUpdateDataValid
} from '../_core/schema-contract.js';

// ✅ CORRECT: Validate insert data
const validation = validateInsertData('produtos', data);
if (!validation.valid) {
  throw new Error(`Invalid data: ${validation.violations.join(', ')}`);
}

// ✅ CORRECT: Assert insert data (throws if invalid)
assertInsertDataValid('produtos', data, 'produtoService.create');

// ✅ CORRECT: Validate update data
const updateValidation = validateUpdateData('produtos', updateData);
if (!updateValidation.valid) {
  throw new Error(`Invalid update: ${updateValidation.violations.join(', ')}`);
}

// ❌ WRONG: Inserting with non-existent fields
await db.insert(produtos).values({ 
  descricao: 'Produto',
  bloco: 'A' // Field doesn't exist in schema
});
```

---

## Service Guard Rules

### 1. Service-Level Validation

**Rule:** Use service guards to enforce schema compliance at service boundaries.

**Pattern:**

```typescript
import { 
  guardInsert, 
  guardUpdate, 
  guardFieldExists,
  prepareInsertData,
  prepareUpdateData
} from '../_core/service-guard.js';

// ✅ CORRECT: Guard insert operation
export async function createProduto(tenantId: number, data: ProdutoInput) {
  // Prepare data (convert Date to ISO, boolean to tinyint)
  const prepared = prepareInsertData(data);
  
  // Validate against schema
  guardInsert('produtoService', 'produtos', prepared);
  
  // Insert
  return await db.insert(produtos).values(prepared);
}

// ✅ CORRECT: Guard update operation
export async function updateProduto(id: number, data: Partial<ProdutoInput>) {
  const prepared = prepareUpdateData(data);
  guardUpdate('produtoService', 'produtos', prepared);
  
  return await db.update(produtos).set(prepared).where(eq(produtos.id, id));
}

// ✅ CORRECT: Guard field existence
export async function getProdutoByField(fieldName: string, value: unknown) {
  guardFieldExists('produtoService', 'produtos', fieldName, 'select');
  return await db.select().from(produtos).where(eq(produtos[fieldName], value));
}
```

---

### 2. Type Conversion Helpers

**Rule:** Always use prepared data helpers to ensure type safety.

**Pattern:**

```typescript
import { prepareInsertData, prepareUpdateData } from '../_core/service-guard.js';

// ✅ CORRECT: Prepare data handles all conversions
const rawData = {
  descricao: 'Produto',
  ativo: true, // Will be converted to 1
  createdAt: new Date(), // Will be converted to ISO string
};

const prepared = prepareInsertData(rawData);
// Result: { descricao: 'Produto', ativo: 1, createdAt: '2024-01-01T00:00:00.000Z' }

await db.insert(produtos).values(prepared);
```

---

## Bootstrap Protection

### 1. Anti-Drift Checks

**Rule:** Run bootstrap checks on application startup to detect schema drift.

**Pattern:**

```typescript
import { runBootstrapChecks, bootstrapHealthCheck } from '../_core/bootstrap-guard.js';

// ✅ CORRECT: Run checks during bootstrap
async function bootstrap() {
  try {
    const result = await runBootstrapChecks();
    
    if (!result.success) {
      console.error('Bootstrap checks failed:', result.criticalIssues);
      // Handle failure (block startup or continue with warnings)
    }
  } catch (error) {
    console.error('Bootstrap guard blocked startup:', error);
    throw error;
  }
}

// ✅ CORRECT: Health check for monitoring
async function healthCheck() {
  const isHealthy = await bootstrapHealthCheck();
  return { healthy: isHealthy };
}
```

---

### 2. Configuration

**Rule:** Configure bootstrap guard based on environment.

**Pattern:**

```typescript
import { BootstrapGuard } from '../_core/bootstrap-guard.js';

// Development: Block on drift
const devGuard = new BootstrapGuard({
  enableSchemaDBCheck: true,
  enableSchemaContractCheck: true,
  blockOnCriticalDrift: true,
  logWarnings: true,
});

// Production: Log warnings only
const prodGuard = new BootstrapGuard({
  enableSchemaDBCheck: false, // Skip DB check in production
  enableSchemaContractCheck: true,
  blockOnCriticalDrift: false, // Don't block production
  logWarnings: true,
});
```

---

## Usage Examples

### Complete Service Example

```typescript
import { db } from '../db/index.js';
import { produtos } from '../../drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { 
  prepareInsertData, 
  prepareUpdateData,
  guardInsert,
  guardUpdate
} from '../_core/service-guard.js';
import { toISODateString, fromISODateString } from '../_core/type-guards.js';

export async function createProduto(tenantId: number, data: ProdutoInput) {
  // Prepare data (convert types)
  const prepared = prepareInsertData({
    ...data,
    tenantId,
    createdAt: toISODateString(new Date()),
    updatedAt: toISODateString(new Date()),
  });
  
  // Validate against schema
  guardInsert('produtoService', 'produtos', prepared);
  
  // Insert
  const result = await db.insert(produtos).values(prepared);
  return result;
}

export async function getProduto(id: number) {
  const rows = await db.select().from(produtos).where(eq(produtos.id, id));
  if (rows.length === 0) return null;
  
  // Convert ISO strings back to Date for business logic
  return {
    ...rows[0],
    createdAt: fromISODateString(rows[0].createdAt),
    updatedAt: fromISODateString(rows[0].updatedAt),
  };
}

export async function updateProduto(id: number, data: Partial<ProdutoInput>) {
  const prepared = prepareUpdateData({
    ...data,
    updatedAt: toISODateString(new Date()),
  });
  
  guardUpdate('produtoService', 'produtos', prepared);
  
  return await db.update(produtos).set(prepared).where(eq(produtos.id, id));
}
```

---

## Summary of Patterns

| Pattern | Purpose | Location |
|---------|---------|----------|
| ISO String | Date handling | `server/_core/type-guards.ts` |
| Tinyint | Boolean handling | `server/_core/type-guards.ts` |
| ID Validation | ID type safety | `server/_core/type-guards.ts` |
| Schema Contract | Field existence | `server/_core/schema-contract.ts` |
| Schema DB Validator | Schema vs DB sync | `server/_core/schema-db-validator.ts` |
| Service Guard | Service-level validation | `server/_core/service-guard.ts` |
| Bootstrap Guard | Anti-drift at startup | `server/_core/bootstrap-guard.ts` |

---

## Quick Reference

### Type Conversions

```typescript
// Date ↔ ISO String
toISODateString(new Date()) // → '2024-01-01T00:00:00.000Z'
fromISODateString('2024-01-01T00:00:00.000Z') // → Date

// Boolean ↔ Tinyint
booleanToTinyint(true) // → 1
tinyintToBoolean(1) // → true
```

### Schema Validation

```typescript
// Field existence
fieldExistsInSchema('table', 'field') // → boolean
assertFieldInSchema('table', 'field') // → throws if not exists

// Data validation
validateInsertData('table', data) // → { valid, violations }
validateUpdateData('table', data) // → { valid, violations }
```

### Service Guards

```typescript
// Operation guards
guardInsert('service', 'table', data)
guardUpdate('service', 'table', data)
guardFieldExists('service', 'table', 'field')

// Data preparation
prepareInsertData(data) // → converts Date→ISO, boolean→tinyint
prepareUpdateData(data) // → converts Date→ISO, boolean→tinyint
```

### Bootstrap

```typescript
// Run checks
runBootstrapChecks() // → { success, criticalIssues }
bootstrapHealthCheck() // → boolean
```

---

## Enforcement

### Development Mode

- Runtime validation enabled
- Type assertions enabled
- Throws on violations
- Blocks startup on critical drift

### Production Mode

- Runtime validation disabled (performance)
- Type assertions disabled
- Logs warnings only
- Does not block startup

---

## Migration Guide

### Existing Code

If you have existing code that doesn't follow these patterns:

1. **Date handling:**
   ```typescript
   // Before
   await db.insert(pedidos).values({ createdAt: new Date() });
   
   // After
   await db.insert(pedidos).values({ createdAt: toISODateString(new Date()) });
   ```

2. **Boolean handling:**
   ```typescript
   // Before
   await db.insert(produtos).values({ ativo: true });
   
   // After
   await db.insert(produtos).values({ ativo: booleanToTinyint(true) });
   ```

3. **Schema validation:**
   ```typescript
   // Before
   await db.insert(produtos).values(data);
   
   // After
   const prepared = prepareInsertData(data);
   guardInsert('service', 'produtos', prepared);
   await db.insert(produtos).values(prepared);
   ```

---

## Troubleshooting

### Type Errors

If you get type errors about Date vs string:

```typescript
// Error: Type 'Date' is not assignable to type 'string'
// Solution: Use toISODateString()
```

If you get type errors about boolean vs number:

```typescript
// Error: Type 'boolean' is not assignable to type 'number'
// Solution: Use booleanToTinyint()
```

### Schema Errors

If you get errors about non-existent fields:

```typescript
// Error: Field 'xyz' does not exist in schema
// Solution: Check schema.ts for correct field name
// Or remove the field from insert/update
```

### Bootstrap Errors

If bootstrap guard blocks startup:

```typescript
// Error: Schema vs DB drift detected
// Solution: 
// 1. Run migrations to sync DB
// 2. Update schema.ts to match DB
// 3. Or disable blockOnCriticalDrift in production
```

---

## Best Practices

1. **Always use type converters** - Don't manually convert types
2. **Validate before insert/update** - Use service guards
3. **Check field existence** - Use schema contract functions
4. **Run bootstrap checks** - Enable in development
5. **Log violations** - Keep logs for debugging
6. **Test type safety** - TypeScript compilation should pass

---

## Related Files

- `server/_core/type-guards.ts` - Type guard utilities
- `server/_core/schema-contract.ts` - Schema validation
- `server/_core/schema-db-validator.ts` - Schema vs DB validation
- `server/_core/service-guard.ts` - Service-level guards
- `server/_core/bootstrap-guard.ts` - Bootstrap protection
- `drizzle/schema.ts` - Database schema definition
