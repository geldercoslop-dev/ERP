# INFRASTRUCTURE RULES

## PROPÓSITO
Definir regras imutáveis de infraestrutura para proteger o core do sistema enquanto permite evolução livre de features não-críticas.

## PRINCÍPIO FUNDAMENTAL
- **Produção = rigor máximo (fail-hard)**
- **Desenvolvimento = flexível (fail-soft)**
- **CI/Pre-commit = híbrido inteligente**
- **Nenhuma regra pode travar evolução de features (UI, dashboard, LEO evolution)**

---

## REGRAS IMUTÁVEIS (CORE)

### 1. REDIS - PROTEÇÃO DO CORE

**OBRIGATÓRIO:**
- ✅ Redis NUNCA pode ser removido do core do sistema
- ✅ Redis deve estar disponível em produção (fail-hard)
- ✅ Filas BullMQ dependem de Redis
- ✅ Rate limiting distribuído depende de Redis
- ✅ Cache distribuído depende de Redis

**PERMITIDO:**
- ✅ Redis pode ser ignorado em desenvolvimento (fail-soft)
- ✅ Redis pode ser opcional em CI (controlado por CI_REDIS_REQUIRED)
- ✅ Sistema deve operar sem Redis em DEV (fallback para in-memory)

**PROIBIDO:**
- ❌ Remover dependência de Redis do core
- ❌ Criar camada paralela de Redis
- ❌ Substituir Redis por outra tecnologia sem migração controlada
- ❌ Bypass de validação de Redis em produção

**IMPLEMENTAÇÃO:**
- `server/_core/env/runtimeContext.ts` - Detecta contexto
- `server/_core/env/infraGuard.ts` - Valida Redis context-aware
- `scripts/verify-redis.ts` - Validação context-aware

---

### 2. MYSQL - PROTEÇÃO DO CORE

**OBRIGATÓRIO:**
- ✅ MySQL NUNCA pode ser removido do core do sistema
- ✅ Schema Drizzle é contrato de domínio (imutável)
- ✅ Migrations são controladas via Drizzle
- ✅ Introspect automático é PROIBIDO

**PERMITIDO:**
- ✅ MySQL pode ser opcional em desenvolvimento (para testes unitários)
- ✅ Sistema deve ter fallback para testes sem DB

**PROIBIDO:**
- ❌ Remover dependência de MySQL do core
- ❌ Usar introspect para gerar schema automaticamente
- ❌ Sobrescrever schema.ts automaticamente
- ❌ Criar migrations sem revisão
- ❌ Alterar schema de produção sem migration

**IMPLEMENTAÇÃO:**
- `drizzle/schema.ts` - Contrato de domínio
- `drizzle/migrations/` - Migrations controladas
- `scripts/db/drizzle-wrapper.mjs` - Wrapper seguro

---

### 3. EXECUTION GATE - PROTEÇÃO DO CORE

**OBRIGATÓRIO:**
- ✅ ExecutionGate NUNCA pode ser bypassado
- ✅ Phase 0 Guard deve sempre rodar
- ✅ Arquitetura deve ser validada em cada commit
- ✅ Type safety deve ser mantida (tsc --noEmit)

**PERMITIDO:**
- ✅ ExecutionGate pode ter validações context-aware
- ✅ Phase 0 pode ter exceções documentadas

**PROIBIDO:**
- ❌ Bypass de ExecutionGate
- ❌ Desabilitar Phase 0 Guard
- ❌ Commit com erros de TypeScript
- ❌ Alterar arquitetura sem revisão

**IMPLEMENTAÇÃO:**
- `scripts/verify-architecture.ts` - Validação de arquitetura
- `scripts/execution-bypass-detector.ts` - Detecção de bypass
- `.husky/pre-commit` - Gate obrigatório

---

### 4. ENVIRONMENT - PROTEÇÃO DO CORE

**OBRIGATÓRIO:**
- ✅ ENV loading deve ter único ponto (bootstrapEnv.ts)
- ✅ Secrets devem ter mínimo 128 caracteres em produção
- ✅ Produção não pode usar arquivo .env
- ✅ ENV deve ser validado no boot (fail-fast)

**PERMITIDO:**
- ✅ Desenvolvimento pode usar .env local
- ✅ CI pode ter variáveis específicas

**PROIBIDO:**
- ❌ Múltiplos pontos de ENV loading
- ❌ Chamar dotenv.config() diretamente
- ❌ Usar .env em produção
- ❌ Secrets fracos em produção

**IMPLEMENTAÇÃO:**
- `server/_core/env/bootstrapEnv.ts` - Único ponto de loading
- `server/_core/env/ENV_RULES.md` - Regras de ENV
- `server/config/env.ts` - Validação de ENV

---

## GARANTIAS DE EVOLUÇÃO (LIBERDADE)

### 1. EVOLUÇÃO PERMITIDA LIVREMENTE

**DASHBOARDS:**
- ✅ Criar novos dashboards
- ✅ Modificar dashboards existentes
- ✅ Adicionar métricas e visualizações
- ✅ Sem validação de infraestrutura

**UI/UX:**
- ✅ Criar novas páginas
- ✅ Modificar componentes
- ✅ Alterar layouts
- ✅ Adicionar features de UX
- ✅ Sem validação de infraestrutura

