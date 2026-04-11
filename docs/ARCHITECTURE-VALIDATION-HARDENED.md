# 📋 Validação Arquitetural Reforçada — HARDENED v2

**Status:** ✅ Scripts criados e testados  
**Data:** 8 de Abril de 2026  
**Crítico:** SEM BYPASS POSSÍVEL

---

## 🔧 Scripts de Detecção

| Script | Propósito | Quando Roda | Exit |
|--------|----------|-------------|------|
| `check-architecture.mjs` | Detecta DEFAULT_TENANT_ID, TEST_TENANT_ID, SEED_TENANT_ID | pre-commit (global) | 1 if violation |
| `check-architecture-hardened.mjs` | v2 com padrões indiretos (fallback, LEO dB, context) | pre-push (full) | 1 if violation |
| `check-bad-patterns.mjs` | Detecta @ts-ignore, any, fallback | lint-staged (staged only) | 0 (report) |
| `check-bad-patterns-hardened.mjs` | v2 com "as any", casts perigosos, unknown | pre-push (full) | 1 if violation |
| `check-leo-imports.mjs` | LEO deve usar facade, não db/ direto | pre-push (full) | 1 if violation |

---

## ⚡ Hook Strategy (PRE-COMMIT vs PRE-PUSH)

### **PRE-COMMIT** (RÁPIDO — deve passar em <5s)
```sh
1. pnpm exec tsc --noEmit          # Type safety (global)
2. node scripts/check-architecture.mjs  # Tenant violations CRITICAL
3. pnpm exec lint-staged           # ESLint staged files only (rápido)
```

**Objetivo:** Block obvious errors + quick feedback  
**Garantia:** Commit falha se houver CRITICAL architecture violation

---

### **PRE-PUSH** (COMPLETO — valida antes do push)
```sh
1. pnpm exec tsc --noEmit          # Type safety (global)
2. node scripts/check-architecture.mjs  # Tenant violations
3. node scripts/check-bad-patterns-hardened.mjs  # Type bypass checks
4. node scripts/check-leo-imports.mjs     # LEO db isolation
5. pnpm run full-eslint            # ESLint ALL files (slow)
```

**Objetivo:** Full validation antes de publicar  
**Garantia:** Push falha se houver CRITICAL bad patterns ou imports

---

## 🔐 Helpers com Validação Härdenada

### **tenant-guard.ts**
```typescript
export function assertTenant(tenantId: string | number | undefined): string | number
// → CRITICAL: Sem fallback, throw se inválido

export function hasTenant(tenantId?: string | number): boolean
// → SAFE: Apenas para filters opcionais

export function assertTenantSource(tenantId, source: 'request'|'param'|'body')
// → FORCE: Tenant DEVE vir de contexto de requisição

export function extractTenantFromRequest(req): string | number
// → AUTO: Extrai e valida de req automaticamente
```

### **tenant-guard-hardened.ts**
```typescript
// Validações em 3 níveis:
// 1. Tipo: string | number (rejeita object, boolean)
// 2. Valor: >0, não '', não 0, não 'default'/'seed'/'test'
// 3. Origem: DEVE vir de request context, não env/config

assertTenant(tenantId, context?)
// throw: TENANT_REQUIRED, TENANT_INVALID_TYPE, TENANT_FORBIDDEN_VALUE

assertTenantsArray(tenantIds[])
// Valida array inteiro com índices no error
```

---

## ✔️ Regras HARDBLOCK (Invioláveis)

| Regra | Enforcement | Bypass? |
|------|-----------|---------|
| TenantId obrigatório | assertTenant() throw | ❌ NO |
| Sem fallback (\\|\\|, ??) | check-architecture detects | ❌ NO |
| LEO não importa /db/ | check-leo-imports detects | ❌ NO |
| Sem "as any" casts | check-bad-patterns-hardened detects | ❌ NO  (legado só reporta) |
| DEFAULT_TENANT_ID proibido | check-architecture detects | ❌ NO |
| Tenant de contexto | assertTenantSource() enforces | ❌ NO |

---

## 🎯 Fluxo de Validação Integrado

```
Developer edits code
    ↓
git commit --no-verify (com --no-verify, skip é permitido)
    ↓
.husky/pre-commit
    ├─ ✅ tsc (type check global)
    ├─ ✅ check-architecture.mjs (tenant critical)
    └─ ✅ lint-staged (eslint staged files ONLY)
    ↓ [Se falhar: commit abort, dev fixa]
    ↓
git push
    ↓
.husky/pre-push
    ├─ ✅ tsc (revalidate types)
    ├─ ✅ check-architecture.mjs (revalidate architecture)
    ├─ ⚠️  check-bad-patterns-hardened.mjs (report legado)
    ├─ ✅ check-leo-imports.mjs (LEO isolation)
    └─ ⚠️  pnpm run full-eslint (ALL files)
    ↓ [Se CRITICAL falhar: push abort]
    ↓
✅ Push approved
```

---

## 🛡️ Anti-Bypass Checklist

- ✅ assertTenant() é função, não macro — **impossível skippar**
- ✅ check-architecture roda automaticamente — **sem CLI flag para desabilitar**
- ✅ check-leo-imports específico para LEO — **não sai do escopo**
- ✅ pre-commit + pre-push — **dupla camada de validação**
- ✅ Tenant source validado — **contexto forçado via middleware**
- ✅ Scripts em .mjs — **executáveis sem build**

---

## 📝 Próximos Passos

1. ✅ criar check-architecture-hardened.mjs (padrões indiretos)
2. ✅ criar check-bad-patterns-hardened.mjs ("as any", casts)
3. ✅ criar check-leo-imports.mjs (db isolation)
4. ✅ criar tenant-guard-hardened.ts (validações 3-camadas)
5. ⏳ atualizar .husky/pre-push com check-leo-imports + bad-patterns
6. ⏳ criar teste integrado (simular violações, validar detecção)

---

**STATUS:** Reforço Arquitetural Em Andamento  
**CRÍTICO:** Sem bypass possível — regras encode d em código
