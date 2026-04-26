# LEO EVOLUTION GUIDE - Guia de Evolução do Sistema

## 🎯 OBJETIVO

Este guia define como evoluir o sistema LEO sem quebrar o core de execução.

**PRINCÍPIO FUNDAMENTAL:**
- CORE do LEO é IMUTÁVEL
- FEATURES do sistema continuam EVOLUTIVAS
- Segurança não pode impedir evolução de produto

---

## 📐 ARQUITETURA

### Fronteira Clara Entre Core e Evolução

```
┌─────────────────────────────────────────────────────────┐
│                    CORE IMUTÁVEL                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  ExecutionGate → Registry → ContractLayer         │  │
│  │  Scheduler Trigger → Actor Validation             │  │
│  │  Tenant Validation → Tool Execution               │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓ CONSUME
┌─────────────────────────────────────────────────────────┐
│                  EVOLUÇÃO LIBERADA                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Dashboards  │  │   Analytics  │  │  Monitoring  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Reports    │  │     UI       │  │   Logging    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ O QUE VOCÊ PODE CRIAR LIVREMENTE

### 1. Dashboards

**Exemplo: Dashboard de Vendas**

```typescript
// ✅ CORRETO: Dashboard consome ExecutionGate
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function getVendasDashboardData(tenantId: number, userId: number) {
  const result = await executeLeoActionGate({
    action: 'getReportVendasPeriodo',
    toolName: 'salesAnalyticsTool',
    parameters: { 
      tenantId,
      dataInicio: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      dataFim: new Date(),
    },
    context: { tenantId, userId },
    source: 'dashboard',
  });
  
  return result.data;
}
```

**Permitido:**
- ✅ Criar dashboards de qualquer tipo
- ✅ Visualizar dados de negócio
- ✅ Criar gráficos e métricas
- ✅ Exportar dados para análise

**Proibido:**
- ❌ Executar lógica direta sem ExecutionGate
- ❌ Acessar services diretamente
- ❌ Bypass de validação de tenant

---

### 2. Analytics UI

**Exemplo: Painel de Analytics**

```typescript
// ✅ CORRETO: Analytics consome ExecutionGate
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function getAnalyticsData(tenantId: number, userId: number) {
  const result = await executeLeoActionGate({
    action: 'getAnalyticsMetrics',
    toolName: 'analyticsTool',
    parameters: { tenantId },
    context: { tenantId, userId },
    source: 'analytics',
  });
  
  return result.data;
}
```

**Permitido:**
- ✅ Criar interfaces de análise
- ✅ Visualizar métricas de negócio
- ✅ Criar relatórios visuais
- ✅ Exportar dados

**Proibido:**
- ❌ Alterar lógica de execução
- ❌ Criar novo execution gate
- ❌ Bypass de registry

---

### 3. Health Monitoring

**Exemplo: Monitoramento de Sistema**

```typescript
// ✅ CORRETO: Monitoramento consome ExecutionGate
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function getSystemHealth(tenantId: number, userId: number) {
  const result = await executeLeoActionGate({
    action: 'healthCheck',
    toolName: 'system',
    parameters: { detailed: true },
    context: { tenantId, userId },
    source: 'monitoring',
  });
  
  return result.data;
}
```

**Permitido:**
- ✅ Monitorar saúde do sistema
- ✅ Criar alertas visuais
- ✅ Visualizar status de serviços
- ✅ Criar painéis de monitoramento

**Proibido:**
- ❌ Executar ações de correção sem ExecutionGate
- ❌ Alterar configuração de sistema
- ❌ Bypass de validação

---

### 4. Logging Visual

**Exemplo: Visualizador de Logs**

```typescript
// ✅ CORRETO: Logging visual consome ExecutionGate
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function getLogs(tenantId: number, userId: number, filters: LogFilters) {
  const result = await executeLeoActionGate({
    action: 'getLogs',
    toolName: 'loggingTool',
    parameters: { tenantId, ...filters },
    context: { tenantId, userId },
    source: 'logging',
  });
  
  return result.data;
}
```

**Permitido:**
- ✅ Visualizar logs
- ✅ Filtrar e buscar logs
- ✅ Criar dashboards de logs
- ✅ Exportar logs

**Proibido:**
- ❌ Alterar configuração de logging
- ❌ Deletar logs sem ExecutionGate
- ❌ Bypass de autorização

---

### 5. Performance Panels

**Exemplo: Painel de Performance**

```typescript
// ✅ CORRETO: Performance consome ExecutionGate
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function getPerformanceMetrics(tenantId: number, userId: number) {
  const result = await executeLeoActionGate({
    action: 'getPerformanceMetrics',
    toolName: 'monitoringTool',
    parameters: { tenantId },
    context: { tenantId, userId },
    source: 'monitoring',
  });
  
  return result.data;
}
```

**Permitido:**
- ✅ Monitorar performance
- ✅ Criar gráficos de tempo
- ✅ Analisar bottlenecks
- ✅ Visualizar métricas

**Proibido:**
- ❌ Alterar configuração de performance
- ❌ Executar otimizações sem ExecutionGate
- ❌ Bypass de validação

---

### 6. Reporting System

**Exemplo: Sistema de Relatórios**

```typescript
// ✅ CORRETO: Relatórios consomem ExecutionGate
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function generateReport(tenantId: number, userId: number, reportType: string) {
  const result = await executeLeoActionGate({
    action: 'generateReport',
    toolName: 'reportingTool',
    parameters: { tenantId, reportType },
    context: { tenantId, userId },
    source: 'reporting',
  });
  
  return result.data;
}
```

**Permitido:**
- ✅ Gerar relatórios
- ✅ Exportar PDF/Excel
- ✅ Agendar relatórios
- ✅ Criar templates de relatório

**Proibido:**
- ❌ Alterar dados sem ExecutionGate
- ❌ Executar ações de negócio sem ExecutionGate
- ❌ Bypass de validação

---

## 🚫 O QUE VOCÊ NÃO PODE FAZER

### 1. Substituir ExecutionGate

```typescript
// ❌ ERRADO: Tentar substituir ExecutionGate
async function meuExecutorAlternativo(request: any) {
  // NUNCA fazer isso - bypass do core
  const service = new MeuService();
  return await service.executarDireto(request);
}
```

**Por que é errado:**
- Quebra a arquitetura de segurança
- Bypass de validação de tenant
- Bypass de registro de execução
- Violação crítica do core

---

### 2. Duplicar Lógica de Execução

```typescript
// ❌ ERRADO: Duplicar lógica de execução
async function meuExecutorComValidacao(request: any) {
  // NUNCA duplicar validação - use ExecutionGate
  if (!request.tenantId) throw new Error('tenantId required');
  if (!request.userId) throw new Error('userId required');
  
  const service = new MeuService();
  return await service.executar(request);
}
```

**Por que é errado:**
- Duplicação de código
- Manutenção duplicada
- Possível inconsistência
- Bypass de registry

---

### 3. Recriar Scheduler Fora do Core

```typescript
// ❌ ERRADO: Recriar scheduler fora do core
class MeuScheduler {
  async executarTarefa(tarefa: any) {
    // NUNCA criar scheduler alternativo
    const service = new MeuService();
    return await service.executar(tarefa);
  }
}
```

**Por que é errado:**
- Bypass de ExecutionGate
- Execução não registrada
- Sem validação de origem
- Violação do core

---

### 4. Executar Lógica Direta Sem Registry

```typescript
// ❌ ERRADO: Executar lógica direta sem registry
async function minhaFeature(tenantId: number) {
  // NUNCA executar sem registry
  const db = getDatabase();
  return await db.query('SELECT * FROM pedidos WHERE tenantId = ?', [tenantId]);
}
```

**Por que é errado:**
- Execução não registrada
- Sem rastreabilidade
- Bypass de ExecutionGate
- Violação do core

---

## 📋 CHECKLIST PARA NOVAS FEATURES

Antes de criar uma nova feature, verifique:

- [ ] A feature consome ExecutionGate?
- [ ] A feature não acessa services diretamente?
- [ ] A feature não duplica lógica do core?
- [ ] A feature não recria scheduler?
- [ ] A feature não bypass de registry?
- [ ] A feature não bypass de validação de tenant?
- [ ] A feature não bypass de validação de actor?

Se respondeu "NÃO" para qualquer item, **reconsidere a implementação**.

---

## 🎨 PADRÕES RECOMENDADOS

### Padrão 1: Feature Consome ExecutionGate

```typescript
// ✅ PADRÃO CORRETO
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function minhaFeature(tenantId: number, userId: number) {
  const result = await executeLeoActionGate({
    action: 'minhaAcao',
    toolName: 'minhaTool',
    parameters: { tenantId },
    context: { tenantId, userId },
    source: 'minha-feature',
  });
  
  return result.data;
}
```

### Padrão 2: Feature Com Tratamento de Erro

```typescript
// ✅ PADRÃO CORRETO
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function minhaFeature(tenantId: number, userId: number) {
  try {
    const result = await executeLeoActionGate({
      action: 'minhaAcao',
      toolName: 'minhaTool',
      parameters: { tenantId },
      context: { tenantId, userId },
      source: 'minha-feature',
    });
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    return result.data;
  } catch (error) {
    console.error('Erro na feature:', error);
    throw error;
  }
}
```

### Padrão 3: Feature Com Retry

```typescript
// ✅ PADRÃO CORRETO
import { executeLeoActionGate } from '../runtime/execution-gate.js';

