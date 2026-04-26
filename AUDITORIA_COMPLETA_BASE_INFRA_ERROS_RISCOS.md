# AUDITORIA COMPLETA - BASE + INFRAESTURA ERP
## Relatório de Erros e Riscos Identificados

**Data:** 2026-01-XX  
**Objetivo:** Identificar todos os erros e riscos na base + infraestrutura para endurecimento total  
**Status:** AUDITORIA CONCLUÍDA

---

## RESUMO EXECUTIVO

### Pontos Fortes ✅
- **Schema Drizzle:** Consistente, com índices apropriados e relações bem definidas
- **Multi-tenancy:** tenantId presente em todas as tabelas de negócio
- **Redis:** Implementação robusta com retry wrapper, health checks e instrumentação
- **Auth:** JWT com secrets separados (access/refresh), RBAC implementado
- **Concorrência:** Controle de pedidos com idempotência e row-level locks
- **Resiliência:** Circuit breaker, retry, timeout, fallback implementados
- **LEO AI:** Refatorado para usar tools (sem acoplamento direto a services)
- **Database:** Pool configurado com health checks e métricas

### Áreas Críticas Identificadas ⚠️
- **Type Safety:** ~40% de type safety pendente (200+ `any`, 100+ `unknown` no server; 80+ `any` no client)
- **Casts Fracos:** 30+ `as never`, 10+ `as unknown`, 30+ `as any` no sistema
- **Console Errors:** 25+ `console.error` no server (além de 200+ `console.log`)
- **Arquivos Temporários:** 100+ arquivos .txt e .json temporários no root
- **DATABASE_URL:** 50+ ocorrências no server, 3 no client (precisa validação)
- **ENV:** 100+ arquivos usam `process.env`, segregação client/server precisa validação

---

## 1. SCHEMA E DRIZZLE ORM

### Status: ✅ BEM ESTRUTURADO

### Pontos Positivos
- Todas as tabelas de negócio têm `tenantId` com índices
- Índices compostos para lookup otimizado (ex: `clientes_tenant_lookup_idx`)
- Relações Drizzle bem definidas em `relations.ts`
- Unique constraints onde necessário (ex: `openId`, `numero_pedido`)
- Cascade deletes configurados corretamente

### Riscos Menores
- **Risco:** Tabela `configuracoes` não tem `tenantId` (é global por design)
  - **Impacto:** Baixo - é tabela de configuração do sistema
  - **Recomendação:** Documentar claramente que é global

- **Risco:** Tabela `counters` tem campo `free` como `text` (pode ser `json`)
  - **Impacto:** Baixo - funciona como está
  - **Recomendação:** Considerar migrar para `json` se precisar de estrutura

---

## 2. DATABASE (MySQL)

### Status: ✅ ROBUSTO

### Pontos Positivos
- Pool configurado com connection limit (padrão 20, configurável via ENV)
- Health checks com cache (evita ping excessivo)
- Retry com exponential backoff
- Slow query logging (>300ms)
- OpenTelemetry instrumentation
- Graceful shutdown implementado

### Riscos Menores
- **Risco:** Connection limit padrão 20 pode ser baixo para alta carga
  - **Impacto:** Médio - pode causar fila de conexões
  - **Recomendação:** Monitorar `DB_POOL_CONNECTION_LIMIT` em produção
  - **ENV:** `DB_POOL_CONNECTION_LIMIT` (padrão 20)

- **Risco:** Queue limit padrão 200 pode ser insuficiente
  - **Impacto:** Médio - requisições podem ser rejeitadas sob pico
  - **Recomendação:** Ajustar `DB_POOL_QUEUE_LIMIT` conforme carga
  - **ENV:** `DB_POOL_QUEUE_LIMIT` (padrão 200)

---

## 3. SERVICES

### Status: ✅ BEM ORGANIZADO

### Pontos Positivos
- Services isolados por domínio (clientes, produtos, pedidos, etc.)
- Service Actor pattern para controle de acesso
- Audit logging em operações críticas
- Idempotency para operações financeiras
- Cache inteligente para clientes e inventory

### Riscos Identificados

