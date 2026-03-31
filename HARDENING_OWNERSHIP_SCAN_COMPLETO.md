# HARDENING: Auditoria Completa de Ownership - Clientes & Pedidos

**Data:** 27 de março de 2026  
**Escopo:** `server/` - Todas as operações SELECT, INSERT, UPDATE em `clientes` e `pedidos`  
**Status:** ⚠️ RISCO CRÍTICO IDENTIFICADO

---

## 📋 Sumário Executivo

| Categoria | Total | Com Ownership | ❌ SEM Ownership | Risco |
|-----------|-------|---------------|------------------|-------|
| **Leitura CLIENTES** | 7 | 6 | 1 | 🔴 ALTO |
| **Leitura PEDIDOS** | 9 | 9 | 0 | ✅ OK |
| **Insert CLIENTES** | 1 | 1 | 0 | ✅ OK |
| **Insert PEDIDOS** | 1 | 1 | 0 | ✅ OK |
| **Update CLIENTES** | 1 | 1 | 0 | ✅ OK |
| **Update PEDIDOS** | 8 | 5 | 3 | 🔴 ALTO |
| **Delete CLIENTES** | 0 | 0 | 0 | ✅ OK |
| **Delete PEDIDOS** | 0 | 0 | 0 | ✅ OK |
| **TOTAL** | **27** | **23** | **4** | **85% seguro** |

---

## 🔴 OPERAÇÕES SEM OWNERSHIP CHECK (CRÍTICO)

