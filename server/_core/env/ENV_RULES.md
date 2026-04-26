# ENV BOOTSTRAP RULES

## PROPÓSITO
Centralizar o carregamento de variáveis de ambiente em um único ponto confiável, eliminando chamadas duplicadas de dotenv/loadEnv em scripts, server e ferramentas de verificação.

## REGRAS OBRIGATÓRIAS

### 1. ÚNICO PONTO DE CARREGAMENTO
- **ÚNICO arquivo autorizado**: `server/_core/env/bootstrapEnv.ts`
- **ÚNICA função autorizada**: `initEnv()`
- **NENHUM outro local** deve chamar `dotenv.config()` diretamente

### 2. PROIBIÇÕES ESTRICTAS
❌ **PROIBIDO**: Importar `loadEnv` de `server/_core/loadEnv.ts`
❌ **PROIBIDO**: Chamar `dotenv.config()` diretamente em qualquer arquivo
❌ **PROIBIDO**: Criar novos loaders de ENV
❌ **PROIBIDO**: Carregar ENV no import-time (side effects)

### 3. OBRIGATÓRIO
✔ **OBRIGATÓRIO**: Usar `initEnv()` de `server/_core/env/bootstrapEnv.ts`
✔ **OBRIGATÓRIO**: Chamar `initEnv()` explicitamente antes de validações
✔ **OBRIGATÓRIO**: Nenhum código deve acessar ENV antes de `initEnv()`

### 4. PADRÃO DE USO

#### Scripts de verificação
```typescript
#!/usr/bin/env tsx
import { initEnv } from "../server/_core/env/bootstrapEnv";

// Carrega ENV antes de qualquer validação
initEnv();

// Resto do código...
```

#### Server entrypoint
```typescript
// bootstrap.ts já chama initEnv() internamente
// server/_core/index.ts chama bootstrapServer()
// NENHUMA chamada direta de ENV loading no entrypoint
```

#### Scripts com import dinâmico
```typescript
async function main() {
  const { initEnv } = await import("../_core/env/bootstrapEnv.js");
  initEnv();
  // ...
}
```

### 5. ARQUITETURA

```
server/_core/env/bootstrapEnv.ts (ÚNICO PONTO)
    ↓
    initEnv()
    ↓
    ├── scripts/verify-base.ts
    ├── scripts/verify-redis.ts
    ├── scripts/verify-mysql.ts
    ├── server/_core/bootstrap.ts
    ├── server/worker.ts
    ├── server/scripts/*.ts
    └── server/tests/*.ts
```

### 6. ENFORCEMENT

#### Pre-commit hook
O pre-commit deve verificar:
- Nenhum arquivo importando de `loadEnv.ts` (exceto bootstrapEnv.ts)
- Nenhum arquivo chamando `dotenv.config()`
- Todos os scripts usando `initEnv()`

#### Phase 0 Guard
O Phase 0 Guard deve validar:
- Único ponto de ENV loading
- Nenhuma duplicação de dotenv
- Conformidade com ENV_RULES.md

### 7. MIGRAÇÃO

#### Arquivos migrados
- ✅ `scripts/verify-base.ts`
- ✅ `scripts/verify-redis.ts`
- ✅ `scripts/verify-mysql.ts`
- ✅ `server/_core/bootstrap.ts`
- ✅ `server/worker.ts`
- ✅ `server/scripts/health-check.ts`
- ✅ `server/scripts/run-migrate.ts`
- ✅ `server/scripts/check-infra.ts`
- ✅ `server/scripts/seed-massa-teste.ts`
- ✅ `server/scripts/validate-idempotency-table.ts`
- ✅ `server/scripts/verify-system-checks.ts`
- ✅ `server/scripts/backup-db.ts`
- ✅ `server/scripts/restore-db.ts`
- ✅ `server/tests/concurrency-test.ts`
- ✅ `server/tests/orchestrator-consistency.ts`
- ✅ `server/tests/run-core-tests.ts`
- ✅ `scripts/security-attack-test.ts`
- ✅ `scripts/maintenance/cleanup-idempotency.ts`

#### Arquivo legado (mantido para compatibilidade)
- `server/_core/loadEnv.ts` - mantido mas NÃO deve ser usado em novos códigos
- Apenas `bootstrapEnv.ts` deve importar de `loadEnv.ts` (se necessário)

### 8. VALIDAÇÃO

#### Comandos de validação
```bash
# TypeScript
npx tsc --noEmit

# Verificação base
pnpm verify:base

# Geração de DB
pnpm db:generate
```

#### Critérios de sucesso
- ✅ 1 único bootstrap de ENV no sistema
- ✅ Server e scripts usam mesma origem de ENV
- ✅ Zero duplicação de dotenv/loadEnv
- ✅ Pre-commit sem dependência quebrada
- ✅ Redis/MySQL sempre carregados corretamente

#### Critérios de falha
❌ Múltiplos loadEnv espalhados
❌ Scripts com dotenv direto
❌ ENV divergente entre server e CLI
❌ Fallback implícito de ENV

### 9. MANUTENÇÃO

#### Adicionando novo script
1. Importar `initEnv` de `server/_core/env/bootstrapEnv`
2. Chamar `initEnv()` no topo do arquivo
3. NUNCA importar de `loadEnv.ts`
4. NUNCA chamar `dotenv.config()`

#### Modificando server entrypoint
1. Usar `bootstrapServer()` (já chama `initEnv()` internamente)
2. NUNCA chamar ENV loading direto no entrypoint
3. Todas as inicializações críticas passam por bootstrap

### 10. REFERÊNCIA

- Bootstrap único: `server/_core/env/bootstrapEnv.ts`
- Regras deste arquivo: `server/_core/env/ENV_RULES.md`
- Server bootstrap: `server/_core/bootstrap.ts`
- Server entrypoint: `server/_core/index.ts`

---

**ÚLTIMA ATUALIZAÇÃO**: 2026-04-26
**STATUS**: ✅ ATIVO E OBRIGATÓRIO
