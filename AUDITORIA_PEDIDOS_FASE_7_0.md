# AUDITORIA PEDIDOS - FASE 7.0 / 7.1

**Data:** 2026-04-26  
**Objetivo:** Mapear e corrigir a duplicidade do módulo de pedidos  
**Escopo:** Apenas domínio de PEDIDOS (sem alterar infra/Redis/Drizzle/queues/bootstrap)

---

## RESUMO EXECUTIVO

### Caminho Oficial de Pedidos (ATIVO)
```
Frontend (tRPC pedidos router) 
  → server/routers.ts (pedidos section)
  → server/services/orders.service.ts (REAL)
  → Drizzle ORM → DB
```

### Caminhos Duplicados/Fakes

| Arquivo | Status | Motivo |
|---------|--------|--------|
| `server/routes/pedidos.ts` | **MORTO** | Mock com dados em memória, não registrado no backend |
| `server/services/order.service.ts` | **MOCK/TODO** | Apenas validação, sem DB, TODO comments |
| `server/tools/order.tool.ts` | **MOCK** | Wrapper do service mock, não usado em produção |
| `server/routes/orders.ts` | **INATIVO** | REST API não utilizada pelo frontend |
| `server/controllers/order.controller.ts` | **INATIVO** | Controller não utilizado pelo frontend |

---

## DETALHAMENTO POR ARQUIVO

### 1. server/services/orders.service.ts ✅ OFICIAL

**Função:** Service principal de pedidos (produção)

| Critério | Status |
|----------|--------|
| DB Real | ✅ Sim (Drizzle ORM) |
| Usa Tenant | ✅ Sim (tenantId em todas as operações) |
| Grava audit_log | ✅ Sim (insertAuditLog + auditLog) |
| Tem any | ❌ Não (tipagem estrita) |
| SQL Cru | ❌ Não (Drizzle ORM) |
| Status | ✅ **ATIVO - PRODUÇÃO** |

**Funções principais:**
- `createPedidoSafe()` - Criação com transação atômica
- `listPedidosExtended()` / `listPedidosTrpcPage()` - Listagem
- `getPedidoByIdForActor()` - Busca por ID com escopo de ator
- `getPedidoByNumeroForActor()` - Busca por número
- `updatePedido()` - Atualização
- `assertPedidoMutableByActor()` - Validação de acesso

**Consumidores:**
- `server/routers.ts` (tRPC pedidos router)
- `server/leo/tools/pedidos/pedidos.tool.ts` (LEO AI)

---

### 2. server/services/order.service.ts ⚠️ MOCK/TODO

**Função:** Service mock de pedidos (não usado em produção)

| Critério | Status |
|----------|--------|
| DB Real | ❌ Não (mock) |
| Usa Tenant | ❌ Não |
| Grava audit_log | ❌ Não |
| Tem any | ❌ Não (usa Record<string, unknown>) |
| SQL Cru | ❌ Não |
| Status | ⚠️ **MOCK/TODO** |

**Comentários no código:**
```typescript
// TODO: Integrar com TOOLS layer para persistência
// Exemplo: await orderTools.create(payload);
```

**Retornos mock:**
- `create()`: `{ id: Math.floor(Math.random() * 1000) }`
- `list()`: `[]` (array vazio com comentário "Ausência legítima")
- `update()`: `{ id: payload.id }`

**Consumidores:**
- `server/tools/order.tool.ts` (também mock)

---

### 3. server/routes/orders.ts ⚠️ INATIVO

**Função:** Rotas REST API para orders (não utilizadas)

| Critério | Status |
|----------|--------|
| DB Real | ❌ Indireto (via controller) |
| Usa Tenant | ✅ Sim (tenantMiddleware) |
| Grava audit_log | ❌ Não direto |
| Tem any | ❌ Não (Payload = Record<string, unknown>) |
| SQL Cru | ❌ Não |
| Status | ⚠️ **INATIVO - REST API não usada** |

**Rotas:**
- `POST /orders` - Create
- `GET /orders` - List
- `GET /orders/:id` - Get by ID
- `POST /orders/:id/status` - Update status

**Registro:** 
- ✅ Registrado em `server/api-routes.ts` como `/api/orders`
- ❌ Frontend usa tRPC, não REST API

**Consumidor:**
- `server/controllers/order.controller.ts`

---

### 4. server/routes/pedidos.ts ❌ MORTO

**Função:** Rotas mock com dados em memória

| Critério | Status |
|----------|--------|
| DB Real | ❌ Não (memória) |
| Usa Tenant | ❌ Não |
| Grava audit_log | ❌ Não |
| Tem any | ❌ Não |
| SQL Cru | ❌ Não |
| Status | ❌ **MORTO - Não registrado** |

