# 🏗️ **MAPA ESTRUTURAL COMPLETO ERP + LEO**

## 📍 **VISÃO ARQUITETURAL GERAL**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ERP ENTERPRISE SUITE                      │
├─────────────────────────────────────────────────────────────────────┤
│  🌐 FRONTEND (React + TypeScript + Vite)                      │
│  🚀 BACKEND (Node.js + Express + tRPC)                        │
│  🧠 LEO AI AGENT (Automação Inteligente)                       │
│  🗄️  DATABASE (MySQL + Drizzle ORM)                            │
│  ⚡ CACHE (Redis)                                              │
│  🐳 CONTAINERS (Docker + Docker Compose)                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 **CAMADA 1 - FRONTEND ARCHITECTURE**

### 📱 **Client Structure**
```
client/
├── 📂 src/
│   ├── 🎯 _core/hooks/           # Hooks React reutilizáveis
│   ├── 🤖 automation/           # Automação LEO Frontend
│   ├── 🎨 components/          # Componentes UI
│   ├── 📚 hooks/              # Hooks de negócio
│   ├── 🔧 lib/                 # Utilitários e API
│   ├── 🛡️  security/           # Segurança Frontend
│   ├── 📊 store/               # Estado Global
│   └── 📄 pages/               # Páginas da Aplicação
├── 📄 public/                  # Assets estáticos
└── ⚙️ vite.config.ts          # Configuração Vite
```

### 🔍 **Frontend Dependencies**
```typescript
// 🎯 Core Framework
React 18 + TypeScript + Vite

// 🎨 UI Framework
TailwindCSS + shadcn/ui + Lucide Icons

// 🔄 State Management
Zustand (store) + React Query (server state)

// 🌐 API Client
tRPC + Axios + Fetch API

// 🛡️ Security
CSRF Tokens + Session Management + Route Guards

// 🤖 LEO Integration
Leo Chat + Leo Dashboard + Leo Voice Input
```

---

## 🚀 **CAMADA 2 - BACKEND ARCHITECTURE**

### 🏗️ **Server Structure**
```
server/
├── 📂 _core/                 # Núcleo do Sistema
│   ├── 🔐 auth/               # Autenticação & Segurança
│   ├── 🛡️  security/          # Middleware de Segurança
│   ├── 📊 logger/             # Logging & Monitoramento
│   ├── ⚡ cache/              # Cache Management
│   └── 🔄 middleware/         # Middleware Global
├── 📂 api/                   # API Routes
├── 📂 leo/                   # 🧠 LEO AI AGENT
│   ├── 🤖 engine/            # Motor Cognitivo
│   ├── 🛡️  security/          # Sandbox LEO
│   ├── 🧠 memory/            # Memória LEO
│   ├── 📋 tasks/              # Task Queue
│   └── 🎯 actions/           # Ações LEO
├── 📂 services/              # Business Logic
├── 📂 routers/               # tRPC Routes
├── 📂 middleware/            # Custom Middleware
└── 📂 tests/                 # Testes Unitários
```

### 🔌 **Backend Dependencies**
```typescript
// 🚀 Core Framework
Node.js + Express + TypeScript

// 🔄 API Layer
tRPC + Zod (validation) + OpenTelemetry

// 🗄️  Database
MySQL + Drizzle ORM + Connection Pooling

// ⚡ Cache & Performance
Redis + Rate Limiting + Circuit Breaker

// 🛡️ Security
JWT + bcrypt + CSRF Protection + Input Sanitization

// 📊 Monitoring
Sentry + Custom Logger + Health Checks

// 🧠 LEO AI
Custom AI Engine + Memory Management + Task Queue
```

---

## 🧠 **CAMADA 3 - LEO AI AGENT ARCHITECTURE**

