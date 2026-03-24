# Relatório HTTP real (performance)

- **Base:** http://127.0.0.1:3004
- **Quando:** 2026-03-21T11:41:45.039Z

## ✔ Passou
- PEDIDOS: POST concorrente (35 conexões) sem 5xx/timeout

## ❌ Falhou
- (nenhum)

## ⚠ Gargalos / avisos
- (nenhum)

## Concorrência (idempotência pedido)
```json
{}
```

## Financeiro
-

## Autocannon (resumo)
```json
{
  "pedidos": {
    "title": "pedidos.createVenda (35 conn)",
    "requests": 105,
    "throughput": 9730.8,
    "latency": {
      "mean": 3771.65,
      "p50": 2042,
      "p99": 8159,
      "max": 8203
    },
    "timeouts": 0,
    "statusCodeStats": {
      "200": {
        "count": 105
      }
    }
  }
}
```

### Critérios
- Sem erro 500 nos cenários exercitados
- Sem timeout (ajustar HTTP_PERF_DURATION / conexões)
- Latência: ver média/p99 no JSON
- Auth: header **X-Session-Token** após login (igual ao client SPA)
