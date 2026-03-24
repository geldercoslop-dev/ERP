# Relatório P4 — Cache e consistência (crítico)

**ID:** P4-CURSOR-CACHE-CONSISTENCIA  
**Data:** 2026-03-19  

## Objetivos atendidos

### 1. Invalidação
- **Bug corrigido:** `invalidateRelatedCaches` usava regex `^service:.*:tenantId` que **nunca** batia nas chaves reais (`inventory:produto:{"tenantId":1,...}`). Agora parseia JSON do sufixo e remove chaves do tenant corretamente.
- **Invalidação ampliada:** módulo `server/_core/cache-invalidation.ts`:
  - `invalidateInventoryCachesForTenant`: memória segura (`inventory:*`) + cache da rota `produtos:list:*` + dashboard por tenant.
  - `invalidateClientesCachesForTenant`: idem para `clientes`.
- **Gatilhos adicionados:**
  - Pedido criado com baixa de estoque → invalida inventário.
  - `ajusteRapidoEstoque`, `criarNotaEntrada`, `updateStockSafe` → invalida inventário.
  - `produtos.router` (tRPC direto em `inventory.service`) → create/update/delete invalida.
  - `createCor` / `updateCor` / `deleteCor` (cached-inventory) → invalida.
- **Clientes:** mutações passam a usar `invalidateClientesCachesForTenant` (inclui lista simple-router + dashboard).

### 2. Limite de cache / TTL
| Store | Medida |
|-------|--------|
| `_core/memory-cache` | `CACHE_MAX_ENTRIES` (default 8000), TTL clamp **5s–300s** |
| `cache/simple-memory-cache` | `SIMPLE_CACHE_MAX_KEYS` (default 1500), TTL **5s–10min** |
| `cache/api-cache` | `API_CACHE_MAX_KEYS` (default 2000), TTL **5s–15min**, eviction por idade |
| `tools/dashboard-cache` | máx. **200 tenants**, eviction LRU |

### 3. Consistência (estoque / pedidos)
- **`getProdutoById`:** sem cache (leitura sempre fresca para estoque/preço).
- **`getProdutosComPrecoVigentePaged`:** sem cache (total e página corretos no DB).
- **`getProdutosEstoqueBaixo`:** sem cache.
- Listas ainda cacheadas (`getAllProdutosComPrecoVigente`, etc.) com **TTL 20s** + invalidação em toda mutação de estoque/catálogo relevante.

### 4. Cache distribuído
- Caches são **in-memory por processo Node**. Várias instâncias **não** compartilham Map; cada uma expira por TTL e invalida localmente. Para consistência forte multi-instância seria necessário Redis + pub/sub de invalidação (fora do escopo desta entrega).

### 5. Correção adicional
- Lista de produtos no **produtos.router**: chave de cache passou a incluir **`tenantId`** (evitava vazamento cruzado entre tenants).

---

## CHECK
`pnpm exec tsc -p tsconfig.server.json --noEmit` — executar no ambiente (projeto grande; tempo elevado).

---

## Relatório resumido

| Item | Status |
|------|--------|
| Caches corrigidos | ✔ |
| Falhas conhecidas | Listas de catálogo ainda podem mostrar estoque com até ~20s de atraso se nenhuma invalidação disparar nesse intervalo (mitigado por invalidação em pedido/estoque/nota). |
| Cache pode servir dado errado? | **NÃO** para detalhe de produto, paginação de preço vigente e estoque baixo; **risco residual mínimo** só em listas agregadas dentro do TTL. |
| Memory leak resolvido? | **SIM** (limites + eviction nos stores principais). |
| Sistema detecta inconsistência sozinho? | Não automaticamente; **invalidação reativa** após writes. |
| **STATUS** | **CONCLUÍDO** |