export async function minhaFeatureComRetry(tenantId: number, userId: number) {
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeLeoActionGate({
        action: 'minhaAcao',
        toolName: 'minhaTool',
        parameters: { tenantId },
        context: { tenantId, userId },
        source: 'minha-feature',
      });
      
      if (result.success) {
        return result.data;
      }
      
      if (attempt === maxRetries) {
        throw new Error(result.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }
}
```

---

## 🔧 QUANDO PRECISAR ALTERAR O CORE

Se você genuinamente precisa alterar o core:

1. **Documente o motivo**
   - Por que a alteração é necessária?
   - Qual problema resolve?
   - Qual é o impacto?

2. **Justifique a necessidade**
   - Não existe alternativa usando o core atual?
   - A alteração não quebra a segurança?
   - A alteração é compatível com arquitetura?

3. **Prova de segurança**
   - A alteração mantém validação de tenant?
   - A alteração mantém registro de execução?
   - A alteração não introduz bypass?

4. **Submeta para revisão**
   - Abra um PR com justificativa
   - Aguarde aprovação
   - Documente a alteração

**O core é imutável por design, mas evolução é possível com justificativa.**

---

## 📚 RECURSOS

- `CORE_IMMUTABLE.md` - Documentação do core imutável
- `execution-gate.ts` - Execution Gate
- `execution-registry.ts` - Registry de execução
- `execution-contract-layer.ts` - Validação de origem

---

## 💡 DICA FINAL

**Lembre-se:**
- Core é para segurança e execução
- Features são para UI e visualização
- Sempre consuma o core, nunca substitua
- A evolução do produto não precisa quebrar o core

**Segurança e evolução podem coexistir.**