**MONITORING:**
- ✅ Adicionar novos monitores
- ✅ Criar alertas customizados
- ✅ Adicionar logs e tracing
- ✅ Sem validação de infraestrutura

**ANALYTICS:**
- ✅ Criar relatórios
- ✅ Adicionar analytics
- ✅ Criar dashboards de analytics
- ✅ Sem validação de infraestrutura

**LEO EVOLUTION:**
- ✅ Evoluir LEO AI
- ✅ Adicionar novos tools do LEO
- ✅ Modificar learning engine
- ✅ Criar novas features de LEO
- ✅ Sem validação de infraestrutura

---

### 2. EVOLUÇÃO PROIBIDA (CORE)

**CORE DE EXECUÇÃO:**
- ❌ Alterar core de execução sem revisão
- ❌ Modificar bootstrap sem revisão
- ❌ Alterar arquitetura sem revisão
- ❌ Bypass de gates de segurança

**DUPLICAÇÃO DE INFRA:**
- ❌ Criar nova camada de Redis
- ❌ Criar nova camada de MySQL
- ❌ Criar novo registry
- ❌ Criar novo sistema de filas

**NOVOS GATES PARALELOS:**
- ❌ Criar gates paralelos ao ExecutionGate
- ❌ Criar validações duplicadas
- ❌ Bypass de gates existentes

**REGRESSÃO DE SCHEMA:**
- ❌ Alterar schema sem migration
- ❌ Sobrescrever schema automaticamente
- ❌ Remover campos sem migration
- ❌ Alterar tipos sem migration

---

## CONTEXT-AWARE VALIDATION

### 1. RUNTIME CONTEXT

**Detecção Automática:**
- `development` - NODE_ENV=development (fail-soft)
- `production` - NODE_ENV=production (fail-hard)
- `ci` - CI=true (híbrido inteligente)

**Implementação:**
- `server/_core/env/runtimeContext.ts` - `detectRuntimeContext()`

### 2. INFRA GUARD

**Validação Context-Aware:**
- Development: Warning apenas, não bloqueia
- Production: Fail-hard, bloqueia se falhar
- CI: Controlado por flags (CI_REDIS_REQUIRED, etc)

**Implementação:**
- `server/_core/env/infraGuard.ts` - `assertInfraRequirement()`

### 3. PRE-COMMIT

**Comportamento:**
- Local development: Fail-soft (permite commit sem Redis)
- CI: Híbrido (controlado por flags)
- Production: Fail-hard (bloqueia se infra falhar)

**Implementação:**
- `.husky/pre-commit` - Gate context-aware

---

## VALIDAÇÃO

### 1. COMANDOS OBRIGATÓRIOS

```bash
# TypeScript
npx tsc --noEmit

# Verificação base
pnpm verify:base

# Geração de DB
pnpm db:generate
```

### 2. CRITÉRIOS DE SUCESSO

**INFRASTRUCTURE:**
- ✅ Commit funciona em DEV sem Redis ativo
- ✅ Produção continua 100% rígida
- ✅ CI tem comportamento previsível
- ✅ Não há bloqueio falso de desenvolvimento
- ✅ Core permanece protegido

**EVOLUÇÃO:**
- ✅ Dashboards podem evoluir livremente
- ✅ UI pode evoluir livremente
- ✅ Monitoring pode evoluir livremente
- ✅ Analytics podem evoluir livremente
- ✅ LEO evolution pode evoluir livremente

### 3. CRITÉRIOS DE FALHA

**INFRASTRUCTURE:**
- ❌ Bloqueio de DEV por infra local
- ❌ Bypass de ExecutionGate
- ❌ Duplicação de Redis layer
- ❌ Regressão em schema ou registry

**EVOLUÇÃO:**
- ❌ Bloqueio de evolução de features
- ❌ Trava de desenvolvimento por infra
- ❌ Impedimento de criar dashboards
- ❌ Impedimento de evoluir LEO

---

## MANUTENÇÃO

### 1. ADICIONANDO NOVA VALIDAÇÃO

1. Usar `runtimeContext.ts` para detectar contexto
2. Usar `infraGuard.ts` para validação context-aware
3. NUNCA bloquear DEV sem motivo crítico
4. SEMPRE documentar exceções

### 2. MODIFICANDO CORE

1. Criar issue descrevendo mudança
2. Obter aprovação de arquiteto
3. Implementar com testes
4. Validar com npx tsc --noEmit
5. Validar com pnpm verify:base
6. Validar com pnpm db:generate

### 3. EVOLUINDO FEATURES

1. Criar branch de feature
2. Desenvolver livremente (sem validação de infra)
3. Commit normalmente (pre-commit não bloqueia)
4. Merge após revisão

---

## REFERÊNCIA

- Runtime context: `server/_core/env/runtimeContext.ts`
- Infra guard: `server/_core/env/infraGuard.ts`
- ENV rules: `server/_core/env/ENV_RULES.md`
- Redis validation: `scripts/verify-redis.ts`
- Pre-commit: `.husky/pre-commit`

---

**ÚLTIMA ATUALIZAÇÃO**: 2026-04-26
**STATUS**: ✅ ATIVO E OBRIGATÓRIO
**VERSÃO**: 1.0.0