**Comentários no código:**
```typescript
// Mock de produtos (em produção viria do banco de dados)
// Mock de clientes
```

**Dados mock:**
- Array `pedidos` com 1 pedido de exemplo
- Array `produtos` com 3 produtos
- Array `clientes` com 3 clientes

**Funções:**
- `getPedidos()` - Retorna mock enriquecido
- `createPedido()` - Cria no array em memória
- `updatePedido()` - Atualiza no array em memória
- `deletePedido()` - Remove do array em memória

**Registro:**
- ❌ NÃO registrado em `server/api-routes.ts`
- ❌ NÃO importado em nenhum lugar
- ❌ Código morto

---

### 5. server/controllers/order.controller.ts ⚠️ INATIVO

**Função:** Controller para orders REST API

| Critério | Status |
|----------|--------|
| DB Real | ⚠️ Indireto (via OrderTool + safe-order.module) |
| Usa Tenant | ✅ Sim (valida tenantId) |
| Grava audit_log | ❌ Não direto |
| Tem any | ❌ Não (Payload = Record<string, unknown>) |
| SQL Cru | ❌ Não (delega para safe-order.module) |
| Status | ⚠️ **INATIVO - REST API não usada** |

**Dependências:**
- `OrderTool` (wrapper de service mock)
- `safe-order.module` (SQL cru)

**Funções:**
- `create()` - Usa `createOrderSafe()` do safe-order.module
- `list()` - Usa `OrderTool.list()` (mock)
- `getById()` - Usa `OrderTool.list()` (mock)
- `updateStatus()` - Usa `updateOrderStatusSafe()` do safe-order.module

**Consumidor:**
- `server/routes/orders.ts`

---

### 6. server/modules/safe-order.module.ts ⚠️ SQL CRU

**Função:** Módulo com SQL cru para operações de pedido

| Critério | Status |
|----------|--------|
| DB Real | ✅ Sim (SQL cru via tx.execute) |
| Usa Tenant | ✅ Sim (tenantId obrigatório) |
| Grava audit_log | ✅ Sim (insertAuditLog) |
| Tem any | ⚠️ Sim (tx: any) |
| SQL Cru | ✅ **SIM** (extensivo) |
| Status | ⚠️ **ATIVO mas com SQL cru** |

**Funções com SQL cru:**
- `createOrderSafe()` - 4 queries SQL cru
- `cancelOrderSafe()` - 4 queries SQL cru
- `updateOrderStatusSafe()` - 2 queries SQL cru
- `validateOrderIntegrity()` - 3 queries SQL cru

**Exemplo de SQL cru:**
```typescript
const [produtosRows] = await tx.execute(
  `SELECT id, descricao, estoque, ativo FROM produtos WHERE tenantId = ? AND id IN (${placeholders}) FOR UPDATE`,
  [orderData.tenantId, ...produtoIds]
);
```

**Consumidores:**
- `server/controllers/order.controller.ts`

---

### 7. server/tools/order.tool.ts ⚠️ MOCK

**Função:** Tool wrapper do service mock

| Critério | Status |
|----------|--------|
| DB Real | ❌ Não (delega para service mock) |
| Usa Tenant | ❌ Não |
| Grava audit_log | ❌ Não |
| Tem any | ❌ Não (Payload = Record<string, unknown>) |
| SQL Cru | ❌ Não |
| Status | ⚠️ **MOCK - Não usado em produção** |

**Dependências:**
- `OrderService` (mock)

**Funções:**
- `create()` - Enriquece payload e delega para service
- `list()` - Normaliza payload e delega para service
- `update()` - Enriquece payload e delega para service

**Consumidor:**
- `server/controllers/order.controller.ts`

---

## FRONTEND

### client/src/hooks/usePedidos.ts ✅ OFICIAL

**Função:** Hook para listar pedidos via tRPC

| Critério | Status |
|----------|--------|
| DB Real | ✅ Sim (via tRPC) |
| Usa Tenant | ✅ Sim (implícito via tRPC context) |
| Grava audit_log | N/A |
| Tem any | ❌ Não |
| SQL Cru | ❌ Não |
| Status | ✅ **ATIVO** |

**Funções:**
- `usePedidos()` - Listagem com filtros
- `usePedidosParaCarga()` - Pedidos disponíveis para carga

**Consumidor:**
- Frontend components

---

### client/src/modules/pedidos/* ✅ OFICIAL

**Função:** Módulo de pedidos do frontend

