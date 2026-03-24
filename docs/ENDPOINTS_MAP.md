# 🗺️ ERP SYSTEM ENDPOINTS MAP

## 📋 OVERVIEW
- **Total Routers**: 12 routers ativos
- **Total Services**: 48 services
- **Broken Files**: 2 arquivos quebrados
- **Missing Integration**: Services sem router correspondente

---

## 🛣️ ENDPOINTS TRPC

### 👥 CLIENTES (`clientesRouter`)
**File**: `server/routers/clientes.router.ts`
**Service**: `server/services/clientes.service.ts`

| Endpoint | Method | Auth | Path | Dependencies |
|----------|--------|------|------|--------------|
| list | query | protected | `/api/trpc/clientes.list` | clientesService, cache |
| create | mutation | protected | `/api/trpc/clientes.create` | clientesService |
| update | mutation | protected | `/api/trpc/clientes.update` | clientesService |
| delete | mutation | admin | `/api/trpc/clientes.delete` | clientesService |
| getById | query | protected | `/api/trpc/clientes.getById` | clientesService |

### 📦 PRODUTOS (`produtosRouter`)
**File**: `server/routers/produtos.router.ts`
**Service**: `server/services/inventory.service.ts`

| Endpoint | Method | Auth | Path | Dependencies |
|----------|--------|------|------|--------------|
| list | query | protected | `/api/trpc/produtos.list` | inventoryService, cache |
| create | mutation | admin | `/api/trpc/produtos.create` | inventoryService |
| update | mutation | admin | `/api/trpc/produtos.update` | inventoryService |
| updateEstoque | mutation | admin | `/api/trpc/produtos.updateEstoque` | inventoryService |
| delete | mutation | admin | `/api/trpc/produtos.delete` | inventoryService |

### 💰 FINANCEIRO (`boletosRouter`)
**File**: `server/routers/financeiro.router.ts`
**Service**: `server/services/finance.service.ts`

| Endpoint | Method | Auth | Path | Dependencies |
|----------|--------|------|------|--------------|
| list | query | protected | `/api/trpc/financeiro.list` | financeService |
| create | mutation | admin | `/api/trpc/financeiro.create` | financeService |
| baixar | mutation | admin | `/api/trpc/financeiro.baixar` | financeService |
| update | mutation | admin | `/api/trpc/financeiro.update` | financeService |
| delete | mutation | admin | `/api/trpc/financeiro.delete` | financeService |

### 🚚 LOGÍSTICA (`logisticaRouter`)
**File**: `server/routers/logistica.ts`
**Service**: `server/services/logistica.service.ts`

| Endpoint | Method | Auth | Path | Dependencies |
|----------|--------|------|------|--------------|
| listCargas | query | public | `/api/trpc/logistica.listCargas` | logisticaService |
| createCarga | mutation | protected | `/api/trpc/logistica.createCarga` | logisticaService |
| addPedidoCarga | mutation | protected | `/api/trpc/logistica.addPedidoCarga` | logisticaService |
| updatePedidoCarga | mutation | protected | `/api/trpc/logistica.updatePedidoCarga` | logisticaService |
| removePedidoCarga | mutation | protected | `/api/trpc/logistica.removePedidoCarga` | logisticaService |

### 🤖 LEO AI (`leoRouter`)
**File**: `server/routers/leo.router.ts`
**Service**: `server/services/ai/erp-ai.service.ts`

| Endpoint | Method | Auth | Path | Dependencies |
|----------|--------|------|------|--------------|
| ask | mutation | protected | `/api/trpc/leo.ask` | leoAgentCore, aiService |
| confirmarAcao | mutation | protected | `/api/trpc/leo.confirmarAcao` | aiService |

### 🔧 ADMIN (`adminRouter`)
**File**: `server/routers/admin/index.ts`
**Service**: System Health

| Endpoint | Method | Auth | Path | Dependencies |
|----------|--------|------|------|--------------|
| health | query | public | `/api/trpc/admin.health` | systemHealth |
| check | query | public | `/api/trpc/admin.check` | systemHealth |
| metrics | query | public | `/api/trpc/admin.metrics` | systemHealth |

---

## 📊 SERVICES STRUCTURE

### 🟢 ACTIVE SERVICES (247 funções exportadas)

#### Core Business Services
- **clientes.service.ts** (15 funções) - Gestão de clientes
- **orders.service.ts** (11 funções) - Gestão de pedidos
- **finance.service.ts** (24 funções) - Financeiro/Contas a receber/pagar
- **inventory.service.ts** (17 funções) - Estoque e produtos
- **logistica.service.ts** (14 funções) - Logística e entregas
- **users.service.ts** (9 funções) - Usuários e vendedores

#### AI Services (28 arquivos)
- **ai/erp-ai.service.ts** - Core AI service
- **ai/query-engine.ts** (13 funções) - Query processing
- **ai/action-engine.ts** (12 funções) - Action execution
- **ai/finance-engine.ts** (9 funções) - Financial AI
- **ai/business-insights.ts** (6 funções) - Business analytics
- **ai/sales-analytics.service.ts** (4 funções) - Sales analytics
- **ai/stock-analytics.service.ts** (4 funções) - Inventory analytics