#### Risco: Type Safety Incompleta (DETALHADO)
- **Status:** ~55-60% de type safety (conforme documento de hardening)
- **Impacto:** Alto - erros em runtime podem passar despercebidos
- **Locais:** Muitos services usam `any` em parâmetros
- **Recomendação:** Priorizar eliminação de `any` types
- **Arquivos críticos:**
  - `server/db/index.ts` - vários `as never` casts
  - `server/services/*.ts` - parâmetros `unknown`/`any`
- **Contagem Detalhada:**
  - **Server:** 200+ `any`, 100+ `unknown`
  - **Client:** 80+ `any`
  - **Casts:** 30+ `as never`, 10+ `as unknown`, 30+ `as any`
- **Arquivos com mais casts:**
  - `server/types/service-safe-example.ts` - 14+ `as any` (exemplo educativo)
  - `server/tests/multi-tenant-isolation.test.ts` - 10+ `as any` (mocks)
  - `server/services/safe-transaction.ts` - 4+ `as never` (error handling)
  - `server/routers.ts` - 3+ `as never` (transações)
  - `client/src/_legacy/VendasForm.tsx` - 4+ `as any` (legacy)

#### Risco: Acoplamento em alguns services
- **Impacto:** Médio - dificulta testes e manutenção
- **Exemplo:** Alguns services importam diretamente outros services
- **Recomendação:** Usar tools pattern (como LEO faz) para desacoplar

---

## 4. REDIS

### Status: ✅ EXCELENTE

### Pontos Positivos
- Singleton pattern com reconexão automática
- Health check com cache (5 segundos)
- Retry wrapper com exponential backoff
- OpenTelemetry instrumentation
- Graceful shutdown
- Timeout por operação (5 segundos)

### Riscos Menores
- **Risco:** Cache de health check pode mascarar problemas temporários
  - **Impacto:** Baixo - 5 segundos é aceitável
  - **Recomendação:** Monitorar métricas de Redis

---

## 5. AUTH (RBAC, JWT, SESSÕES)

### Status: ✅ BEM IMPLEMENTADO

### Pontos Positivos
- JWT com secrets separados (access/refresh)
- RBAC com 3 níveis (admin, operator, user)
- Hierarquia de roles implementada
- Session cookies com secure options
- Impersonation para admin (com audit log)
- Rate limiting no login

### Riscos Identificados

#### Risco: Cookie Security
- **Risco:** Cookies usam `ONE_YEAR_MS` (muito longo)
  - **Impacto:** Médio - se cookie for comprometido, acesso prolongado
  - **Local:** `server/routers.ts` linha 266
  - **Recomendação:** Considerar reduzir para 7-30 dias com refresh

#### Risco: Admin Password Hash
- **Risco:** `ADMIN_PASSWORD_HASH` em ENV (não em DB)
  - **Impacto:** Alto - se ENV vazar, senha admin exposta
  - **Local:** `server/routers.ts` linha 295
  - **Recomendação:** Migrar para hash em DB como vendedores

---

## 6. API E ROTAS (tRPC, Express)

### Status: ✅ BEM ESTRUTURADO

### Pontos Positivos
- tRPC para type-safe API
- Procedimentos protegidos (public, protected, admin)
- Input validation com Zod
- Error handling centralizado
- Rate limiting por IP/username

### Riscos Identificados

#### Risco: Console.log e Console.error em produção (DETALHADO)
- **Contagem Console.log:** 200+ ocorrências no server
- **Contagem Console.error:** 25+ ocorrências no server
- **Impacto:** Alto - polui logs, pode vazar informações sensíveis em produção
- **Recomendação:** Substituir todos por logger estruturado (systemLogger)
- **Arquivos críticos com console.error:**
  - `server/_core/vite.ts` - 4+ console.error (vite errors)
  - `server/_core/tenant-security.ts` - 1 console.error (tenant validation)
  - `server/_core/systemRouter.ts` - 1 console.error (DB check)
  - `server/_core/session.service.ts` - 7+ console.error (session errors)
  - `server/_core/service-logger.ts` - 4+ console.error (critical errors)
  - `server/_core/queue-manager.ts` - 3+ console.error (queue errors)
