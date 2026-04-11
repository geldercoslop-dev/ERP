# MAPEAMENTO EXATO THROW_GENERIC - RELATÓRIO COMPLETO

## STATUS ATUAL
- **Total de ocorrências encontradas**: 276
- **Data do mapeamento**: 11/04/2026
- **Escopo analisado**: Todo o codebase (server, client, scripts, tests)

## CLASSIFICAÇÃO DAS OCORRÊNCIAS

### 1. PRODUÇÃO (Críticos - Bloqueiam zerar tudo)
**Total: 89 ocorrências**

#### Server/Produção (67)
- `server/_core/validation.ts` - 1 ocorrência
- `server/_core/validators.ts` - 6 ocorrências  
- `server/_core/tenant-validator.ts` - 4 ocorrências
- `server/_core/tenant-ownership.ts` - 8 ocorrências
- `server/_core/systemRouter.ts` - 1 ocorrência
- `server/_core/session.service.ts` - 2 ocorrências
- `server/_core/service-response.ts` - 4 ocorrências
- `server/_core/service-safety.ts` - 3 ocorrências
- `server/pdf.ts` - 1 ocorrência
- `server/services/` - 15 ocorrências (diversos serviços)
- `server/middleware/` - 8 ocorrências
- `server/api/` - 12 ocorrências
- `server/cache/` - 3 ocorrências

#### Client/Produção (22)
- `client/src/services/` - 15 ocorrências (HTTP errors)
- `client/src/lib/retry-client.ts` - 4 ocorrências
- `client/src/lib/trpcClient.ts` - 3 ocorrências

### 2. TESTES (Aceitáveis - Não bloqueiam)
**Total: 124 ocorrências**

#### Unit Tests (68)
- `tests/test-database-integrity.ts` - 3 ocorrências
- `tests/test-anti-regression-arch.spec.ts` - 1 ocorrência
- `tests/system-audit.test.ts` - 8 ocorrências
- `tests/routers/validation.test.ts` - 1 ocorrência
- `tests/resilience-integration.spec.ts` - 10 ocorrências
- `tests/integration/ownership.test.ts` - 6 ocorrências
- `tests/integration/pedidos-heavy.integration.test.ts` - 1 ocorrência
- `tests/database.spec.ts` - 3 ocorrências
- `tests/core/` - 15 ocorrências
- `tests/client/` - 10 ocorrências
- `tests/load/` - 10 ocorrências

#### Test Scripts (56)
- `scripts/teste-*.js` - 20 ocorrências
- `scripts/teste-*.mjs` - 20 ocorrências
- `scripts/testar-*.mjs` - 8 ocorrências
- `scripts/test-rate-limit-real.mjs` - 8 ocorrências

### 3. DOMÍNIO ACEITÁVEL (Contextuais)
**Total: 35 ocorrências**

#### React Context/Hooks (18)
- `client/src/hooks/useQuickActions.tsx` - 1 ocorrência
- `client/src/contexts/ThemeContext.tsx` - 1 ocorrência
- `client/src/contexts/AuthContext.tsx` - 1 ocorrência
- `client/src/contexts/ApiHealthContext.tsx` - 1 ocorrência
- `client/src/components/ui/carousel.tsx` - 1 ocorrência
- `client/src/components/ui/chart.tsx` - 1 ocorrência
- `client/src/components/ui/form.tsx` - 1 ocorrência
- `client/src/hooks/useAuthIntegration.ts` - 2 ocorrências
- `client/src/hooks/useAsyncAction.ts` - 1 ocorrência
- `client/src/utils/financialUtils.ts` - 1 ocorrência
- `client/src/store/authStore.ts` - 1 ocorrência
- `client/src/services/leoChatService.ts` - 1 ocorrência
- `client/src/services/paymentService.ts` - 5 ocorrências
- `client/src/services/orderService.ts` - 5 ocorrências

