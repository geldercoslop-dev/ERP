# 🚀 QUICK GUIDE: Endpoints de Resilience em Produção

## 📍 Endpoints Disponíveis

### 1. GET /internal/health (Público)
Verificar se o servidor está operacional (sem detalhes sensíveis)

```bash
# ✅ Teste básico
curl http://localhost:3000/internal/health

# Resposta esperada:
# {
#   "status": "ok"
# }
```

### 2. GET /internal/status (Protegido)
Status completo do sistema: uptime, memória, DB, circuit breakers, taxa de erro

```bash
# ❌ Sem token (devá retornar 401)
curl http://localhost:3000/internal/status

# ✅ Com token no header
curl -H "Authorization: Bearer SEU_INTERNAL_API_TOKEN" \
  http://localhost:3000/internal/status

# ✅ Com token em query param
curl "http://localhost:3000/internal/status?token=SEU_INTERNAL_API_TOKEN"
```

---

## 🔐 Autenticação

### Configurar INTERNAL_API_TOKEN

**Em `.env.production`:**
```env
# Token para acessar /internal/status
INTERNAL_API_TOKEN=seu-token-super-secreto-64-caracteres-aqui!@#$%^&*()
```

**Default (se não configurado):**
```
test-token-12345
```

---

## 📊 Respostas esperadas

### Status OPERATIONAL (Tudo OK)
```json
{
  "status": "operational",
  "timestamp": "2026-03-25T23:59:59Z",
  "uptime": {
    "seconds": 3600,
    "minutes": 60,
    "hours": 1
  },
  "system": {
    "memory": {
      "heapUsed": "45MB",
      "heapTotal": "100MB",
      "heapPercentage": 45,
      "external": "2MB"
    },
    "node": {
      "version": "v20.x.x",
      "platform": "linux",
      "pid": 12345
    }
  },
  "database": {
    "pool": {
      "total": 10,
      "free": 7,
      "used": 3,
      "queued": 0,
      "utilization": 30
    },
    "health": {
      "lastOk": true,
      "lastCheckAt": "2026-03-25T23:59:50Z"
    }
  },
  "circuitBreakers": [
    {
      "name": "db_pool",
      "state": "closed",
      "failures": 0,
      "successes": 45
    }
  ],
  "errorRate": {
    "errors1m": 2,
    "requests1m": 100,
    "percentError1m": 2.0,
    "isAlerting": false
  },
  "responseTime": "5ms"
}
```

### Status DEGRADED (DB Down)
```json
{
  "status": "degraded",
  "timestamp": "2026-03-25T23:59:59Z",
  "circuitBreakers": [
    {
      "name": "db_pool",
      "state": "open",      // ← ABERTO!
      "failures": 5,
      "successes": 45
    }
  ],
  "errorRate": {
    "errors1m": 45,
    "requests1m": 100,
    "percentError1m": 45.0,
    "isAlerting": true      // ← ALERTING!
  },
  "database": {
    "pool": {
      "total": 10,
      "free": 0,
      "used": 10,
      "queued": 15
    },
    "health": {
      "lastOk": false,
      "lastCheckAt": "2026-03-25T23:59:55Z"
    }
  }
}
```

---

## 🔄 Comportamento em Diferentes Cenários

### Cenário 1: DB Respondendo Normalmente
```
GET /internal/status
├─ circuitBreaker.state: "closed"
├─ errorRate.isAlerting: false
├─ database.health.lastOk: true
└─ Resposta: 200 OK (status: operational)
```

### Cenário 2: DB Começando a Falhar
```
GET /internal/status (1ª falha)
├─ circuitBreaker.state: "closed"
├─ circuitBreaker.failures: 1
├─ errorRate.percentError1m: ~10%
└─ Resposta: 200 OK (estado ainda CLOSED)
```

### Cenário 3: Threshold Atingido (3+ falhas)
```
GET /internal/status (3ª falha)
├─ circuitBreaker.state: "open"    ← MUDOU!
├─ circuitBreaker.failures: 3
├─ errorRate.isAlerting: true
├─ Requisições ao DB: BLOQUEADAS (fallback)
└─ Resposta: 200 OK (status: degraded)
```

### Cenário 4: Aguardando Recovery
```
GET /internal/status (após 5s)
├─ circuitBreaker.state: "half_open"  ← TESTANDO!
├─ Próxima requisição ao DB será testada
└─ Se sucesso → state: "closed"
└─ Se falha → state: "open" (restart timeout)
```