- **Arquivos críticos com console.log:**
  - `server/routers.ts` - 30+ console.log (auth, vendedores, debug)
  - `server/services/*.ts` - 100+ console.log (debugging)
  - `server/scripts/*.ts` - 50+ console.log (scripts)
  - `server/leo/*.ts` - 30+ console.log (LEO debugging)
- **Ação Imediata:** Remover todos console.log/console.error de produção, usar systemLogger

#### Risco: Bcrypt Loading Dinâmico
- **Risco:** `getBcrypt()` carrega módulo dinamicamente a cada chamada
  - **Impacto:** Baixo - tem cache, mas é desnecessário
  - **Local:** `server/routers.ts` linha 85-163
  - **Recomendação:** Carregar no startup e cache permanentemente

---

## 7. INTEGRAÇÕES (SuperFrete)

### Status: ✅ BEM IMPLEMENTADA

### Pontos Positivos
- Timeout configurado (20s cotação, 15s etiqueta/rastreamento)
- Cache de 5 minutos para cotações
- Sandbox mode via ENV
- Tratamento de erros robusto
- Graceful degradation se API key não configurada

### Riscos Menores
- **Risco:** API key em ENV (`SUPERFRETE_API_KEY`)
  - **Impacto:** Médio - se ENV vazar, integração comprometida
  - **Recomendação:** Usar secret manager em produção

---

## 8. FRONTEND (React)

### Status: ⚠️ TYPE SAFETY PENDENTE

### Pontos Positivos
- Lazy loading de rotas
- Protected routes
- Error boundaries
- tRPC client type-safe
- Auth context

### Riscos Identificados

#### Risco: Type Safety Incompleta
- **Contagem:** 80+ ocorrências de `any` no client
- **Impacto:** Alto - erros em runtime no frontend
- **Locais principais:**
  - `client/src/utils/*.ts` - 20+ any
  - `client/src/pages/*.tsx` - 40+ any
  - `client/src/hooks/*.ts` - 15+ any
- **Recomendação:** Priorizar type safety no frontend

#### Risco: LocalStorage Security
- **Risco:** Possível uso de localStorage para dados sensíveis
  - **Impacto:** Alto - XSS pode ler localStorage
  - **Recomendação:** Auditoriar uso de localStorage
  - **Arquivos:** `client/src/lib/security/*.ts`

---

## 9. LEO AI

### Status: ✅ REFACTORADO

### Pontos Positivos
- Refatorado para usar tools (sem acoplamento direto a services)
- Learning engine usa tools específicas
- Tenant validation em todos os tools
- Security layers (permissions, sandbox, loop protection)
- Memory service isolado

### Riscos Menores
- **Risco:** 30+ arquivos em LEO podem ter duplicações
  - **Impacto:** Baixo - arquitetura está correta
  - **Recomendação:** Revisar se há código morto

---

## 10. ENV (VARIÁVEIS DE AMBIENTE)

### Status: ✅ BEM VALIDADO

### Pontos Positivos
- Schema Zod para validação
- Secrets com tamanho mínimo exigido
- Parse centralizado com cache
- Fail-fast se ENV inválido

### Riscos Identificados

#### Risco: Segregação ENV Client/Server (DETALHADO)
- **Risco:** Client pode ter acesso a secrets do server
  - **Impacto:** Alto - secrets expostos no browser
  - **Recomendação:** Validar que `.env.example` do client não tem secrets
  - **Arquivo:** `client/env-example.txt` - ✅ CORRETO (só variáveis públicas)
  - **Arquivo:** `env-server-example.txt` - ✅ CORRETO (só variáveis server)
  - **Arquivo:** `.env.example` - ⚠️ GENÉRICO (mistura server + client)
- **Análise dos ENV Examples:**
  - `client/env-example.txt`: VITE_API_URL, VITE_APP_NAME (seguro)
  - `env-server-example.txt`: DATABASE_URL, JWT_SECRET, etc (server-only)
  - `.env.example`: Mistura DATABASE_URL (server) com possíveis client vars
- **Process.env Usage:**
  - **Server:** 100+ arquivos usam `process.env`
  - **Client:** 6 arquivos usam `process.env` (NODE_ENV, VITE_*)
  - **Risco:** Se `.env` for carregado no client, secrets vazam
- **Ação Imediata:** Separar `.env.example` em `.env.server.example` e `.env.client.example`

