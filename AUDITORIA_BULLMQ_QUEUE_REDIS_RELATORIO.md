# 🧱 AUDITORIA BULLMQ/QUEUE/REDIS - RELATÓRIO COMPLETO

**Data:** 26 de abril de 2026  
**Escopo:** Análise completa do sistema de filas BullMQ, dependências Redis e riscos associados  
**Status:** ⚠️ **SENSÍVEL - DEPENDÊNCIA CRÍTICA DE REDIS**

---

## 📋 RESUMO EXECUTIVO

O sistema ERP utiliza **BullMQ 5.71.0** como mecanismo principal de filas para processamento assíncrono de tarefas pesadas (OCR, screenshots, análises LEO, relatórios, etc.). A implementação é **sensível** porque depende **criticamente de Redis em runtime real** - sem Redis, o sistema de filas não funciona.

### 🎯 Principais Descobertas

- **✅ Arquitetura bem estruturada** com separação clara entre filas, workers e processadores
- **⚠️ Dependência crítica de Redis** - sem Redis, filas não operam
- **⚠️ Configuração de retry inconsistente** - `maxRetriesPerRequest` varia entre null e 3
- **✅ Tratamento de erros robusto** com event handlers e logging
- **⚠️ Risco de vazamento de conexões** se graceful shutdown falhar
- **✅ Idempotência implementada** (mas não totalmente ativa)
- **✅ Rate limiting com Redis** para controle de carga

---

## 🏗️ ARQUITETURA DO SISTEMA DE FILAS

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────┐
│                    API / Application                         │
│  (async-operations.ts, routers, services)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Queue Manager (queue.ts)                        │
│  - 8 filas especializadas                                    │
│  - Rate limiting + Idempotência                              │
│  - Configurações por fila                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              BullMQ Queue System                              │
│  - Queue instances (Redis-backed)                             │
│  - Job scheduling                                            │
│  - Retry/backoff policies                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Worker Manager (worker.ts)                      │
│  - 8 workers especializados                                 │
│  - Concurrency control                                       │
│  - Event handlers                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Job Processors (jobs.ts)                         │
│  - OCR, Screenshot, LEO Analysis                             │
│  - Report Generation, Desktop Automation                      │
│  - Notifications, Backup, Cleanup                            │
└─────────────────────────────────────────────────────────────┘
```

### Filas Configuradas

| Fila | Nome BullMQ | Concorrência | Tentativas | Backoff | Uso |
|------|-------------|--------------|------------|---------|-----|
| OCR | `ocr-processing` | 2 | 2 | fixed 5s | Processamento de imagem |
| Screenshot | `screenshot-capture` | 3 | 3 | exponential 2s | Captura de tela |
| LEO Analysis | `leo-analysis` | 1 | 2 | delay 1s | Análises IA |
| Report Generation | `report-generation` | 2 | 1 | - | Relatórios PDF/Excel |
| Desktop Automation | `desktop-automation` | 1 | 2 | - | Automações desktop |
| Notifications | `notifications` | 5 | 5 | exponential 1s | Notificações |
| Backup | `backup-operations` | 1 | 1 | - | Backups do sistema |
| Cleanup | `cleanup-operations` | 2 | 1 | - | Limpeza/maintenance |

---

## 🔗 DEPENDÊNCIA DE REDIS

### Configuração Redis

**Arquivo:** `server/infra/redis.ts`

```typescript
// Configuração padrão Redis
{
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || "0"),
  maxRetriesPerRequest: 3,        // ⚠️ INCONSISTENTE
  retryDelayOnFailover: 100,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4
}