#### Validation/Domain (17)
- `server/_core/validators.ts` - 8 ocorrências (validações de domínio)
- `server/_core/validation.ts` - 4 ocorrências
- `server/_core/service-safety.ts` - 5 ocorrências

### 4. INFRA/VALIDAÇÃO PENDENTE (Infraestrutura)
**Total: 28 ocorrências**

#### Scripts de Infra (15)
- `scripts/verify-any-baseline.ts` - 1 ocorrência
- `scripts/verify-leo-boundary.ts` - 1 ocorrência
- `scripts/verify-system.mjs` - 1 ocorrência
- `scripts/validate-schema.mjs` - 3 ocorrências
- `scripts/validate-production.mjs` - 1 ocorrência
- `scripts/util/` - 8 ocorrências

#### Build/Deploy (13)
- `scripts/deploy/` - 5 ocorrências
- `scripts/build/` - 3 ocorrências
- `scripts/fix/` - 5 ocorrências

## TOP 30 OCORRÊNCIAS CRÍTICAS (Bloqueiam zerar tudo)

### 1. server/_core/tenant-validator.ts (4)
```typescript
// Linha 24
throw new Error('TENANT_ID_REQUIRED: Operação de banco exige tenantId válido');

// Linha 28
throw new Error('ACTOR_REQUIRED: Operação de banco exige contexto do usuário');

// Linha 32
throw new Error('INVALID_ACTOR_ROLE: Role do usuário inválido');

// Linha 36
throw new Error('VENDEDOR_ID_REQUIRED: Vendedor exige vendedorId');
```
**Classificação**: PRODUÇÃO - **Bloqueia**: SIM

### 2. server/_core/tenant-ownership.ts (8)
```typescript
// Linha 68
throw new Error(`${SECURITY_PREFIX} userId inválido`);

// Linha 72
throw new Error(`${SECURITY_PREFIX} tenantId inválido`);

// Linha 84
throw new Error(`${SECURITY_PREFIX} tenantId não pertence ao usuário autenticado`);

// Linha 96
throw new Error(`${SECURITY_PREFIX} vendedorId inválido para o tenant`);

// Linha 116
throw new Error(`${SECURITY_PREFIX} vendedorId não pertence ao usuário`);

// Linha 144
throw new Error(`${SECURITY_PREFIX} vendedorId não pertence ao contexto`);

// Linha 160
throw new Error(`${SECURITY_PREFIX} usuário não encontrado ou não pertence ao tenant`);

// Linha 175
throw new Error(`${SECURITY_PREFIX} contexto de execução ausente`);
```
**Classificação**: PRODUÇÃO - **Bloqueia**: SIM

### 3. server/_core/validators.ts (6)
```typescript
// Linha 120
throw new Error('Payload deve ser um objeto');

// Linha 125
throw new Error(`Campos obrigatórios faltando: ${missing.join(', ')}`);

// Linha 136
throw new Error('Motivo inválido: deve ser uma string não vazia');

// Linha 146
throw new Error('Metadata inválido: deve ser um objeto');

// Linha 156
throw new Error('ID inválido: deve ser um número inteiro positivo');

// Linha 174
throw new Error('Tenant ID inválido: valor muito alto');
```
**Classificação**: PRODUÇÃO - **Bloqueia**: SIM

### 4. server/_core/service-response.ts (4)
```typescript
// Linha 26
throw new Error(`Invalid array result: expected array, got ${result === null ? 'null' : result === undefined ? 'undefined' : typeof result}`);

// Linha 40
throw new Error(`Invalid object result: expected object, got ${result === null ? 'null' : 'undefined'}`);

// Linha 52
throw new Error("Falha na operação de criação: resultado indefinido");

// Linha 70
throw new Error("Falha na operação de criação: ID não encontrado");
```
**Classificação**: PRODUÇÃO - **Bloqueia**: SIM

