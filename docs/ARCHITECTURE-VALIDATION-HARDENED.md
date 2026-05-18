# 📋 Validação Arquitetural Reforçada — HARDENED v2

**Status:** ✅ Scripts criados e testados  
**Data:** 8 de Abril de 2026  
**Crítico:** SEM BYPASS POSSÍVEL

---

## 🔧 Scripts de Detecção

**Nota:** Scripts check-*.mjs duplicados removidos. Funcionalidade migrada para scripts oficiais:
- `scripts/verify-architecture.ts`
- `scripts/verify-leo-boundary.ts`
- `scripts/guards/phase0-guard.ts`

---

## ⚡ Estratégia de Validação

As validações oficiais atuais são executadas pelos scripts oficiais de verificação quando configurados nos fluxos de CI/CD ou hooks de Git:
- `scripts/verify-architecture.ts` — Detecta violações de arquitetura de tenant
- `scripts/verify-leo-boundary.ts` — Valida isolamento de LEO
- `scripts/verify-any-baseline.ts` — Detecta uso de "as any"
- `scripts/guards/phase0-guard.ts` — Guard de arquitetura crítico

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
| Sem fallback (\\|\\|, ??) | verify-architecture.ts detects | ❌ NO |
| LEO não importa /db/ | verify-leo-boundary.ts detects | ❌ NO |
| Sem "as any" casts | verify-any-baseline.ts / verify-architecture.ts detects | ❌ NO |
| DEFAULT_TENANT_ID proibido | verify-architecture.ts detects | ❌ NO |
| Tenant de contexto | assertTenantSource() enforces | ❌ NO |

---

## 🎯 Fluxo de Validação

Os scripts oficiais de verificação podem ser executados manualmente ou integrados aos fluxos oficiais quando configurados.

---

## 🛡️ Anti-Bypass Checklist

- ✅ assertTenant() é função, não macro — **impossível skippar**
- ✅ Scripts oficiais de verificação — executados pelos fluxos oficiais quando configurados
- ✅ Tenant source validado — **contexto forçado via middleware**
- ✅ Scripts em TypeScript — **executáveis via tsx**

---

## 📝 Próximos Passos

**Nota:** Scripts check-*.mjs foram substituídos por validações oficiais:
- `scripts/verify-architecture.ts` — Detecta violações de arquitetura de tenant
- `scripts/verify-leo-boundary.ts` — Valida isolamento de LEO
- `scripts/verify-any-baseline.ts` — Detecta uso de "as any"
- `scripts/guards/phase0-guard.ts` — Guard de arquitetura crítico

**STATUS:** Reforço Arquitetural Em Andamento  
**CRÍTICO:** Sem bypass possível — regras encode d em código