#### Risco: Secrets em plaintext (DETALHADO)
- **Risco:** Todos os secrets em ENV (APP_SECRET, JWT_*, etc.)
  - **Impacto:** Alto - se ENV vazar, sistema comprometido
  - **Recomendação:** Usar secret manager (Vault, AWS Secrets, etc.)
- **Secrets Identificados:**
  - `APP_SECRET` - Chave mestra da aplicação
  - `JWT_SECRET` - Assinatura de tokens (deprecated, usar JWT_ACCESS_SECRET)
  - `JWT_ACCESS_SECRET` - Assinatura de access tokens
  - `JWT_REFRESH_SECRET` - Assinatura de refresh tokens
  - `SESSION_SECRET` - Sessões
  - `ADMIN_PASSWORD_HASH` - Senha admin em ENV (CRÍTICO)
  - `REDIS_PASSWORD` - Senha do Redis
  - `MYSQL_ROOT_PASSWORD` - Senha root MySQL
  - `MYSQL_PASSWORD` - Senha usuário MySQL
  - `SUPERFRETE_API_KEY` - API key SuperFrete
- **Arquivos com secrets:**
  - `server/routers.ts` - ADMIN_PASSWORD_HASH (linha 295)
  - `server/security/jwt-auth.ts` - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
  - `server/services/env.schema.ts` - Validação de secrets
  - `server/config/database.ts` - DATABASE_URL
- **Ação Imediata:** Migrar ADMIN_PASSWORD_HASH para DB, outros para secret manager

---

## 10.5. DATABASE_URL AUDITORIA (NOVO)

### Status: ⚠️ PRECISA VALIDAÇÃO

### Pontos Positivos
- DATABASE_URL validado via Zod schema
- Parse centralizado em `server/services/env.schema.ts`
- Fail-fast se DATABASE_URL inválido
- Pool MySQL configurado com URL parsing

### Riscos Identificados

#### Risco: DATABASE_URL em todo o sistema (DETALHADO)
- **Contagem Server:** 50+ ocorrências de `DATABASE_URL`
- **Contagem Client:** 3 ocorrências de `DATABASE_URL` (apenas leitura de health)
- **Impacto:** Alto - se DATABASE_URL vazar no client, DB exposto
- **Arquivos críticos no server:**
  - `server/services/env.schema.ts` - Validação de DATABASE_URL
  - `server/config/database.ts` - Parse e pool creation
  - `server/config/env.ts` - 9 ocorrências
  - `server/config/server-init.ts` - 1 ocorrência
  - `server/_core/env.ts` - 1 ocorrência
  - `server/_core/env.validation.ts` - 3 ocorrências
  - `server/_core/boot-validator.ts` - 2 ocorrências
  - `server/_core/boot-validator-fixed.ts` - 1 ocorrência
  - `server/_core/auth-detection.ts` - 4 ocorrências
  - `server/scripts/*` - 20+ ocorrências (scripts de setup)
- **Arquivos no client:**
  - `client/src/utils/health-analyzer.ts` - 2 ocorrências (health check)
  - `client/src/types/system-health.ts` - 2 ocorrências (tipos)
  - `client/src/pages/SystemHealth.tsx` - 3 ocorrências (display)
- **Análise de Segurança:**
  - ✅ Client só lê DATABASE_URL de health endpoint (não usa para conexão)
  - ✅ Server valida DATABASE_URL via Zod antes de usar
  - ⚠️ Scripts de setup podem logar DATABASE_URL em debug
- **Ação Imediata:** Validar que nenhum script loga DATABASE_URL em produção

---

## 11. TOOLS E SHARED

### Status: ✅ BEM ESTRUTURADO

### Pontos Positivos
- Tools isolados por domínio
- Tenant validation em todos os tools
- Type safety melhor que services
- Cache inteligente

### Riscos Menores
- **Risco:** Alguns tools podem ter duplicação de lógica
  - **Impacto:** Baixo - arquitetura está correta
  - **Recomendação:** Revisar periodicamente

---

## 12. CORE (Processor, Check-Any)

### Status: ✅ FUNCIONAL

### Pontos Positivos
- Service entry guard implementado
- Command pattern para operações
- Idempotency check
- Trace propagation