### 🤖 **LEO Core Components**
```
leo/
├── 🧠 engine/
│   ├── 🔄 leo-loop.ts         # Loop Cognitivo Principal
│   ├── 🎯 decision-engine.ts  # Motor de Decisão
│   └── 📊 context-manager.ts # Gerenciamento de Contexto
├── 🛡️  security/
│   ├── 🔒 leo-sandbox.ts     # Sandbox de Segurança
│   ├── 🛡️  leo-hardening.ts  # Hardening LEO
│   └── 🔐 session-gate.ts    # Controle de Sessão
├── 🧠 memory/
│   ├── 📝 leo-memory.ts      # Memória Principal
│   ├── 🗄️  memory-store.ts   # Armazenamento
│   └── 🔄 memory-safety.ts   # Validação de Memória
├── 📋 tasks/
│   ├── 📝 task-queue.ts      # Fila de Tarefas
│   ├── ⚡ task-executor.ts    # Executor de Tarefas
│   └── 📊 task-tracker.ts    # Rastreamento
└── 🎯 actions/
    ├── 💼 automation.ts      # Automações
    ├── 🔍 perception.ts      # Percepção do Sistema
    └── ⚡ reactions.ts       # Reações a Eventos
```

### 🎯 **LEO Data Flow**
```
📥 Input (User/System)
    ↓
🧠 Context Analysis (tenantId, userId, permissions)
    ↓
🛡️  Security Validation (Sandbox + Permissions)
    ↓
🤖 Decision Engine (AI Processing)
    ↓
📋 Task Queue (Priorization)
    ↓
⚡ Action Execution (Business Logic)
    ↓
🧠 Memory Update (Learning)
    ↓
📤 Output (Response/Automation)
```

---

## 🗄️ **CAMADA 4 - DATABASE ARCHITECTURE**

### 📊 **Database Schema**
```sql
-- 👥 Multi-Tenant Core Tables
users              -- Usuários do Sistema
vendedores         -- Vendedores (Multi-Tenant)
clientes           -- Clientes (Multi-Tenant)
produtos           -- Produtos (Multi-Tenant)
pedidos            -- Pedidos (Multi-Tenant)
itens_pedido       -- Itens do Pedido (Multi-Tenant)

-- 🧠 LEO AI Tables
leo_memory         -- Memória LEO
leo_tasks          -- Tarefas LEO
leo_actions_log    -- Log de Ações LEO
leo_sessions       -- Sessões LEO

-- 💰 Financial Tables
contas_receber     -- Contas a Receber
contas_pagar       -- Contas a Pagar
plano_contas       -- Plano de Contas
movimentos_financeiros -- Movimentos

-- 📊 System Tables
audit_log          -- Auditoria
system_metrics      -- Métricas do Sistema
```

### 🔐 **Multi-Tenant Isolation**
```typescript
// 🏢 Tenant Isolation Strategy
interface TenantEntity {
  tenantId: number;     // OBRIGATÓRIO em todas as tabelas
  createdAt: Date;     // Timestamp criação
  updatedAt: Date;     // Timestamp atualização
}

// 🛡️  Security Rules
- WHERE tenantId = ? em TODAS as queries
- Validação de ownership em UPDATE/DELETE
- Row-level security por tenant
```

---

## 🔄 **CAMADA 5 - INTEGRATION FLOW**

### 🌊 **Complete Request Flow**
```
🌐 Frontend (React)
    ↓ [tRPC + CSRF + JWT]
🚀 Backend API (Express + tRPC)
    ↓ [Authentication + Rate Limiting]
🛡️  Security Middleware
    ↓ [Tenant Validation + Input Sanitization]
📊 Business Services
    ↓ [Database Transactions + Cache]
🗄️  Database (MySQL + Redis)
    ↓ [Response Processing]
🧠 LEO AI Agent (se necessário)
    ↓ [Automation + Memory Update]
📤 Response (tRPC + JSON)
```

### 🤖 **LEO Integration Flow**
```
📡 System Events (Pedidos, Estoque, etc.)
    ↓
🧠 LEO Perception Engine
    ↓
🎯 Context Analysis (tenant, user, permissions)
    ↓
🛡️  Security Sandbox Validation
    ↓
🤖 AI Decision Making
    ↓
📋 Task Queue Processing
    ↓
⚡ Action Execution (Business Logic)
    ↓
🧠 Memory Update & Learning
    ↓
📊 Audit & Logging
```

---

## 🛡️ **CAMADA 6 - SECURITY ARCHITECTURE**