| Critério | Status |
|----------|--------|
| DB Real | ✅ Sim (via tRPC) |
| Usa Tenant | ✅ Sim (implícito via tRPC context) |
| Grava audit_log | N/A |
| Tem any | ❌ Não |
| SQL Cru | ❌ Não |
| Status | ✅ **ATIVO** |

**Arquivos:**
- `hooks.ts` - Hooks type-safe (usePedidoList, usePedidoCreate, etc.)
- `types.ts` - Tipos específicos
- `index.ts` - Exportações
- `components/*` - Componentes UI

**Consumidor:**
- Frontend application

---

## LEO AI

### server/leo/tools/pedidos/pedidos.tool.ts ✅ OFICIAL

**Função:** Tools para LEO AI operar pedidos

| Critério | Status |
|----------|--------|
| DB Real | ✅ Sim (via orders.service.ts) |
| Usa Tenant | ✅ Sim (do contexto) |
| Grava audit_log | ✅ Sim (via orders.service.ts) |
| Tem any | ❌ Não |
| SQL Cru | ❌ Não (via orders.service.ts) |
| Status | ✅ **ATIVO** |

**Funções:**
- `buscarPedidoTool` - Busca por número
- `listarPedidosTool` - Listagem
- `verPedidoTool` - Busca por ID
- `criarPedidoTool` - Criação

**Consumidor:**
- LEO AI

---

## FLUXO DE DADOS

### Fluxo Oficial (ATIVO)
```
Frontend (tRPC pedidos)
  → server/routers.ts (pedidos section)
  → server/services/orders.service.ts
  → Drizzle ORM
  → MySQL DB
```

### Fluxo LEO AI (ATIVO)
```
LEO AI
  → server/leo/tools/pedidos/pedidos.tool.ts
  → server/services/orders.service.ts
  → Drizzle ORM
  → MySQL DB
```

### Fluxo REST API (INATIVO)
```
REST Client (não existe)
  → server/routes/orders.ts
  → server/controllers/order.controller.ts
  → server/tools/order.tool.ts (MOCK)
  → server/services/order.service.ts (MOCK)
  → ❌ Nada
```

### Fluxo Mock (MORTO)
```
Ninguém usa
  → server/routes/pedidos.ts
  → ❌ Memória
```

---

## PROBLEMAS IDENTIFICADOS

### 1. Duplicidade de Services
- `server/services/orders.service.ts` (REAL) ✅
- `server/services/order.service.ts` (MOCK) ❌

### 2. Duplicidade de Routes
- `server/routes/orders.ts` (REST, inativo) ⚠️
- `server/routes/pedidos.ts` (Mock, morto) ❌

### 3. SQL Cru em safe-order.module
- `server/modules/safe-order.module.ts` usa SQL cru extensivamente
- Viola princípio de usar Drizzle ORM
- Risco de SQL injection

### 4. Arquivos Mortos
- `server/routes/pedidos.ts` - Não registrado, mock em memória
- `server/services/order.service.ts` - TODO comments, não usado
- `server/tools/order.tool.ts` - Wrapper de service mock
- `server/controllers/order.controller.ts` - Controller não usado
- `server/routes/orders.ts` - REST API não usada

---

## RECOMENDAÇÕES

### Fase 7.1 - Limpeza (Sem alterar regra de negócio)

1. **Remover arquivos mortos:**
   - ❌ `server/routes/pedidos.ts` (mock em memória)
   - ❌ `server/services/order.service.ts` (TODO/mock)
   - ❌ `server/tools/order.tool.ts` (wrapper de mock)
   - ⚠️ `server/controllers/order.controller.ts` (se REST não será usado)
   - ⚠️ `server/routes/orders.ts` (se REST não será usado)

2. **Manter ativo:**
   - ✅ `server/services/orders.service.ts` (service oficial)
   - ✅ `server/routers.ts` (pedidos section)
   - ✅ `server/leo/tools/pedidos/pedidos.tool.ts` (LEO AI)
   - ✅ Frontend hooks e módulos

3. **Investigar safe-order.module:**
   - Avaliar se pode ser migrado para Drizzle ORM
   - Se não possível, documentar motivo

### Fase 7.2 - Refatoração (Após limpeza)

1. Remover SQL cru de `safe-order.module.ts` se possível
2. Unificar nomenclatura (orders vs pedidos)
3. Remover referências aos arquivos deletados

---

## CONCLUSÃO

**Caminho Oficial:** `server/services/orders.service.ts` via tRPC router  
**Caminhos Duplicados:** 5 arquivos (3 mortos, 2 inativos)  
**Risco:** SQL cru em safe-order.module.ts  
**Ação Imediata:** Remover arquivos mortos na Fase 7.1
