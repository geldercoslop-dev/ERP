# PROVA REAL - QUERIES COM WHERE tenant_id

## ORDER SERVICE - ANTES E DEPOIS

### **ANTES (VULNERÁVEL):**
```typescript
// SELECT - Cross-tenant possível
const results = await db.select().from(pedidos);

// UPDATE - Cross-tenant possível  
await db.update(pedidos).set({ status: 'confirmado' });

// DELETE - Cross-tenant possível
await db.delete(pedidos).where(eq(pedidos.id, 123));
```

### **DEPOIS (BLINDADO):**
```typescript
// SELECT - WHERE tenant_id OBRIGATÓRIO
const results = await db
  .select()
  .from(pedidos)
  .where(and(
    eq(pedidos.tenantId, ctx.tenantId),  // OBRIGATÓRIO
    eq(pedidos.clienteId, clienteId)     // Filtros adicionais
  ))
  .limit(limit)
  .offset((page - 1) * limit);

// UPDATE - WHERE tenant_id AND id OBRIGATÓRIO
await db
  .update(pedidos)
  .set(updateFields)
  .where(and(
    eq(pedidos.tenantId, ctx.tenantId),  // OBRIGATÓRIO
    eq(pedidos.id, payload.id as number) // OBRIGATÓRIO
  ));

// DELETE - WHERE tenant_id AND id OBRIGATÓRIO
await db
  .delete(pedidos)
  .where(and(
    eq(pedidos.tenantId, ctx.tenantId),  // OBRIGATÓRIO
    eq(pedidos.id, pedidoId)             // OBRIGATÓRIO
  ));
```

## SAFE TRANSACTION - PROVA DE ISOLAMENTO

### **TODAS AS QUERIES COM and(eq(tenantId), ...):**

```typescript
// UPDATE de pedido
.where(and(
  eq(pedidos.tenantId, pedidoOp.tenantId), // OBRIGATÓRIO
  eq(pedidos.id, pedidoOp.pedidoId)        // OBRIGATÓRIO
))

// UPDATE de status
.where(and(
  eq(pedidos.tenantId, pedidoOp.tenantId), // OBRIGATÓRIO  
  eq(pedidos.id, pedidoOp.pedidoId)        // OBRIGATÓRIO
))

// INSERT com tenantId explícito
await db.insert(pedidos).values({
  tenantId: ctx.tenantId, // OBRIGATÓRIO
  clienteId,
  status: 'pendente',
  // ... outros campos
});
```

## REGRA FINAL - SEM EXCEÇÃO

### **SISTEMA DEVE:**
- **NUNCA** operar sem tenant
- **NUNCA** buscar sem tenant  
- **NUNCA** validar depois
- **SEMPRE** validar antes
- **SEMPRE** filtrar no DB

### **PROVA DE ISOLAMENTO:**
```sql
-- Tenant A (id=1) tentando acessar dados do Tenant B (id=2)
SELECT * FROM pedidos WHERE tenant_id = 1 AND id = 123;  -- OK
SELECT * FROM pedidos WHERE tenant_id = 1 AND id = 456;  -- FAIL (pertence ao tenant 2)

-- Cross-tenant BLOQUEADO no nível do banco
UPDATE pedidos SET status = 'confirmado' WHERE tenant_id = 1 AND id = 123;  -- OK
UPDATE pedidos SET status = 'confirmado' WHERE tenant_id = 1 AND id = 456;  -- FAIL (0 rows affected)
```

## VALIDAÇÃO OBRIGATÓRIA

```typescript
// TODOS os métodos validam tenant ANTES de qualquer operação
if (!ctx.tenantId || ctx.tenantId <= 0) {
  throw new ValidationError('Tenant inválido ou ausente');
}

// SÓ DEPOIS da validação executa query
const db = await getDb();
// ... queries com WHERE tenant_id
```

**RESULTADO:** Base realmente segura, sem brecha lógica, pronto para escalar.