#### System Services
- **system-monitor.ts** (2 funções) - System monitoring
- **audit-service.ts** (4 funções) - Audit logging
- **backup.service.ts** - Database backups
- **reports/pdf.service.ts** (12 funções) - PDF generation

---

## 🔗 DEPENDENCY MAP

### 📦 Módulo Dependencies

```
PEDIDOS (broken) → depends on:
├── clientes.service.ts ✓
├── users.service.ts ✓
├── finance.service.ts ✓
├── pdf.service.ts ✓
└── db/index.ts ✓

CLIENTES → depends on:
├── db/core.ts ✓
├── cache/simple-memory-cache.ts ✓
└── utils/pagination.ts ✓

PRODUTOS → depends on:
├── inventory.service.ts ✓
├── promocoes.service.ts ✓
├── db/index.ts ✓
└── cache/simple-memory-cache.ts ✓

FINANCEIRO → depends on:
├── finance.service.ts ✓
├── users.service.ts ✓
├── pdf.service.ts ✓
└── infra/tracing-middleware.ts ✓

LOGÍSTICA → depends on:
├── logistica.service.ts ✓
└── db/index.ts ✓

LEO AI → depends on:
├── ai/erp-ai.service.ts ✓
├── leo/agent/agent-core.ts ✓
└── infra/tracing-middleware.ts ✓
```

---

## ⚠️ STRUCTURAL ISSUES DETECTED

### 🚨 CRITICAL ISSUES

#### 1. **Broken Pedidos Router**
- **File**: `server/routers/pedidos.router.ts.broken`
- **Impact**: Pedidos functionality completely unavailable
- **Service Status**: `orders.service.ts` exists and functional
- **Fix Required**: Rename `.broken` file and fix syntax errors

#### 2. **Broken Audit Service**
- **File**: `server/services/audit-service.ts.broken`
- **Impact**: Audit logging compromised
- **Working Version**: `audit-service.ts` exists
- **Fix Required**: Remove broken version

### 🔍 MAPPING GAPS

#### Services Without Routers
```
├── promocoes.service.ts (11 funções) → No router found
├── analytics-optimizer.ts → No router found
├── dashboard-insights.service.ts → No router found
├── leo-insights.service.ts → No router found
├── safe-stock.ts → No router found
├── stock-safety.service.ts → No router found
└── pendencias.service.ts → No router found
```

#### AI Services With Limited Integration
```
├── 28 AI services available
├── Only leo.router.ts integrates AI
└── Most AI services not exposed via API
```

---

## 📋 VALIDATION STATUS

### ✅ VALIDATED COMPONENTS
- **All routers export correctly** - 12 routers found
- **All services export functions** - 247 functions detected
- **tRPC configuration** - Properly set up
- **Database connections** - All services import correctly
- **Cache integration** - Memory cache implemented

### ⚠️ PENDING VALIDATION
- **Pedidos router** - Broken file needs fixing
- **AI integration** - Many services not exposed
- **Services without routers** - Need API exposure

---

## 🧪 TEST PLAN SUMMARY

### 📊 Test Coverage
- **Total Endpoints**: 25+ endpoints mapped
- **Authentication Levels**: public, protected, admin
- **Dependency Chains**: All major dependencies mapped
- **Test Scenarios**: Happy path, error handling, performance, security

### 🎯 Priority for Testing
1. **High Priority**: clientes, produtos, financeiro, logistica
2. **Medium Priority**: admin, leo AI
3. **Low Priority**: AI services (limited exposure)

### 📝 Test Execution Order
1. Health checks (admin endpoints)
2. Read operations (list endpoints)
3. Create operations
4. Update operations
5. AI interactions
6. Complex workflows

---

## 🚀 NEXT STEPS

### Immediate Actions Required
1. **Fix pedidos.router.ts.broken** - Critical for order management
2. **Create routers for orphan services** - Expose more functionality
3. **Integrate AI services** - Leverage 28 AI services available
4. **Test plan execution** - Use generated test-plan.json

### Medium Term Improvements
1. **Standardize router patterns** - Consistent structure
2. **Add comprehensive error handling** - Better error responses
3. **Implement rate limiting** - Protect endpoints
4. **Add API documentation** - OpenAPI/Swagger

---

## 📈 SYSTEM HEALTH

### 🟢 Healthy Components
- **Core routers**: 12/12 working
- **Core services**: 6/6 working
- **Database layer**: Functional
- **Cache layer**: Operational
- **tRPC setup**: Properly configured

### 🟡 At Risk Components
- **Orders system**: Router broken
- **Audit system**: Duplicate files
- **AI integration**: Underutilized

### 🔴 Critical Issues
- **Pedidos functionality**: Completely unavailable
- **Service exposure**: 20+ services not accessible via API

---

**Generated**: 2026-03-18  
**Status**: Ready for validation  
**Next Action**: Fix broken pedidos router and execute test plan