// Configuração BullMQ (exige maxRetriesPerRequest: null)
{
  ...config,
  maxRetriesPerRequest: null as null  // ⚠️ ESPECÍFICO PARA BULLMQ
}
```

### ⚠️ PROBLEMA CRÍTICO: Inconsistência de maxRetriesPerRequest

**Localizações encontradas:**

1. **`server/infra/redis.ts` (linha 87, 103)** - `maxRetriesPerRequest: 3`
2. **`server/infra/redis.ts` (linha 529)** - `maxRetriesPerRequest: null` (BullMQ)
3. **`server/config/env.ts` (linha 305)** - `maxRetriesPerRequest: null`
4. **`server/scripts/check-infra.mjs` (linha 113)** - `maxRetriesPerRequest: 1`
5. **`server/scripts/test-redis-runtime.ts` (linha 68)** - `maxRetriesPerRequest: null`
6. **`server/scripts/test-redis-simple.ts` (linha 11)** - `maxRetriesPerRequest: null`

**Risco:** Configurações inconsistentes podem causar comportamento imprevisível em diferentes contextos (API vs Worker vs Scripts).

### Docker Compose Redis

**Arquivo:** `docker-compose.yml` e `docker-compose.infra.yml`

```yaml
redis:
  image: redis:7  # ou redis:7-alpine
  container_name: erp-redis
  restart: always
  ports:
    - "6379:6379"
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 30s
```

**Status:** ✅ Configuração adequada com healthcheck

---

## 🚨 RISCOS IDENTIFICADOS

### 1. 🔴 RISCO CRÍTICO: Dependência de Redis em Runtime

**Descrição:** O sistema de filas BullMQ **não funciona sem Redis**. Se Redis cair ou não estiver disponível:

- **Filas não podem ser criadas**
- **Jobs não podem ser enfileirados**
- **Workers não podem processar tarefas**
- **Rate limiting falha (mas fail-open)**

**Impacto:**
- OCR, screenshots, análises LEO, relatórios **não funcionam**
- Notificações podem ser perdidas
- Backups automáticos podem falhar

**Mitigações existentes:**
- ✅ Healthcheck no Docker Compose
- ✅ `waitForRedis()` com timeout configurável
- ✅ Rate limiter com fail-open (permite execução se Redis cair)
- ⚠️ **Sem fallback alternativo** (ex: fila em memória)

**Recomendação:**
```typescript
// Considerar fallback para fila em memória se Redis indisponível
if (!redisAvailable) {
  logger.warn('Redis unavailable, using in-memory queue fallback');
  return inMemoryQueue.addJob(jobData);
}
```

### 2. 🟡 RISCO MÉDIO: Inconsistência de maxRetriesPerRequest

**Descrição:** Diferentes partes do sistema usam valores diferentes para `maxRetriesPerRequest`:

- **3** - Configuração padrão Redis (infra/redis.ts)
- **null** - BullMQ workers (exigido pela biblioteca)
- **1** - Scripts de check-infra

**Impacto:**
- Comportamento inconsistente de retry
- Possível perda de jobs em cenários de falha
- Dificuldade de debugging

**Recomendação:**
```typescript
// Padronizar configuração
const REDIS_CONFIG = {
  maxRetriesPerRequest: 3,  // Para operações regulares
  maxRetriesPerRequestBullMQ: null,  // Para BullMQ
};
```

### 3. 🟡 RISCO MÉDIO: Vazamento Potencial de Conexões

**Descrição:** Se graceful shutdown falhar, conexões Redis podem não ser fechadas corretamente.

**Locais de cleanup:**
- `server/_core/bullmq-queue.ts` - `close()` method (linha 308)
- `server/_core/bullmq-workers.ts` - `closeWorkers()` (linha 262)
- `server/queue/worker.ts` - `shutdown()` (linha 439)
- `server/queue/queue.ts` - `shutdown()` (linha 505)
- `server/infra/redis.ts` - `disconnect()` (linha 437)

**Proteções existentes:**
- ✅ `Promise.all()` para fechamento paralelo
- ✅ Event handlers para `SIGINT`/`SIGTERM`
- ✅ `globalThis.redis` para graceful shutdown

**Risco residual:**
- Se processo for morto com `SIGKILL` (-9), cleanup não é executado
- Conexões podem ficar abertas no Redis (TIME_WAIT)

**Recomendação:**
```typescript
// Adicionar timeout forçado no shutdown
const SHUTDOWN_TIMEOUT = 5000;
await Promise.race([
  shutdown(),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Shutdown timeout')), SHUTDOWN_TIMEOUT)
  )
]);
```

### 4. 🟢 RISCO BAIXO: Idempotência Não Totalmente Ativa

**Descrição:** O sistema de idempotência existe mas não está totalmente implementado.

**Arquivo:** `server/queue/idempotency.ts`

```typescript
// TODO: Implementar jobExecutionLog no schema
// const result = await db
//   .select()
//   .from(jobExecutionLog)
//   .where(eq(jobExecutionLog.jobId, jobId))
//   .limit(1);