### Cenário 5: DB Recuperou
```
GET /internal/status (após sucesso em half_open)
├─ circuitBreaker.state: "closed"     ← RESTAURADO!
├─ circuitBreaker.failures: 0
├─ errorRate.isAlerting: false
├─ Requisições retomadas normalmente
└─ Resposta: 200 OK (status: operational)
```

---

## 📈 Monitoramento

### Prometheus Metrics (Exemplo)
```bash
# Adicionar ao seu scraper Prometheus
http://localhost:3000/metrics

# Métricas disponíveis:
# - app_circuit_breaker_state{name="db_pool"} (0=closed, 1=open, 2=half_open)
# - app_error_rate_percent{window="1m"}
# - app_db_pool_utilization_percent
# - app_memory_heap_percent
```

### Alertas Recomendados

```yaml
# Prometheus alert rules
groups:
  - name: resilience
    rules:
      - alert: CircuitBreakerOpen
        expr: app_circuit_breaker_state{name="db_pool"} == 1
        for: 1m
        annotations:
          summary: "DB Circuit Breaker ABERTO"
          
      - alert: HighErrorRate
        expr: app_error_rate_percent > 5
        for: 5m
        annotations:
          summary: "Taxa de erro acima de 5%"
          
      - alert: HighMemoryUsage
        expr: app_memory_heap_percent > 85
        for: 2m
        annotations:
          summary: "Memória acima de 85%"
```

---

## 🧪 Teste Rápido com cURL

### 1. Verificar Health (Público)
```bash
curl -i http://localhost:3000/internal/health
# HTTP/1.1 200 OK
# {"status":"ok"}
```

### 2. Acessar Status sem Token (Esperado: 401)
```bash
curl -i http://localhost:3000/internal/status
# HTTP/1.1 401 Unauthorized
# {"error":"Unauthorized","message":"Invalid or missing token"}
```

### 3. Acessar Status com Token
```bash
TOKEN="test-token-12345"  # ou seu token real

curl -i -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/internal/status
# HTTP/1.1 200 OK
# {...full status JSON...}
```

### 4. Script Bash para Monitoramento Contínuo
```bash
#!/bin/bash
TOKEN="test-token-12345"
ENDPOINT="http://localhost:3000/internal/status"

while true; do
  response=$(curl -s -H "Authorization: Bearer $TOKEN" $ENDPOINT)
  
  status=$(echo $response | jq '.status')
  cb_state=$(echo $response | jq '.circuitBreakers[0].state')
  error_alerting=$(echo $response | jq '.errorRate.isAlerting')
  
  echo "[$(date)] Status: $status | CB: $cb_state | Alerting: $error_alerting"
  
  sleep 5
done
```

---

## 🎯 Checklist de Configuração

- [ ] Definir `INTERNAL_API_TOKEN` em `.env.production`
- [ ] Testar `/internal/health` (sem token)
- [ ] Testar `/internal/status` (com token)
- [ ] Verificar respostas 401 sem token
- [ ] Configurar Prometheus scraper
- [ ] Setup alertas de circuit breaker
- [ ] Dashboard Grafana com métricas
- [ ] Documentar runbook de incidentes

---

## 📞 Troubleshooting

### Problema: "/internal/status retornando 401"
**Solução:** Verificar se o token está correto
```bash
echo $INTERNAL_API_TOKEN  # verificar valor configurado
```

### Problema: "Circuit Breaker não abre"
**Solução:** Checar se failureThreshold foi atingido
```bash
# Verificar logs
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/internal/status | jq '.circuitBreakers'
```

### Problema: "Error rate muito alto"
**Solução:** Investigar causa
```bash
# 1. Verificar saúde do DB
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/internal/status | jq '.database'

# 2. Verificar memory
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/internal/status | jq '.system.memory'

# 3. Verificar uptime
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/internal/status | jq '.uptime'
```

---

## 📚 Referências Completas

- [Relatório Completo](./RESILIENCE_RUNTIME_VALIDATION_REPORT.md)
- [Resultados JSON](./RESILIENCE_VALIDATION_RESULTS.json)
- [Resumo Executivo](./RESILIENCE_VALIDATION_SUMMARY.txt)

---

**Última atualização:** 25-03-2026  
**Status:** ✅ Validado e Pronto para Produção