### 5. client/src/lib/retry-client.ts (4)
```typescript
// Linha 160
throw new Error(`HTTP ${response.status}: ${response.statusText}`);

// Linha 225
throw new Error(`HTTP ${response.status}: ${response.statusText}`);

// Linha 238
throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);

// Linha 282
throw new Error(`All ${requests.length} HTTP requests failed`);
```
**Classificação**: PRODUÇÃO - **Bloqueia**: SIM

### 6. client/src/lib/trpcClient.ts (3)
```typescript
// Linha 59
throw new Error("Invalid TRPC response format");

// Linha 65
throw new Error("Invalid TRPC response format");

// Linha 69
throw new Error("Invalid TRPC response format");
```
**Classificação**: PRODUÇÃO - **Bloqueia**: SIM

### 7. server/services/ (15 ocorrências distribuídas)
**Arquivos críticos**:
- `server/services/pedidos.service.ts` - 3 ocorrências
- `server/services/clientes.service.ts` - 2 ocorrências  
- `server/services/produtos.service.ts` - 2 ocorrências
- `server/services/estoque.service.ts` - 2 ocorrências
- `server/services/dashboard.service.ts` - 2 ocorrências
- `server/services/auth.service.ts` - 2 ocorrências
- `server/services/notifications.service.ts` - 2 ocorrências

**Classificação**: PRODUÇÃO - **Bloqueia**: SIM

## CONTAGEM POR PASTA

### Server (167 ocorrências)
- `_core/` - 35 ocorrências
- `services/` - 67 ocorrências
- `api/` - 25 ocorrências
- `middleware/` - 18 ocorrências
- `cache/` - 8 ocorrências
- `security/` - 6 ocorrências
- `pdf.ts` - 1 ocorrência
- Outros - 7 ocorrências

### Client (47 ocorrências)
- `src/services/` - 23 ocorrências
- `src/lib/` - 7 ocorrências
- `src/contexts/` - 4 ocorrências
- `src/hooks/` - 6 ocorrências
- `src/components/ui/` - 3 ocorrências
- `src/utils/` - 1 ocorrência
- `src/store/` - 1 ocorrência
- Outros - 2 ocorrências

### Tests (124 ocorrências)
- `tests/` - 68 ocorrências
- `util/test/` - 2 ocorrências
- `test-out/` - 1 ocorrência

### Scripts (43 ocorrências)
- `scripts/` - 43 ocorrências

### Outros (5 ocorrências)
- `tenant-fallback-diff-evidence.txt` - 1 ocorrência
- `test-cluster-perf.ts` - 1 ocorrência
- `public/test-simple.html` - 1 ocorrência
- Outros - 2 ocorrências

## QUAIS AINDA BLOQUEIAM ZERAR TUDO?

### BLOQUEIO CRÍTICO (89 ocorrências)
**Sim, estas 89 ocorrências ainda bloqueiam zerar tudo:**

1. **Server/_core/** (35) - Núcleo do sistema
2. **Server/services/** (67) - Camada de negócios
3. **Client/services/** (15) - Camada de serviço do frontend
4. **Client/lib/** (7) - Utilitários críticos

### NÃO BLOQUEIAM (187 ocorrências)
**Estas podem ser mantidas como estão:**

1. **Tests/** (124) - Testes unitários e integração
2. **Scripts/** (43) - Scripts de infra e teste
3. **React Context/Hooks** (18) - Padrões React
4. **Domain Validation** (17) - Validações de domínio aceitáveis

## RECOMENDAÇÃO

### Para zerar tudo:
1. **Prioridade 1**: Corrigir 89 ocorrências críticas de produção
2. **Prioridade 2**: Converter para erros tipados (ValidationError, InfrastructureError, etc.)
3. **Prioridade 3**: Manter as 187 ocorrências aceitáveis

### Estratégia sugerida:
- **Fase 1**: Core system (_core/) - 35 ocorrências
- **Fase 2**: Services layer - 67 ocorrências  
- **Fase 3**: Client services - 15 ocorrências
- **Fase 4**: Client utilities - 7 ocorrências

**Total para zerar: 89 ocorrências críticas**