// Temporariamente retorna false para permitir compilação
return false;
```

**Impacto:**
- Jobs duplicados podem ser executados
- Rate limiting funciona, mas idempotência completa não

**Recomendação:**
- Implementar tabela `jobExecutionLog` no schema Drizzle
- Ativar as queries comentadas
- Adicionar cleanup automático de registros antigos

### 5. 🟢 RISCO BAIXO: Debounce Cache em Memória

**Descrição:** Rate limiter usa `Map<string, NodeJS.Timeout>` local para debounce.

**Arquivo:** `server/queue/rate-limiter.ts` (linha 40)

```typescript
private debounceCache: Map<string, NodeJS.Timeout> = new Map();
```

**Impacto:**
- Em multi-instância, cada instância tem seu próprio cache
- Debounce não funciona corretamente entre instâncias
- Rate limiting (Redis) funciona, mas debounce (local) não

**Recomendação:**
- Mover debounce para Redis também
- Ou aceitar que debounce é local-only

---

## 🔍 GARGALOS DE PERFORMANCE

### 1. Concorrência de Workers

**Configuração atual:**

| Worker | Concorrência | Justificativa | Avaliação |
|--------|--------------|---------------|-----------|
| OCR | 2 | Processamento pesado | ✅ Adequado |
| Screenshot | 3 | Operação rápida | ✅ Adequado |
| LEO Analysis | 1 | Consome muita CPU | ✅ Adequado |
| Report Generation | 2 | Pode rodar em paralelo | ✅ Adequado |
| Desktop Automation | 1 | Evitar conflitos | ✅ Adequado |
| Notifications | 5 | Operações leves | ✅ Adequado |
| Backup | 1 | Apenas um por vez | ✅ Adequado |
| Cleanup | 2 | Pode rodar em paralelo | ✅ Adequado |

**Conclusão:** Concorrência bem configurada para cada tipo de workload.

### 2. Retenção de Jobs (removeOnComplete/removeOnFail)

**Configuração atual:**

```typescript
// Padrão (queue.ts linha 166-167)
removeOnComplete: 100,  // Manter 100 jobs completos
removeOnFail: 50,       // Manter 50 jobs falhos