### 🔐 **Security Layers**
```
🌐 FRONTEND SECURITY
├── 🛡️  CSRF Protection
├── 🔐 Session Management
├── 🚫 Route Guards
├── 🧹 Input Sanitization
└── 📊 Security Headers

🚀 BACKEND SECURITY
├── 🔒 JWT Authentication
├── 🛡️  Rate Limiting
├── 🔍 Input Validation (Zod)
├── 🧠 SQL Injection Prevention
├── 🏢 Multi-Tenant Isolation
└── 📊 Audit Logging

🧠 LEO SECURITY
├── 🔒 Sandbox Isolation
├── 🛡️  Permission Validation
├── 🚫 Dangerous Action Blocking
├── 📊 Memory Safety
└── 🔍 Context Validation
```

---

## 📊 **CAMADA 7 - MONITORING & OBSERVABILITY**

### 📈 **Monitoring Stack**
```
🔍 APPLICATION MONITORING
├── 📊 Performance Metrics
├── 🚨 Error Tracking (Sentry)
├── 📝 Structured Logging
├── 🔍 Distributed Tracing
└── 💓 Health Checks

🗄️  DATABASE MONITORING
├── 📊 Query Performance
├── 🔍 Connection Pool Status
├── 📈 Transaction Monitoring
└── 🚨 Deadlock Detection

🧠 LEO MONITORING
├── 🤖 Task Execution Metrics
├── 🧠 Memory Usage
├── 🛡️  Security Events
├── 📊 Decision Accuracy
└── 🔄 Loop Performance
```

---

## 🚀 **CAMADA 8 - DEPLOYMENT ARCHITECTURE**

### 🐳 **Container Strategy**
```
🐳 CONTAINER ORCHESTRATION
├── 📦 erp-api (Backend + LEO)
├── 🗄️  erp-db (MySQL)
├── ⚡ erp-redis (Redis Cache)
├── 🌐 erp-frontend (Nginx + Static Files)
└── 📊 monitoring (Grafana + Prometheus)

🔄 NETWORKING
├── 🔒 Internal Network (Containers)
├── 🌐 External Exposure (Port 3000)
├── 🛡️  SSL/TLS Termination
└── 📊 Health Check Endpoints
```

---

## 🎯 **KEY ARCHITECTURAL DECISIONS**

### ✅ **Strengths**
1. **🏢 Multi-Tenant by Design** - Isolamento completo de dados
2. **🧠 AI Integration** - LEO como agente inteligente nativo
3. **🛡️ Security First** - Múltiplas camadas de segurança
4. **📊 Type Safety** - TypeScript end-to-end
5. **🔄 Modern Stack** - Tecnologias atuais e bem mantidas

### ⚠️ **Areas for Improvement**
1. **🔍 Type Safety** - 374 arquivos com tipos `any`
2. **🛡️  LEO Security** - Sandbox precisa reforço
3. **📊 Monitoring** - Métricas mais granulares
4. **🧪 Testing** - Cobertura de testes maior
5. **📚 Documentation** - Documentação técnica

---

## 🎯 **NEXT STEPS FOR ARCHITECT**

### 📋 **Immediate Actions**
1. **🔧 Fix TypeScript Errors** - Remover tipos `any`
2. **🛡️  Hardening LEO** - Reforçar sandbox
3. **📊 Enhance Monitoring** - Métricas detalhadas
4. **🧪 Improve Testing** - Cobertura >90%
5. **📚 Document Architecture** - Guia completo

### 🚀 **Future Enhancements**
1. **☁️ Cloud Native** - Kubernetes deployment
2. **🤖 ML Pipeline** - Machine learning avançado
3. **📊 Real-time Analytics** - Dashboards em tempo real
4. **🔐 Zero Trust** - Arquitetura zero-trust
5. **🌐 Microservices** - Decomposição em microsserviços

---

## 🏆 **ARCHITECTURE SUMMARY**

Este é um **ERP Enterprise Moderno** com:
- ✅ **Multi-tenancy robusto**
- ✅ **AI Agent integrado (LEO)**
- ✅ **Security first approach**
- ✅ **Type safety end-to-end**
- ✅ **Modern tech stack**
- ✅ **Container-ready deployment**
- ✅ **Observability completa**

**Complexidade: ALTA** | **Maturidade: MÉDIA** | **Potencial: EXCELENTE**
