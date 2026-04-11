# 📐 Architecture Snapshot — PHASE 6 (Hardening Controlado)

**Data:** 8 de Abril de 2026  
**Versão:** Phase 6 Executado  
**Lock:** CONGELADO - sem alterações de estrutura

---

## 📋 Sumário de Componentes Críticos

### **1. Multi-Tenant Hard Guard (FASE 3)**

#### Helper Isolado
- **Arquivo:** `server/utils/tenant-guard.ts`
- **Exports:**
  - `assertTenant(tenantId: string | number | undefined): string | number`
  - `hasTenant(tenantId: string | number | undefined): boolean`

#### Services com Tenant Validação (Client Domain)
| Serviço | Arquivo | Métodos Hardened | Status |
|---------|---------|-----------------|--------|
| ClientService | `server/services/client.service.ts` | `create()`, `update()` | ✅ assertTenant |
| ClientTool | `server/tools/client.tool.ts` | `create()`, `update()` | ✅ Extrai tenantId |

**Regra:** Todas operações críticas (create/update) recebem `tenantId` como parâmetro nominado, não via payload implícito.

---

### **2. Architecture Violation Detector (FASE 4)**

#### Detector Scripts
| Script | Arquivo | Padrões Detectados | Exit |
|--------|---------|----------|------|
| Architecture Check | `scripts/check-architecture.mjs` | DEFAULT_TENANT_ID, TEST_TENANT_ID (fora de /test), SEED_TENANT_ID (fora de seed) | 1 if violation |
| Bad Patterns Check | `scripts/check-bad-patterns.mjs` | @ts-ignore, fallback tenant (\\||), explicit any | 1 if violation |

**Integração:** Ambos rodam em `.husky/pre-commit` como validação HARD BLOCK.

---

### **3. Pre-Commit Hard Block (FASE 5)**

#### .husky/pre-commit Flow
```sh
1️⃣  TypeScript check (global)
   → pnpm exec tsc -p tsconfig.server.json --noEmit
   → EXIT 1 se falhar

2️⃣  Architecture check (tenant violations)
   → node scripts/check-architecture.mjs
   → EXIT 1 se violar

3️⃣  Lint-staged (staged files only)
   → pnpm exec lint-staged --allow-empty
   → WARNING if issues (but auto-fixes where possible)
```

**Garantia:** Commit falha se tsc ou architecture violations retornarem código 1.

---

### **4. Lint-Staged Performance (FASE 6)**

#### .lintstagedrc.json
```json
{
  "*.{ts,tsx}": ["eslint --fix", "eslint --max-warnings 0"],
  "*.{js,jsx,mjs}": ["eslint --fix", "eslint --max-warnings 0"],
  "*.json": ["prettier --write"]
}
```

**Benefício:** ESLint roda apenas em staged files (rápido) + global tsc valida tipos (seguro).

---

### **5. ESLint Hard Lock (FASE 1)**

#### eslint.config.mjs Rules
```javascript
"@typescript-eslint/no-explicit-any": "error"           // Bloqueia new any
"@typescript-eslint/explicit-module-boundary-types": "error"  // Explicit returns
"@typescript-eslint/ban-ts-comment": "error"            // No @ts-ignore
"@typescript-eslint/ban-ts-comment": "error"            // No disable comments
"no-console": "error"                                   // Force logger
"no-throw-literal": "error"                             // Throw Error only
```

**Scope:** server/** (critical paths fully covered)

---

### **6. TypeScript Hardening (FASE 2)**

#### tsconfig.server.json Flags
```json
{
  "strict": true,
  "noImplicitAny": true,
  "noFallthroughCasesInSwitch": true,
  "esModuleInterop": true
}
```

**Note:** `noUncheckedIndexedAccess` **NOT ENABLED** (204 error avalanche) — kept as future debt phase.

---

## 🔐 Contratos Principais

### **Client Service Contract**
```typescript
class ClientService {
  async create(tenantId: string | number, payload: Record<string, unknown>): Promise<...>
  async list(payload: Record<string, unknown>): Promise<...>
  async update(tenantId: string | number, payload: Record<string, unknown>): Promise<...>
}
```

**Invariant:** create/update MUST receive tenantId nominado, else `assertTenant()` throws.

---

### **Architecture Violations (FORBIDDEN)**
```
❌ DEFAULT_TENANT_ID anywhere
❌ TEST_TENANT_ID outside /test/ or *.test.ts
❌ SEED_TENANT_ID outside seed context
❌ tenantId || (fallback pattern)
❌ @ts-ignore comments
❌ Explicit any without /* */ justification
```

---

## 📊 Checklist de Validação

- ✅ tsc --noEmit passes
- ✅ No architecture violations (DEFAULT_TENANT_ID, TEST_TENANT_ID, SEED_TENANT_ID)
- ✅ ESLint hard lock (no explicit any, no console.log in server/)
- ✅ assertTenant() in create/update (client domain)
- ✅ Pre-commit blocks on errors
- ✅ Lint-staged on staged files only

---

## 🚫 PROIBIDO SEM APROVAÇÃO

1. Remover `strict: true` ou `noImplicitAny`
2. Adicionar eslint disable comments
3. Usar DEFAULT_TENANT_ID, TEST_TENANT_ID, SEED_TENANT_ID fora de contexto
4. Usar @ts-ignore
5. Expandir assertTenant para mais de 5 arquivos sem FASE review
6. Adicionar fallback tenant (tenantId ||)
7. Remover pre-commit hooks

---

## 📝 Referências

- **FASE 1:** `eslint.config.mjs`
- **FASE 2:** `tsconfig.server.json`
- **FASE 3:** `server/utils/tenant-guard.ts` + `server/services/client.*` + `server/tools/client.*`
- **FASE 4:** `scripts/check-architecture.mjs` + `scripts/check-bad-patterns.mjs`
- **FASE 5:** `.husky/pre-commit`
- **FASE 6:** `.lintstagedrc.json`

---

**CONGELADO:** 8 de Abril de 2026  
**Deploy Safe:** Yes - All validations passing.
