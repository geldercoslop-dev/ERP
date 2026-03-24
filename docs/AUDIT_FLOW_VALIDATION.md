# AUDIT: LEO→TOOLS→SERVICES FLOW VALIDATION

**Data:** 18/03/2026, 19:49:58

## 📊 RESUMO EXECUTIVO

| Layer | Arquivos | Com Zod | Com tenantId | Status |
|-------|----------|---------|---------|--------|
| Routers | 14 | 13 | 9 | ⚠️ |
| LEO | 4 | 0 | 0 | ⚠️ |

## 🔴 CRÍTICOS (Sem validação Zod)

### ROUTERS

❌ **leo-insights.ts**
- ❌ Não usa tRPC
- ⚠️ Sem validação Zod
- ⚠️ Sem validação tenantId

### LEO

❌ **index.ts**
- ❌ Não usa tRPC
- ⚠️ Sem validação Zod
- ⚠️ Sem validação tenantId

❌ **leo-temp-cleanup.ts**
- ❌ Não usa tRPC
- ⚠️ Sem validação Zod
- ⚠️ Sem validação tenantId

❌ **leo-watchdog.ts**
- ❌ Não usa tRPC
- ⚠️ Sem validação Zod
- ⚠️ Sem validação tenantId

❌ **types.ts**
- ❌ Não usa tRPC
- ⚠️ Sem validação Zod
- ⚠️ Sem validação tenantId


## ✅ BOM (Com validação completa)

### ROUTERS
✓ clientes.router.ts
✓ clientes.ts
✓ financeiro.router.ts
✓ leo-api.ts
✓ leo.router.ts
✓ leo.ts
✓ logistica.ts
✓ produtos.router.ts
✓ produtos.ts


## 📋 MAPA DE FLUXO ESPERADO

```
USER REQUEST
    ↓
ROUTER (tRPC endpoint)
    ├─ Validar input com ZOD ✓
    ├─ Validar tenantId ✓
    ↓
TOOLS / LEO Agent
    ├─ Processar lógica
    ├─ Orquestrar serviços
    ↓
SERVICES
    ├─ Receber dados já validados
    ├─ Garantir tenantId check ✓
    └─ Executar lógica de negócio
```

## 🎯 RECOMENDAÇÕES

1. **Para cada Router:**
   - [ ] Sempre use `.input(z.object({ ... }))` para validar entrada
   - [ ] Sempre valide tenantId com `requireTenant(ctx)`
   - [ ] Nunca passe dados não-validados ao Service

2. **Para cada Service:**
   - [ ] Sempre valide tenantId como PRIMEIRA ação
   - [ ] Não confie em Type Hints do TypeScript para validação
   - [ ] Use `Payload = Record<string, unknown>` ao invés de `any`

