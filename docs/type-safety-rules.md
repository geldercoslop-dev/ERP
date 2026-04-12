# Type Safety Rules - SHIELD

## **SHIELD ATIVO - Proteção Contra Regressão de Tipos**

Este documento define as regras de type safety do projeto ERP. O SHIELD foi implementado para impedir regressão de padrões perigosos.

---

## **REGRAS OBRIGATÓRIAS**

### **PROIBIDO - NUNCA USE**

#### **1. Cast Duplo Perigoso**
```typescript
// NÃO FAÇER ISSO
const data = result as unknown as MyType;
const pedido = step.data as unknown as PedidoOperation;
```

#### **2. Cast para Any**
```typescript
// NÃO FAÇER ISSO
const data = result as any;
const runner = tx as any;
```

#### **3. Unknown Type Reference**
```typescript
// NÃO FAÇER ISSO
function execute(query: string): Promise<unknown>;
const runner: { execute: (q: string) => Promise<unknown> };
```

---

## **PERMITIDO - SEMPRE USE**

### **1. Type Guards**
```typescript
// FAÇA ISSO
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

### **2. Interfaces Semânticas**
```typescript
// FAÇA ISSO
interface TracedError extends Error {
  traceId?: string;
}

if (isError(err)) {
  const tracedError = err as TracedError;
  tracedError.traceId = traceId;
}
```

### **3. Conversões Explícitas**
```typescript
// FAÇA ISSO
const id = Number(data.id);
const name = String(data.name);
const price = parseFloat(data.price);
```

### **4. Helpers Específicos**
```typescript
// FAÇA ISSO
const extractRows = (result: unknown): unknown[] | undefined => {
  if (!result || typeof result !== 'object') return undefined;
  const candidate = result as { rows?: unknown };
  return Array.isArray(candidate.rows) ? candidate.rows : undefined;
};
```

---

## **REGRA DE OURO**

> **"Se precisar de cast, corrija o tipo na origem"**

Qualquer necessidade de `as unknown as` indica um problema de tipagem que deve ser resolvido na fonte, não mascarado com cast.

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

## **SHIELD - FERRAMENTAS DE PROTEÇÃO**

### **1. Detector Automático**
```bash
# Verificar se há casts perigosos
npm run shield:casts

# Validação completa
npm run shield
```

### **2. Regras ESLint**
O ESLint está configurado para bloquear automaticamente:
- `as unknown as`
- `as any`
- `<unknown>`

### **3. Pre-commit Hook**
O SHIELD é executado automaticamente em cada commit:
```bash
echo "Validando SHIELD de type safety..."
pnpm run shield
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

## **CHECKLIST DE DESENVOLVIMENTO**

### **Antes de Commit:**
- [ ] Executar `npm run shield`
- [ ] Verificar se há casts novos no diff
- [ ] Usar type guards para validação
- [ ] Corrigir tipos na origem

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

// Para Error
function isError(v: unknown): v is Error {
  return v instanceof Error;
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

## **ESTADO ATUAL DO PROJETO**

### **Baseline Protegido:**
- **Services críticos:** 0 ocorrências de `as unknown as`
- **TypeScript:** 100% verde
- **ESLint:** Regras hard ativas
- **SHIELD:** Proteção automática contra regressão

### **Ocorrências Restantes:**
- **_core/**: 5 ocorrências (boundary legítimo)
- **tests/**: 8 ocorrências (ignorar)
- **scripts/**: Várias ocorrências (infraestrutura)

---

## **CONCLUSÃO**

**Use type guards, não casts.**
**Valide dados, não confie no TypeScript.**
**Seja explícito, não implícito.**
**Corrija na origem, não mascare com cast.**

Este padrão garante código mais seguro, manutenível e livre de regressões de tipo.

**SHIELD ATIVO - PROTEÇÃO GARANTIDA.**