// Específico por fila
OCR: removeOnComplete: 100
Screenshot: removeOnComplete: 100
LEO Analysis: removeOnComplete: 100
Report Generation: removeOnComplete: 100
Desktop Automation: removeOnComplete: 50  // Menos retenção
Notifications: removeOnComplete: 100
Backup: removeOnComplete: 10  // Poucos backups
Cleanup: removeOnComplete: 5   # Mínima retenção
```

**Avaliação:** ✅ Configuração adequada - balance entre debugging e consumo de memória Redis.

### 3. Rate Limiting

**Configuração padrão (rate-limiter.ts):**

```typescript
DEFAULT_RATE_LIMITS = {
  pedido_create: { maxJobsPerMinute: 30, debounceMs: 500 },
  estoque_update: { maxJobsPerMinute: 60, debounceMs: 200 },
  financeiro_update: { maxJobsPerMinute: 20, debounceMs: 1000 },
  leo_analysis: { maxJobsPerMinute: 10, debounceMs: 2000 },
  ocr_processing: { maxJobsPerMinute: 5, debounceMs: 5000 },
  notifications: { maxJobsPerMinute: 100, debounceMs: 100 },
  backup: { maxJobsPerMinute: 2, debounceMs: 30000 },
  cleanup: { maxJobsPerMinute: 1, debounceMs: 60000 },
  desktop_automation: { maxJobsPerMinute: 3, debounceMs: 10000 },
  screenshot_capture: { maxJobsPerMinute: 10, debounceMs: 1000 },
  report_generation: { maxJobsPerMinute: 5, debounceMs: 5000 },
}
```

**Avaliação:** ✅ Limites bem calibrados por tipo de operação.

**Implementação:** Usa Redis sorted sets para persistência multi-instância.

### 4. Stalled Jobs

**Configuração (worker.ts):**

```typescript
maxStalledCount: 1,
stalledInterval: 30000,  // 30 segundos
```

**Avaliação:** ✅ Configuração adequada - detecta jobs travados rapidamente.

---

## 🔌 INTEGRAÇÕES COM FILAS

### 1. Integração com API

**Arquivo:** `server/services/async-operations.ts`

**Operações suportadas:**
- `processOcr()` - OCR assíncrono
- `captureScreenshot()` - Screenshot assíncrono
- `processLeoAnalysis()` - Análise LEO assíncrona
- `generateReport()` - Geração de relatório assíncrona
- `sendNotification()` - Notificação assíncrona

**Fluxo:**
```
API Request → asyncOperations.service → queueManager.addJob() → BullMQ → Worker
```

### 2. Integração com System Health

**Arquivo:** `server/routers/admin/system-health.ts`

**Métricas expostas:**
```typescript
queues: {
  total: number;
  active: number;
  waiting: number;
  failed: number;
  stats: Record<string, QueueStats>;
}
```

**Endpoint:** `GET /api/admin/system/health`

### 3. Integração com LEO

**Arquivos:**
- `server/leo/tasks/leo-task-queue.ts`
- `server/leo/core/task-queue.ts`

**Uso:** LEO pode enfileirar tarefas para processamento assíncrono.

---

## 📊 TRATAMENTO DE ERROS

### Event Handlers Implementados

**Queue (queue.ts):**
```typescript
queue.on('error', (error: unknown) => {
  logError(`Erro na fila ${name}`, error);
});
```

**Worker (worker.ts):**
```typescript
worker.on('error', (error) => {
  logError(`Erro no ${config.name}`, error);
  this.updateWorkerStats(queueName, 'failed');
});

worker.on('failed', (job, error) => {
  logError(`Job ${job.id} falhou no ${config.name}`, error);
  this.updateWorkerStats(queueName, 'failed');
});