### Riscos Menores
- **Risco:** `check-any` pode ter falsos positivos
  - **Impacto:** Baixo - é uma ferramenta de auditoria
  - **Recomendação:** Manter como está, é útil

---

## 13. ARQUIVOS MORTOS, LIXOS, DUPLICAÇÕES

### Status: ⚠️ MUITOS ARQUIVOS TEMPORÁRIOS

### Arquivos Temporários Identificados (100+ arquivos)

#### Arquivos .txt no root (60+ arquivos)
- `app_dburl.txt`, `app_health.txt`, `architecture-latest.txt`
- `badpatterns-latest.txt`, `build-out.txt`, `build-output.txt`
- `compose-debug.txt`, `compose-out.txt`, `compose-output.txt`
- `cookies.txt`, `docker_hardening.txt`, `docker_ps.txt`
- `err.txt`, `erro.txt`, `final.txt`, `healthcheck.txt`
- `images.txt`, `infra-check.txt`, `inspect.txt`
- `jwt-token-final.txt`, `jwt-token-new.txt`, `jwt-token.txt`
- `latest_check.txt`, `list-files.txt`, `SECRETS-ATUALIZAR.txt`
- `UPDATE-ENV-INSTRUCTIONS.txt`, `__freeze_tests.txt`, `__freeze_tsc.txt`

#### Arquivos .json no root (20+ arquivos)
- `audit-moderate.json`, `login-payload.json`, `login-wrong.json`
- `login.json`, `login_response.json`, `order-payload.json`
- `shutdown-stats.json`, `tenant-seed.json`, `test-login.json`

#### Arquivos .js no server (4 arquivos)
- `server/run-performance-redis.js`
- `server/run-performance-simple.js`
- `server/run-performance-test.js`
- `server/test-env-redis.js`

#### Relatórios MD duplicados (30+ arquivos)
- `MISSAO_*.md` (10+ variações)
- `RELATORIO_*.md` (10+ variações)
- `PROMPT*_REPORT.md` (3+ variações)
- `AUTH-LOCK-*.md` (2+ variações)

### Recomendações
- **Prioridade Alta:** Remover arquivos .txt e .json temporários do root
- **Prioridade Média:** Consolidar relatórios MD duplicados
- **Prioridade Baixa:** Revisar arquivos .js de performance

---

## 14. CONCORRÊNCIA

### Status: ✅ BEM CONTROLADA

### Pontos Positivos
- Idempotency com requestId
- Row-level locks (SELECT FOR UPDATE)
- Memory cache para detecção rápida
- Audit logging de tentativas de duplicação
- Pedido control implementado

### Riscos Menores
- **Risco:** Memory cache pode ser perdido em restart
  - **Impacto:** Baixo - idempotency table persiste
  - **Recomendação:** Manter como está (cache é otimização)

---

## 15. RUNTIME E BUILD (TypeScript)

### Status: ⚠️ TYPE SAFETY PENDENTE

### Pontos Positivos
- Compilação TypeScript configurada
- Tsconfig separado para server/client/test
- Strict mode habilitado
- No `@ts-ignore` ou `@ts-expect-error` encontrados

### Riscos Identificados

#### Risco: Type Safety Incompleta
- **Server:** ~200 arquivos com `any` types
- **Client:** ~80 arquivos com `any` types
- **Impacto:** Alto - erros em runtime podem passar
- **Recomendação:** Priorizar eliminação de `any` types
- **Meta:** Alcançar 95%+ type safety

#### Risco: Console.log em produção
- **Contagem:** 200+ ocorrências
- **Impacto:** Médio - polui logs, pode vazar informações
- **Recomendação:** Substituir por logger estruturado

---

## 16. INTEGRAÇÕES EXTERNAS

### Status: ✅ CONTROLADAS

### Pontos Positivos
- SuperFrete com timeout e cache
- Graceful degradation se não configurado
- Sandbox mode
- Tratamento de erros robusto

### Riscos Menores
- **Risco:** API keys em ENV
  - **Impacto:** Médio - se ENV vazar
  - **Recomendação:** Usar secret manager

---

## PRIORIDADES DE CORREÇÃO (ATUALIZADO)