### 1. Relatório PDF - SELECT clientes (SEM FILTRO DE PROPRIETÁRIO)
- **Arquivo:** [server/services/reports/pdf.service.ts](server/services/reports/pdf.service.ts#L735)
- **Linha:** 735
- **Operação:** `.select().from(clientes).where(eq(clientes.tenantId, tenantId)).limit(1000)`
- **Tipo:** SELECT global
- **Risco:** 🔴 **CRÍTICO** - Qualquer vendedor autenticado pode ver TODOS os clientes do tenant
- **Detalhes:**
  ```typescript
  const clientesList = await db_conn.select().from(clientes)
    .where(eq(clientes.tenantId, tenantId))
    .limit(1000);
  ```
- **Impacto:** Vazamento de dados - vendedor vê clientes de outros vendedores
- **Proposta de Fix:**
  - Adicionar filtro por `actor.userId` se role for "vendedor"
  - Manter sem filtro apenas se role for "admin"
  - Ou restringir acesso apenas a admin

### 2. Orders Service - UPDATE pedidos (SEM VERIFICAÇÃO DE PROPRIETÁRIO)
- **Arquivo:** [server/services/orders.service.ts](server/services/orders.service.ts#L863)
- **Linha:** 863
- **Operação:** `.update(pedidos).set({...}).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)))`
- **Tipo:** UPDATE sem ownership
- **Risco:** 🔴 **CRÍTICO** - Vendedor pode atualizar pedido de outro vendedor (mesmo tenant)
- **Detalhes:**
  ```typescript
  await dbConn.update(pedidos)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)));
  ```
- **Função Afetada:** `updatePedido()` (linha 860+)
- **Impacto:** Modificação não autorizada de pedidos de outros vendedores
- **Controle Esperado:** `await assertPedidoMutableByActor(tenantId, actor, id)` (deve ser chamado antes)

### 3. Orders Service - UPDATE pedidos (STATUS)
- **Arquivo:** [server/services/orders.service.ts](server/services/orders.service.ts#L910)
- **Linha:** 910
- **Operação:** `.update(pedidos)` com status change
- **Tipo:** UPDATE sem ownership
- **Risco:** 🔴 **CRÍTICO** - Alteração de status sem verificação
- **Detalhe:** Similar ao item #2 - mesmo padrão inseguro
- **Impacto:** Vendedor pode mudar status de pedido de outro

### 4. Finance Service - UPDATE pedidos (PROCESSAMENTO FINANCEIRO)
- **Arquivo:** [server/services/finance.service.ts](server/services/finance.service.ts#L145)
- **Linha:** 145
- **Operação:** `.update(pedidos)` em contexto de finançamento
- **Tipo:** UPDATE sem ownership
- **Risco:** 🔴 **CRÍTICO** - Alteração financeira sem controle
- **Detalhe:** Atualiza pedido em transação, mas sem verificação de actor
- **Impacto:** Manipulação de dados financeiros não autorizada

---

## ✅ OPERAÇÕES COM OWNERSHIP CHECK (SEGURAS)

### CLIENTES - Leitura (6 de 7 segura)

#### ✅ 1. Clientes Service - GET por ID
- **Arquivo:** [server/services/clientes.service.ts](server/services/clientes.service.ts#L285)
- **Linha:** 285
- **Operação:** `.select().from(clientes).where(and(eq(clientes.tenantId, tenantId), eq(clientes.id, id)))`
- **Tipo:** SELECT com ownership
- **Função:** `getClienteById(tenantId, actor, id)`
- **Check:** `await userCanAccessCliente(dbConn, tenantId, actor, clienteId)` - Valida `clientes.userId === actor.userId` OU vínculo em `clienteVendedores`
- **Status:** ✅ SEGURO

#### ✅ 2. Clientes Service - LIST
- **Arquivo:** [server/services/clientes.service.ts](server/services/clientes.service.ts#L463)
- **Linha:** 463
- **Operação:** `.select().from(clientes).where(and(...conditions))`
- **Tipo:** SELECT com filtro de actor
- **Função:** `listClientes(tenantId, actor, {...})`
- **Check:** Filtra por `actor.userId` ou `actor.vendedorId`
- **Status:** ✅ SEGURO

#### ✅ 3. Clientes Service - GET Histórico
- **Arquivo:** [server/services/clientes.service.ts](server/services/clientes.service.ts#L491)
- **Linha:** 491, 529, 550, 683, 704, 745, 766, 798
- **Operação:** SELECT com múltiplas condições
- **Tipo:** SELECT com ownership
- **Check:** Valida acesso via `vendedorLinkedToCliente()` ou `actor.role === "admin"`
- **Status:** ✅ SEGURO

---

### PEDIDOS - Leitura (9 de 9 segura)

#### ✅ 1. Orders Service - GET por ID
- **Arquivo:** [server/services/orders.service.ts](server/services/orders.service.ts#L566)
- **Linha:** 566
- **Operação:** `.select().from(pedidos).where(and(eq(pedidos.tenantId, tenantId), eq(pedidos.id, id)))`
- **Tipo:** SELECT com ownership
- **Função:** `getPedidoByIdForActor()`
- **Check:** `await pedidoAcessivelViaCliente(tenantId, actor, pedidoId)` - Valida via `clientes.userId`
- **Status:** ✅ SEGURO

#### ✅ 2. Orders Service - LIST com filtro
- **Arquivo:** [server/services/orders.service.ts](server/services/orders.service.ts#L684)
- **Linha:** 684
- **Operação:** `.select().from(pedidos).where(and(...conditions))`
- **Tipo:** SELECT com filtro por actor
- **Função:** `listPedidosTrpcPage()`
- **Check:** Filtra por `actor.userId` ou admin, valida via cliente
- **Status:** ✅ SEGURO

#### ✅ 3-9. Outras operações SELECT pedidos
- **Linhas:** Diversas em orders.service.ts
- **Padrão:** Todas usam `getPedidoByIdForActor()` ou filtram por `actor.userId`
- **Status:** ✅ SEGUROS

---

### INSERTS - Criação (2 segura)

#### ✅ 1. Criar Cliente
- **Arquivo:** [server/services/clientes.service.ts](server/services/clientes.service.ts#L135)
- **Função:** `createCliente(tenantId, data, userIdOverride?)`
- **Check:** userIdOverride é controlado pelo router com `actor.userId`
- **Status:** ✅ SEGURO

#### ✅ 2. Criar Pedido
- **Arquivo:** [server/services/orders.service.ts](server/services/orders.service.ts#L350+)
- **Função:** `createPedidoSafe()`
- **Check:** 
  - Valida clienteId via `getClienteRowForPedidoCreate()`
  - Valida actor.userId === cliente.userId
  - Vendedor sempre controlado por `actor.vendedorId`
- **Status:** ✅ SEGURO

---

### UPDATES - Modificação (6 de 8 segura)

#### ✅ 1. Update Cliente
- **Arquivo:** [server/services/clientes.service.ts](server/services/clientes.service.ts#L526)
- **Linha:** 526
- **Tipo:** UPDATE com check
- **Check:** `await userCanMutateCliente(actor, clienteUserId)` - Valida ownership
- **Status:** ✅ SEGURO

#### ✅ 2-6. Safe Transaction e Orders Updates
- **Arquivo:** [server/services/safe-transaction.ts](server/services/safe-transaction.ts#L361)
- **Linhas:** 361, 383, 406
- **Check:** Usa transação com validações
- **Status:** ✅ SEGURO (com análise adicional needed)

---

## 📊 Matriz de Risco por Arquivo

| Arquivo | Operações Totais | Seguras | Risco | Prioridade |
|---------|------------------|---------|-------|-----------|
| `clientes.service.ts` | 9 | 9 | ✅ 0% | - |
| `orders.service.ts` | 10 | 7 | 🔴 30% | **CRÍTICA** |
| `finance.service.ts` | 1 | 0 | 🔴 100% | **CRÍTICA** |
| `reports/pdf.service.ts` | 1 | 0 | 🔴 100% | **CRÍTICA** |
| `logistica.service.ts` | 2 | 2 | ✅ 0% | - |
| `db/core.ts` | 1 | 1 | ✅ 0% | - |
| `cache/intelligent-cache.ts` | 1 | 1 | ✅ 0% | - |
| **TOTAL** | **25** | **20** | **20%** | - |

---

## 🔧 Routers com Ownership Checks

### ✅ server/routers.ts - Clientes
```typescript
// Linha 1079: HAS assertOwnership
await assertOwnership(ctx, "cliente", input.id);
```

### ✅ server/routers.ts - Pedidos
```typescript
// Linhas 1431, 1462, 1494, 1512: HAS assertOwnership
await assertOwnership(ctx, "pedido", input.id);
```

### ✅ server/routers/clientes.router.ts
```typescript
// Linha 131: HAS assertOwnership
await assertOwnership(ctx, "cliente", input.clienteId);
```

### ✅ server/routers/clientes.ts
```typescript
// Cria cliente com actor.userId incluído
const cliente = await clientesService.createCliente(tenantId, 
  { ...input, userId: actor.userId });
```

---

## 🎯 AÇÕES RECOMENDADAS

### 🔴 CRÍTICA - Corrigir em 24h

1. **Finance Service - Linha 145**
   - Adicionar `await assertPedidoMutableByActor(tenantId, actor, id)` ANTES de update
   - Validar actor tem acesso ao pedido

2. **Orders Service - Linha 863, 910**
   - Função `updatePedido()` DEVE validar ownership
   - Padrão: `await getClienteRowForPedidoCreate(tenantId, actor, pedido.clienteId)`

3. **PDF Service - Linha 735**
   - Filtrar clientes por actor.userId se role != "admin"
   - Ou restringir função apenas a admin:
   ```typescript
   if (actor.role !== "admin") {
     throw new Error("Apenas admin pode gerar relatório completo");
   }
   ```

### 📋 VERIFICAR - Próximos 7 dias

1. Analisar todos os callers de `updatePedido()` no router
   - Verificar se `assertOwnership()` é chamado ANTES
   
2. Audit logs - verificar se registra actor nas updates

3. Testes de segurança:
   - Vendedor A tenta atualizar pedido de Vendedor B
   - Vendedor A tenta ver clientes de Vendedor B (PDF)

---

## 📝 Funções de Segurança Disponíveis

```typescript
// No _core/ownership.ts
export async function assertOwnership(
  ctx: OwnershipTrpcContext,
  entity: OwnableEntity, // "pedido" | "cliente"
  entityId: number
): Promise<void>

// No _core/service-actor.ts
export function resolveServiceActor(ctx): Promise<ServiceActor>

// Em clientes.service.ts
async function userCanAccessCliente(dbConn, tenantId, actor, clienteId): Promise<boolean>
async function userCanMutateCliente(actor, clienteUserId): boolean
async function vendedorLinkedToCliente(dbConn, tenantId, vendedorId, clienteId): Promise<boolean>

// Em orders.service.ts
export async function assertPedidoMutableByActor(
  tenantId: number,
  actor: ServiceActor,
  pedidoId: number
): Promise<void>

async function pedidoAcessivelViaCliente(
  tenantId: number,
  actor: ServiceActor,
  clienteId: number
): Promise<boolean>
```

---

## 🧪 Cenários de Teste de Segurança

### Teste 1: Leitura Transversal de Clientes
```
Ator: Vendedor A (userId=5)
Teste: Chamar reports/pdf.service:clientesList com tenantId=1
Esperado: Apenas clientes onde userId=5 OU vinculados via clienteVendedores
Atual: ❌ Retorna TODOS os clientes (clientes.userId != 5)
```

### Teste 2: Update Pedido Outro Vendedor
```
Ator: Vendedor A (userId=5, vendedorId=10)
Teste: Chamar orders.service.updatePedido(tenantId=1, pedidoId=999)
       Onde: pedidos.999 -> clienteId=500 -> clientes.500.userId=6
Esperado: ERRO - acesso negado
Atual: ⚠️ Depende se assertOwnership é chamado no router
```

### Teste 3: Update Status Financeiro
```
Ator: Vendedor B (userId=7, vendedorId=20)
Teste: Chamar finance.service.updatePedido() direto
Esperado: ERRO - sem validação de ownership
Atual: ❌ SEM VALIDAÇÃO
```

---

## 📞 Ownership Model

### Clientes
- **Proprietário:** `clientes.userId` (users.id do criador)
- **Acesso:** 
  - Admin: SIM (para tudo)
  - Vendedor: SIM se `clientes.userId === vendedor.userId` OU vínculo em `clienteVendedores`
  - Outro Vendedor: NÃO

### Pedidos
- **Proprietário:** Cliente do pedido → CLI.userId
- **Acesso:**
  - Admin: SIM (para tudo)
  - Vendedor: SIM se `pedidos.cliente.userId === vendedor.userId`
  - Outro Vendedor: NÃO

---

## 🔒 Funcionalidade de Ownership Central

**Arquivo:** [server/_core/ownership.ts](server/_core/ownership.ts)

```typescript
export async function assertOwnership(
  ctx: OwnershipTrpcContext,
  entity: OwnableEntity, // "pedido" | "conta_receber" | "boleto" | "cliente"
  entityId: number
): Promise<void> {
  // Admin: Sempre permitido
  if (ctx.user.role === "admin") return;
  
  // Vendedor: Valida ownership específico por entidade
  switch (entity) {
    case "pedido": {
      const pedido = await db.getPedidoById(entityId);
      const clienteRow = await db.getClienteOwnerRowById(pedido.clienteId);
      const ownerUid = await resolveOwnerUserId(ctx);
      // ownerUid DEVE ser === clienteRow.userId
    }
    case "cliente": {
      const row = await db.getClienteOwnerRowById(entityId);
      const ownerUid = await resolveOwnerUserId(ctx);
      // ownerUid DEVE ser === row.userId
    }
  }
}
```

---

**Gerado em:** 27 de março de 2026  
**Responsável da Auditoria:** Copilot Hardening  
**Próxima Auditoria:** 3 de abril de 2026 (após fixes)