worker.on('stalled', (jobId) => {
  logWarn(`Job ${jobId} stalled no ${config.name}`);
});
```

**Redis (redis.ts):**
```typescript
client.on('connect', () => { /* ... */ });
client.on('ready', () => { /* ... */ });
client.on('error', (error) => { /* ... */ });
client.on('close', () => { /* ... */ });
client.on('reconnecting', (delay) => { /* ... */ });
client.on('end', () => { /* ... */ });
```

**Avaliação:** ✅ Tratamento de erros abrangente com logging estruturado.

### Retry Policies

**BullMQ (queue.ts):**
```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
}
```

**Avaliação:** ✅ Backoff exponencial adequado.

---

## 💾 VAZAMENTOS DE MEMÓRIA/CONEXÕES

### Análise de Mapas e Caches

**Rate Limiter (rate-limiter.ts):**
```typescript
private debounceCache: Map<string, NodeJS.Timeout> = new Map();
private config: Map<string, RateLimitConfig> = new Map();
```

**Risco:** `debounceCache` pode crescer indefinidamente se timeouts não forem limpos.

**Mitigação:**
```typescript
// Cleanup periódico (linha 334)
setInterval(() => {
  jobRateLimiter.cleanup().catch((err) => {
    logger.warn("Cleanup error:", err);
  });
}, 5 * 60 * 1000);  // A cada 5 minutos
```

**Avaliação:** ✅ Cleanup implementado, mas poderia ser mais agressivo.

### Conexões Redis

**Singleton pattern (redis.ts):**
```typescript
class RedisManager {
  private static instance: RedisManager;
  private client: IoredisClient | null = null;
  // ...
}
```

**Avaliação:** ✅ Singleton evita múltiplas conexões.

**Graceful shutdown:**
```typescript
public async disconnect(): Promise<void> {
  if (this.client) {
    if (globalThis.redis === this.client) {
      globalThis.redis = undefined;
    }
    await this.client.quit();
    this.client = null;
  }
}
```

**Avaliação:** ✅ Shutdown adequado com `quit()` (graceful).

---

## 🎯 RECOMENDAÇÕES

### Prioridade ALTA

1. **Padronizar maxRetriesPerRequest**
   - Criar constante centralizada
   - Documentar diferença entre uso regular e BullMQ
   - Adicionar validação de configuração

2. **Implementar fallback para fila em memória**
   - Se Redis indisponível, usar fila local
   - Sincronizar quando Redis voltar
   - Documentar limitações do fallback

3. **Completar implementação de idempotência**
   - Criar tabela `jobExecutionLog`
   - Ativar queries comentadas
   - Adicionar testes de integração

### Prioridade MÉDIA

4. **Melhorar graceful shutdown**
   - Adicionar timeout forçado
   - Implementar kill switch
   - Adicionar métricas de shutdown

5. **Mover debounce para Redis**
   - Manter consistência multi-instância
   - Ou documentar que debounce é local-only

6. **Adicionar monitoramento avançado**
   - Métricas de latência de filas
   - Alertas para filas com muitos jobs stalled
   - Dashboard de saúde do sistema de filas

### Prioridade BAIXA

7. **Otimizar retenção de jobs**
   - Configurar por ambiente (dev vs prod)
   - Adicionar cleanup automático agressivo em dev

8. **Adicionar testes de carga**
   - Testar comportamento com Redis lento
   - Testar comportamento com Redis indisponível
   - Testar graceful shutdown com jobs ativos

---

## 📈 MÉTRICAS SUGERIDAS

### Métricas de Saúde

- **Redis connection latency** - tempo de ping
- **Queue depth** - jobs waiting por fila
- **Worker utilization** - % de capacidade usada
- **Job failure rate** - % de jobs falhando
- **Stalled job count** - jobs travados
- **Redis memory usage** - consumo de memória Redis

### Métricas de Performance

- **Job processing time** - tempo médio por tipo
- **Queue throughput** - jobs/segundo
- **Worker concurrency** - jobs simultâneos
- **Rate limit hit rate** - % de requests bloqueados

---

## ✅ CONCLUSÃO

O sistema de filas BullMQ está **bem arquitetado** e **robusto**, mas possui **dependência crítica de Redis** que deve ser documentada e monitorada. Os principais riscos são:

1. **Dependência de Redis** - sem fallback implementado
2. **Inconsistência de configuração** - maxRetriesPerRequest
3. **Idempotência incompleta** - funcionalidade não ativa

As mitigações existentes (healthcheck, retry, logging) são adequadas, mas **fallback para fila em memória** seria uma adição valiosa para resiliência.

**Status geral:** ⚠️ **SENSÍVEL - FUNCIONAL COM DEPENDÊNCIA CRÍTICA**

---

**Relatório gerado por:** Cascade AI  
**Data:** 26 de abril de 2026  
**Versão:** 1.0