### Prioridade CRÍTICA (Alto Impacto)
1. **Console Errors/Logs:** Remover 225+ console.log/console.error do server (substituir por systemLogger)
2. **Type Safety:** Eliminar 200+ `any`, 100+ `unknown` no server + 80+ `any` no client
3. **Casts Fracos:** Eliminar 30+ `as never`, 10+ `as unknown`, 30+ `as any`
4. **Secrets:** Migrar 10+ secrets de ENV para secret manager (APP_SECRET, JWT_*, etc.)
5. **Admin Password:** Migrar ADMIN_PASSWORD_HASH de ENV para DB (CRÍTICO)
6. **ENV Segregation:** Separar .env.example em .env.server.example e .env.client.example

### Prioridade ALTA (Médio Impacto)
7. **Arquivos Temporários:** Remover 100+ arquivos .txt/.json do root
8. **DATABASE_URL:** Validar que scripts não logam DATABASE_URL em produção
9. **Cookie Security:** Reduzir duração de session cookies de 1 ano para 7-30 dias
10. **LocalStorage:** Auditoriar uso de dados sensíveis no frontend
11. **Database Pool:** Ajustar connection/queue limits para produção

### Prioridade MÉDIA (Baixo Impacto)
12. **Relatórios Duplicados:** Consolidar 30+ arquivos MD
13. **Arquivos .js:** Revisar/remover 4 arquivos de performance no server
14. **Bcrypt Loading:** Carregar no startup em vez de dinâmico
15. **LEO Files:** Revisar duplicações em 30+ arquivos

---

## CONCLUSÃO

### Status Geral: 🟡 BOM COM MELHORIAS PENDENTES

A base + infraestrutura do ERP está **bem estruturada e robusta**, com:
- Multi-tenancy consistente
- Auth e RBAC implementados
- Resiliência (circuit breaker, retry, timeout)
- Concorrência controlada
- LEO AI refatorado
- Redis e Database com health checks

### Principais Gargalos (ATUALIZADO)
1. **Console Errors/Logs:** 225+ console.log/console.error no server (prioridade #1)
2. **Type Safety:** ~40% pendente - 200+ any, 100+ unknown no server + 80+ any no client (prioridade #2)
3. **Casts Fracos:** 70+ casts fracos (as never, as unknown, as any) (prioridade #3)
4. **Secrets Management:** 10+ secrets em ENV plaintext (prioridade #4)
5. **Admin Password:** ADMIN_PASSWORD_HASH em ENV (CRÍTICO) (prioridade #5)
6. **ENV Segregation:** Precisa separar client/server (prioridade #6)
7. **Limpeza:** 100+ arquivos temporários (prioridade #7)

### Próximos Passos Recomendados (ATUALIZADO)
1. **IMEDIATO:** Remover todos console.log/console.error do server, usar systemLogger
2. **IMEDIATO:** Executar plano de type safety (conforme `00-INDICE-TAREFAS-1-4-HARDENING.md`)
3. **IMEDIATO:** Eliminar casts fracos (as never, as unknown, as any)
4. **CRÍTICO:** Migrar ADMIN_PASSWORD_HASH de ENV para DB
5. **CRÍTICO:** Implementar secret manager (Vault, AWS Secrets, etc.)
6. **CRÍTICO:** Separar .env.example em .env.server.example e .env.client.example
7. **ALTA:** Limpar arquivos temporários do root
8. **ALTA:** Validar que scripts não logam DATABASE_URL em produção
9. **ALTA:** Reduzir duração de session cookies de 1 ano para 7-30 dias
10. **MÉDIA:** Ajustar configurações de produção (pool, etc.)

### Avaliação Final (ATUALIZADA)
- **Arquitetura:** ✅ 9/10
- **Segurança:** 🟡 6/10 (melhorar secrets, admin password, ENV segregation)
- **Performance:** ✅ 8/10
- **Type Safety:** 🟡 5/10 (priorizar - 225+ type safety issues)
- **Organização:** 🟡 6/10 (limpar arquivos, separar ENV)
- **Resiliência:** ✅ 9/10
- **Logging:** 🟡 5/10 (225+ console.log/console.error)

**Nota:** O sistema está **quase produção-ready** com as melhorias prioritárias acima implementadas. **6 itens críticos** precisam de correção imediata antes de produção.
