# TypeScript Patterns - Type Guards vs Casts

## **PADRÃO OFICIAL - ELIMINAÇÃO DE CASTS**

### **OBJETIVO**
Eliminar completamente o uso de `as unknown as` e outros casts perigosos, substituindo por type guards e validação segura.

---

## **PROIBIDOS** 

### **1. Cast Duplo (as unknown as)**
```typescript
// NÃO FAZER ISSO
const data = result as unknown as MyType;
const pedidoOp = step.data as unknown as PedidoOperation;
```

### **2. Cast para any**
```typescript
// NÃO FAZER ISSO
const data = result as any;
const runner = tx as any;
```

### **3. Cast inseguro**
```typescript
// NÃO FAZER ISSO
const rows = result as Record<string, unknown>[];
```

---

## **PERMITIDOS** 

### **1. Type Guards**
```typescript
// FAZER ISSO
function isMyType(data: unknown): data is MyType {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  return typeof candidate.id === 'number' &&
         typeof candidate.name === 'string';
}

if (isMyType(data)) {
  // TypeScript sabe que 'data' é MyType aqui
  console.log(data.name); // Sem erro!
}
```

### **2. Conversões Explícitas**
```typescript
// FAZER ISSO
const id = Number(data.id);
const name = String(data.name);
const price = parseFloat(data.price);
```

### **3. Interfaces Explícitas**
```typescript
// FAZER ISSO
interface SqlRunner {
  execute: (query: string, params?: ReadonlyArray<unknown>) => Promise<[unknown, unknown]>;
}

const runner = tx as SqlRunner;
```

### **4. Helpers Específicos**
```typescript
// FAZER ISSO
const extractRows = (result: unknown): unknown[] | undefined => {
  if (!Array.isArray(result) || result.length === 0) return undefined;
  const first = result[0];
  return Array.isArray(first) ? first : undefined;
};
```

---

## **EXEMPLOS PRÁTICOS**

### **Query Drizzle**
```typescript
// ANTES (ruim)
const rows = (res as unknown as { rows?: unknown[] }).rows;

// DEPOIS (bom)
const extractRows = (result: unknown): unknown[] | undefined => {
  if (!result || typeof result !== 'object') return undefined;
  const candidate = result as { rows?: unknown };
  return Array.isArray(candidate.rows) ? candidate.rows : undefined;
};

const rows = extractRows(res);
```

### **Step.data de Transação**
```typescript
// ANTES (ruim)
const pedidoOp = step.data as unknown as PedidoOperation;

// DEPOIS (bom)
function isPedidoOperation(data: unknown): data is PedidoOperation {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  return typeof candidate.pedidoId === 'number' &&
         typeof candidate.acao === 'string' &&
         ['criar', 'atualizar', 'cancelar'].includes(candidate.acao);
}

if (!isPedidoOperation(step.data)) {
  throw new ValidationError(`Dados inválidos para operação de pedido`);
}
const pedidoOp = step.data;
```

### **Resultado MySQL**
```typescript
// ANTES (ruim)
const meta = (result as unknown as Record<string, unknown>).affectedRows;

// DEPOIS (bom)
const extractMetadata = (result: unknown): Record<string, unknown> => {
  if (!result) return {};
  const candidate = Array.isArray(result) ? result[0] : result;
  return candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
};

const meta = extractMetadata(result);
const affectedRows = typeof meta.affectedRows === 'number' ? meta.affectedRows : 0;
```

---

## **VALIDAÇÃO NA ORIGEM**

### **Respeitar Contratos do Schema**
```typescript
// Drizzle: decimal = string
// Correto:
const valor = String(input.valor); // Converte para string
const custo = String(input.custo);

// Errado:
const valor = input.valor as unknown as string; // Cast perigoso
```

### **Validar Antes de Usar**
```typescript
// Sempre validar dados externos
function isValidProdutoInput(data: unknown): data is ProdutoInput {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  return typeof candidate.nome === 'string' &&
         typeof candidate.valorVenda === 'number' &&
         typeof candidate.custo === 'number';
}

if (!isValidProdutoInput(input)) {
  throw new ValidationError('Dados de produto inválidos');
}
```

---

## **FERRAMENTAS DE BLINDAGEM**

### **1. Script de Verificação**
```bash
# Verificar se há "as unknown as"
node server/scripts/check-no-unknown-casts.mjs

# Verificar lint
node server/scripts/lint-check-server.mjs
```

### **2. Regras ESLint**
```javascript
// .eslintrc.cjs
{
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector: 'TSAsExpression[type.typeName.name="Unknown"]',
        message: 'Não use "as unknown as" - use type guards em vez disso'
      }
    ]
  }
}
```

---

## **CHECKLIST DE REVISÃO**

### **Antes de Commit:**
- [ ] Executar `node server/scripts/check-no-unknown-casts.mjs`
- [ ] Executar `node server/scripts/lint-check-server.mjs`
- [ ] Executar `npx tsc --noEmit -p tsconfig.server.json`
- [ ] Verificar se há casts novos no diff

### **Durante Code Review:**
- [ ] Procurar por `as unknown as`
- [ ] Procurar por `as any`
- [ ] Verificar se type guards são usados
- [ ] Validar que conversões são explícitas

---

## **REFERÊNCIAS RÁPIDAS**

### **Type Guards Comuns**
```typescript
// Para arrays
function isArrayOfType<T>(item: unknown, validator: (x: unknown) => x is T): item is T[] {
  return Array.isArray(item) && item.every(validator);
}

// Para objetos
function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return obj != null && typeof obj === 'object' && key in obj;
}

// Para strings
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

// Para números
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}
```

### **Helpers Úteis**
```typescript
// Extrair primeira linha de array
const getFirst = <T>(array: T[]): T | undefined => array[0];

// Extrair propriedade segura
const getProperty = <K extends string>(obj: unknown, key: K): unknown => {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<K, unknown>)[key];
  }
  return undefined;
};
```

---

## **CONCLUSÃO**

**Use type guards, não casts.**
**Valide dados, não confie no TypeScript.**
**Seja explícito, não implícito.**

Este padrão garante código mais seguro, manutenível e livre de regressões de tipo.
