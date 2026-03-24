# Auditoria Tecnica Completa do ERP e do Modulo LEO

Data: 2026-03-14
Repositorio auditado: `C:/ERP`

## 1. Resumo executivo

O ERP possui uma base funcional ampla, com stack moderna no frontend (`React + Vite + tRPC + React Query`) e backend em `Express + tRPC + Drizzle + MySQL`, alem de um subsistema de IA/automacao LEO relativamente ambicioso. A arquitetura intencional e boa: um fluxo claro de `frontend -> tRPC -> router -> service -> db -> analytics -> LEO`.

O problema atual nao e ausencia de estrutura, e sim deriva arquitetural. O projeto acumula multiplas geracoes de implementacao convivendo ao mesmo tempo: routers antigos e novos, duas camadas de banco, schemas e services fora de sincronia, contratos quebrados entre frontend e backend, e um LEO dividido entre agent core novo e services antigos. Isso afeta diretamente estabilidade, seguranca multi-tenant, compilacao e manutenibilidade.

Diagnostico geral:

- A arquitetura base e promissora, mas esta parcialmente fragmentada.
- O backend principal concentra muita responsabilidade em `server/routers.ts`.
- O schema Drizzle esta relativamente bem estruturado, mas varios services nao refletem mais o schema real.
- O modulo LEO tem boa visao de produto, porem o caminho ativo apresenta quebras funcionais.
- Ha risco operacional concreto em auth, ownership, multitenancy, financeiro, cargas e contratos de frontend.

Conclusao objetiva: o sistema tem potencial alto de evolucao, inclusive para SaaS e para um assistente empresarial forte, mas hoje precisa de uma fase de estabilizacao estrutural antes de acelerar novas features.

## 2. Escopo auditado

Foram auditados:

- `client/`
- `server/`
- `server/_core/`
- `server/routers*`
- `server/routes/`
- `server/services/`
- `server/modules/`
- `server/leo/`
- `server/cache/`
- `drizzle/`
- `shared/`

Tambem foi executada validacao real de compilacao TypeScript:

- Comando: `pnpm run build:server`
- Resultado: falha de compilacao
- Evidencia: 891 erros TypeScript reportados

## 3. Mapa da arquitetura

### 3.1 Estrutura principal

#### Frontend

- `client/src/main.tsx`
  Bootstrap da aplicacao.
- `client/src/components/AuthInitializer.tsx`
  Porta de entrada de autenticacao.
- `client/src/App.tsx`
  Composicao de alto nivel.
- `client/src/lib/routes.tsx`
  Roteamento com `wouter`.
- `client/src/lib/lazyPages.ts`
  Carregamento lazy de paginas.
- `client/src/components/layout/AppShell.tsx`
  Shell principal autenticado, com menu, busca, atalhos e componentes operacionais.

#### Backend

- `server/_core/index.ts`
  Bootstrap Express + tRPC.
- `server/_core/context.ts`
  Resolucao de contexto, auth, tenant e vendedor.
- `server/_core/trpc.ts`
  Procedures public/protected/admin.
- `server/routers.ts`
  Router principal do sistema.
- `server/routes/`
  Rotas legadas/adaptadas.
- `server/routers/`
  Routers alternativos, inclusive do LEO.

#### Services e modulos

- `server/services/`
  Regras de negocio por dominio.
- `server/modules/`
  Modulos de operacao segura e logistica.
- `server/services/ai/`
  Engines analiticas e servicos de IA.

#### Banco e persistencia

- `drizzle/schema.ts`
  Schema principal.
- `drizzle/*.sql`
  Migracoes.
- `server/db.ts`
  Camada de banco mais antiga / abrangente.
- `server/db/index.ts`
  Wrapper Drizzle alternativo.

#### LEO

- `server/routers/leo.router.ts`
  Entrada ativa do assistente no backend.
- `server/leo/agent/agent-core.ts`
  Core do agente.
- `server/leo/agent/model-router.ts`
  Roteamento Groq/Gemini.
- `server/leo/agent/tool-registry.ts`
  Ferramentas do agente.
- `server/services/ai/erp-ai.service.ts`
  Caminho legado/fallback de IA de negocio.
- `server/services/leo-service.ts`
  Service legado com operacoes do assistente.

## 4. Fluxo completo do sistema

### 4.1 Fluxo ERP principal

1. O frontend sobe em `client/src/main.tsx`.
2. `AuthInitializer` decide entre loading, login ou app autenticado.
3. Paginas e componentes usam `trpc.*.useQuery/useMutation`.
4. `client/src/lib/trpcClient.ts` envia chamadas para `/api/trpc`.
5. `server/_core/index.ts` monta `createExpressMiddleware` com `appRouter`.
6. `server/_core/context.ts` resolve sessao, usuario, vendedor e tenant.
7. `server/routers.ts` despacha procedures por dominio.
8. Procedures chamam `services/*`.
9. Services acessam Drizzle/MySQL via `server/db.ts` ou `server/db/index.ts`.
10. Dados voltam ao frontend via React Query/tRPC.

### 4.2 Fluxo LEO

1. O frontend do assistente chama `trpc.leo.ask`.
2. `server/routers/leo.router.ts` tenta chamar `leoAgentCore.run(...)`.
3. O core deveria orquestrar prompt, modelo, tools e resposta.
4. Ferramentas acessam ERP, analytics, memoria e integracoes.
5. Parte dos insights do LEO ainda vem de caches e servicos legados.

### 4.3 Problema estrutural do fluxo LEO

O router ativo chama `leoAgentCore.run(...)`, mas o core exposto em `server/leo/agent/agent-core.ts` implementa `handleRequest(...)`, nao `run(...)`. Isso indica quebra objetiva no caminho principal do assistente.

## 5. Avaliacao da arquitetura

### Pontos fortes

- Stack moderna e coerente para um ERP web fullstack.
- Boa integracao tipada entre frontend e backend via tRPC.
- Schema multi-tenant ja previsto no banco.
- Existencia de camadas de idempotencia, auditoria, ownership e RBAC.
- LEO ja foi pensado como plataforma de agente, nao apenas chatbot.

### Fragilidades

- `server/routers.ts` esta monolitico e excessivamente central.
- Coexistencia de `server/routers.ts`, `server/routers/*.ts` e `server/routes/*.ts`.
- Coexistencia de `server/db.ts` e `server/db/index.ts`.
- Drift entre schema, services e frontend.
- LEO dividido entre arquitetura nova e servicos antigos.

## 6. Estrutura de codigo

### 6.1 Organizacao

A organizacao macro do repositorio e boa, mas a organizacao interna perdeu consistencia:

- `client/` esta melhorando com hooks reutilizaveis, pages lazy e shell padronizado.
- `server/` tem boa divisao conceitual, mas muita sobreposicao de responsabilidade.
- `services/` concentra muita regra de negocio e muito acoplamento com schema real.
- `routers/` e `routes/` coexistem sem fronteira nitida.
- `modules/` contem partes importantes, mas sem adocao uniforme no fluxo principal.

### 6.2 Duplicacoes e acoplamentos

Duplicacoes ou divergencias relevantes:

- Duas `ErrorBoundary` no frontend.
- Duas estrategias de debounce.
- Duas camadas de DB no backend.
- Dois ecossistemas de LEO: `server/leo/*` e `server/services/ai/*`/`server/services/leo-service.ts`.
- Dois barramentos de eventos separados: frontend e backend.

### 6.3 Complexidade excessiva

Pontos mais complexos:

- `server/routers.ts`
- `server/services/orders.service.ts`
- `server/services/finance.service.ts`
- `server/services/logistica.service.ts`
- `server/services/ai/erp-ai.service.ts`
- `client/src/components/layout/AppShell.tsx`
- `client/src/pages/NovaVenda.tsx`

## 7. Qualidade tecnica

### 7.1 TypeScript e tipagem

O projeto declara:

- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUncheckedIndexedAccess: true`

Mesmo assim, a auditoria encontrou erosao de tipagem significativa:

- uso frequente de `any`
- casts para `as any`
- contratos quebrados entre store, hooks, pages e backend
- codepaths que nao compilam

Hotspots de `any` no frontend:

- `client/src/pages/CargaDetalhes.tsx`
- `client/src/pages/Pendencias.tsx`
- `client/src/pages/CargaBaixa.tsx`
- `client/src/pages/NovaVenda.tsx`
- `client/src/pages/Produtos.tsx`
- `client/src/pages/Estoque.tsx`
- `client/src/components/ai/LeoDashboard.tsx`

Hotspots no backend:

- `server/services/ai/*`
- `server/services/logistica.service.ts`
- `server/services/orders.service.ts`
- `server/services/finance.service.ts`
- `server/leo/*`
- `server/_core/command.ts`

### 7.2 Compilacao real

O backend hoje nao esta compilando de forma consistente.

Resultado objetivo:

- `pnpm run build:server` falhou
- 891 erros TypeScript identificados

Categorias principais dos erros:

- imports e exports divergentes
- metodos inexistentes em `db`
- nomes de simbolos quebrados
- schema drift
- tipos incorretos entre services e Drizzle
- funcoes com assinaturas divergentes
- modulos do LEO referenciando arquivos inexistentes

Exemplos de falha real:

- `server/services/ai/erp-ai.service.ts`
- `server/services/ai/finance-engine.ts`
- `server/services/finance.service.ts`
- `server/services/leo-insights.service.ts`
- `server/utils/logger.ts`

### 7.3 Codigo morto ou suspeito de legado

Sinais relevantes:

- componentes e paginas nao usados no frontend
- rotas expostas no menu sem rota correspondente
- services e routers antigos ainda presentes
- `schema-leo-memory.ts` em Postgres convivendo com projeto MySQL
- dashboards com dados mockados em fluxo supostamente operacional

## 8. Banco de dados e Drizzle

### 8.1 Qualidade do schema

O schema principal em `drizzle/schema.ts` e relativamente bem modelado. Ha uma boa base para:

- multi-tenant
- usuarios e vendedores
- clientes
- produtos e variacoes
- pedidos e itens
- pendencias
- cargas
- financeiro
- boletos
- sessoes opacas
- auditoria
- memoria do LEO

### 8.2 Pontos positivos

- `tenantId` presente em entidades centrais.
- `sessions` existe e modela token opaco.
- `idempotency_keys` existe.
- `clientes` tem unique normalizado por tenant.
- `counters` implementa sequencia por tenant.
- `caixa_mensal` tem unique por `tenantId + mesAno`.

### 8.3 Inconsistencias entre schema e services

#### Clientes

Schema:

- `cliente_vendedores` usa `tipo` e `createdAt`

Service:

- `server/services/clientes.service.ts` usa `principal` e `dataAssociacao`

#### Cargas

Schema:

- `cargas.status` = `ABERTA | EM_ROTA | ENTREGUE`

Service:

- `server/services/logistica.service.ts` trabalha com estados divergentes como `GERADO` e `CONFERIDO`

#### Boletos

Schema:

- `boletos.status` = `ABERTO | PARCIAL | PAGO | ATRASADO`

Service:

- `server/services/finance.service.ts` grava `PENDENTE`

#### Pedidos e itens

Schema:

- `itens_pedido` exige `tenantId`

Service:

- `server/services/orders.service.ts` insere itens sem refletir claramente esse contrato

### 8.4 Indices

Indices bons existentes:

- pedidos por `tenant`, `status`, `createdAt`, `vendedor`
- clientes por `tenant` e unique normalizado
- contas a pagar/receber por `status + vencimento`
- sessions por `expiresAt`
- idempotency por `commandName + key`

Indices suspeitos de faltar:

- `pedidos (tenantId, numero)` como unique composto
- `cargas (tenantId, numero)` como unique composto
- `audit_log (tenantId, createdAt)`
- `pedidos_carga (cargaId, entregue)`
- possivel indice composto tenant-aware para busca de produtos

Indices possivelmente redundantes:

- indices extras sobre colunas ja `unique`, como `numero` ou `openId`

### 8.5 Avaliacao de consistencia

O schema parece mais maduro que os services. O risco central nao esta no modelo relacional em si, mas no fato de parte relevante do codigo de negocio nao estar mais alinhada ao schema.

## 9. Fluxos criticos do ERP

### 9.1 Clientes

Riscos:

- associacao cliente-vendedor inconsistente
- ownership baseado em inferencia por pedidos
- drift entre cadastro, venda e visibilidade

### 9.2 Produtos

Riscos:

- fallback para `tenantId || 1` em rotas legadas
- acoplamento entre cadastro, estoque, promocao e venda
- busca e atualizacao passando por camadas antigas

### 9.3 Pedidos

Ponto central do sistema.

Riscos:

- pedido alimenta financeiro, estoque, pendencias, cargas e boletos
- qualquer erro de status ou total propaga para varios dominios
- service de pedidos faz muitas responsabilidades ao mesmo tempo

### 9.4 Estoque

Riscos:

- inconsistencias entre baixa real, pendencia e saldo
- pontos seguros existem, mas nao estao integrados uniformemente

### 9.5 Financeiro

Riscos:

- contas provisoria e baixa final com regras inconsistentes
- caixa mensal potencialmente desatualizado
- comissoes dependentes de dados de pedido/baixa
- schema e service divergentes em boletos e comissoes

### 9.6 Cargas

Riscos:

- status divergente do schema
- telas esperam payload mais rico que o service entrega
- baixa de carga depende de financeiro e pedido de forma acoplada

### 9.7 Boletos

Riscos:

- service usa status nao previsto no schema
- baixa parcial pode distorcer caixa
- fluxo depende de integridade previa de pedido e financeiro

## 10. Performance

### 10.1 Gargalos atuais

- `AppShell` faz queries globais em toda pagina autenticada.
- `Home` e `LeoDashboard` acumulam muitas chamadas.
- `LeoDashboard` consome listas grandes para montar partes ainda mockadas.
- buscas globais disparam varias queries por digitacao.
- analytics do backend usam filtros e agregacoes potencialmente pesadas.
- ha sinais de N+1 em analytics e logistica.

### 10.2 Riscos futuros

- crescimento de tenant pode amplificar consultas sem filtro adequado
- caches atuais do LEO nao parecem tenant-aware em todos os pontos
- dashboards podem virar gargalo operacional
- router monolitico dificulta otimizacao por dominio

### 10.3 Uso de memoria e cache

Pontos observados:

- existencia de caches em `server/cache/*`
- uso de React Query no frontend
- risco de cache incoerente entre dados ERP e insights do LEO
- risco de leitura ampla em memoria em alguns relatios/jobs

## 11. Seguranca

### 11.1 Pontos positivos

- uso amplo de Zod em varias procedures
- existencia de `protectedProcedure` e `adminProcedure`
- tentativa de ownership e tenant enforcement
- tabela `sessions`
- auditoria e rate limit presentes

### 11.2 Achados criticos

#### Auth previsivel

Mesmo existindo `sessions`, o fluxo principal ainda exibe sinais de uso de tokens previsiveis tipo `u:<id>` / `v:<id>`.

Impacto:

- fragiliza autenticacao
- dificulta isolamento real entre tenants e perfis

#### Ownership fragil

`server/_core/ownership.ts` usa `tenantId = 1` por default.

Impacto:

- validacao pode ocorrer no tenant errado
- risco de autorizacao incorreta para `pedido`, `cliente`, `boleto` e `conta_receber`

#### Fallbacks perigosos de tenant

Ocorrencias observadas em:

- `server/routes/produtos.ts`
- `server/routes/pedidos.ts`
- `server/routers/leo.router.ts`

Padrao:

- `tenantId || 1`

Impacto:

- risco real de vazamento ou operacao no tenant errado

#### Smart auth exposto

Existe exposicao operacional em `server/routers/smart-auth.ts`, inclusive com caminhos de teste/health que merecem endurecimento imediato.

## 12. Modulo LEO

### 12.1 Qualidade da arquitetura do LEO

O LEO ja foi desenhado com componentes importantes:

- core de agente
- roteador de modelos
- registro de tools
- memoria
- analytics
- automacao
- integracoes externas

Isso e muito positivo como base de evolucao.

### 12.2 Problemas atuais

- `leo.router` chama metodo inexistente no core (`run` vs `handleRequest`)
- o caminho novo coexistente com `erp-ai.service.ts` e `leo-service.ts` gera duplicidade
- parte do frontend do LEO consome dados mockados
- confirmacao de acoes perigosas no core nao esta efetivamente bloqueando execucao
- tools de desktop e ERP estao muito proximas no mesmo plano de execucao
- caches/insights precisam de isolamento por tenant

### 12.3 Potencial de evolucao com Groq e Gemini

Viabilidade: alta, desde que a base seja estabilizada.

Recomendacao:

- Gemini como primario para tool calling estruturado
- Groq como fallback/baixa latencia para respostas curtas
- telemetria de roteamento por modelo
- separacao clara entre tools operacionais do ERP e tools de desktop
- pipeline unificado `leo.router -> agent-core -> tool-registry -> services ERP`

## 13. Estabilidade

### Principais pontos que podem quebrar

- compilacao backend hoje falha em larga escala
- contratos frontend/backend divergentes
- `AppShell` usa variaveis antes da declaracao
- login/store com assinatura divergente
- procedures chamadas pelo frontend sem correspondencia clara no router principal
- schema e services divergentes em logistica, financeiro, clientes e LEO

### Dependencias frageis

- coexistencia de codigo antigo e novo
- imports cruzados entre frontend e server
- dependencias funcionais em mocks, casts e `any`

## 14. Principais defeitos e riscos

### P0

- Falha estrutural no caminho principal do LEO (`run` inexistente).
- `tenantId` com fallback para `1` em rotas criticas.
- ownership com default `tenantId = 1`.
- compilacao do backend quebrada com 891 erros.
- desvio entre schema e services em fluxos de financeiro e logistica.
- contrato quebrado entre `Login` e `authStore`.

### P1

- router principal monolitico.
- caches e insights do LEO sem isolamento suficiente.
- dashboards e shell com custo de query elevado.
- menu e rotas nao sincronizados.
- dados mockados em areas operacionais do frontend.

### P2

- duplicacao de componentes de sistema.
- arquivos legados e experimentais convivendo com fluxo principal.
- tipagem frouxa em telas pesadas.

## 15. Notas gerais

- Arquitetura: 6.5/10
- Qualidade de codigo: 4.0/10
- Performance: 5.5/10
- Seguranca: 4.5/10
- Manutenibilidade: 4.0/10

Leitura das notas:

- O sistema ja tem base para virar algo muito robusto.
- As notas caem nao pela visao de produto/plataforma, mas pela fragmentacao tecnica atual.

## 16. Roadmap tecnico completo

### Fase 1 - Estabilizacao critica

Objetivo: impedir quebra operacional e reduzir risco de dados.

- Corrigir auth para usar somente sessao opaca.
- Remover todo fallback `tenantId || 1`.
- Tornar `assertOwnership()` obrigatoriamente tenant-aware.
- Corrigir caminho principal do LEO.
- Resolver divergencias criticas entre schema e services de:
  - clientes
  - pedidos
  - financeiro
  - cargas
  - boletos
- Restaurar build TypeScript verde no backend.

### Fase 2 - Consolidacao arquitetural

Objetivo: remover deriva entre camadas.

- Quebrar `server/routers.ts` por dominios reais.
- Definir uma unica camada oficial de acesso ao banco.
- Encerrar uso de `server/routes/*` como backend legado dentro do tRPC.
- Remover ou arquivar codigo experimental/legacy fora do fluxo principal.
- Unificar modelos e contratos compartilhados entre frontend e backend.

### Fase 3 - Qualidade e observabilidade

Objetivo: aumentar previsibilidade de evolucao.

- Eliminar hotspots de `any`.
- Reforcar tipos de payload entre pages/hooks/store.
- Adicionar testes de contrato tRPC.
- Adicionar testes de fluxo para pedidos, baixa, cargas e boletos.
- Melhorar logging estruturado e auditoria por tenant.
- Adicionar contadores e dashboards de erro do LEO.

### Fase 4 - Performance

Objetivo: preparar crescimento.

- Mover agregacoes de dashboard para endpoints dedicados.
- Reduzir queries globais no shell.
- Revisar analytics com foco em:
  - filtros por tenant
  - paginacao
  - eliminacao de N+1
  - uso de indices compostos
- Revisar caches tenant-aware.

### Fase 5 - Evolucao do LEO

Objetivo: transformar o LEO em assistente empresarial confiavel.

- Consolidar uma unica arquitetura ativa do agente.
- Separar tools de consulta e tools de alteracao.
- Exigir confirmacao real para acoes sensiveis.
- Centralizar memoria e contexto por tenant.
- Adicionar telemetria por modelo, tool e dominio.
- Adotar strategy clara:
  - Gemini para tool calling estruturado
  - Groq para baixa latencia e fallback

### Fase 6 - Evolucao para SaaS

Pre-condicoes:

- tenancy 100% consistente
- auth/sessions robustas
- billing/plano por tenant
- observabilidade operacional por conta
- filas e jobs isolados por tenant
- limites e quotas configuraveis

Passos recomendados:

- reforcar isolamento logico e operacional por tenant
- versionar configuracoes por tenant
- separar assets/config/insights por tenant
- introduzir onboarding automatico, provisioning e seed por tenant
- padronizar trilha de auditoria e exportacao de dados

## 17. Conclusao final

O ERP e o modulo LEO nao estao ruins em conceito. Pelo contrario: o repositorio mostra ambicao tecnica, amplitude funcional e uma direcao correta de plataforma. O problema e que a base entrou em estado de divergencia interna. Hoje existem boas pecas, mas elas nao estao completamente alinhadas entre si.

O maior ganho tecnico imediato nao esta em adicionar mais features, e sim em consolidar a arquitetura ativa, restaurar a integridade entre schema/services/frontend e endurecer multitenancy, autenticacao e ownership. Feito isso, o sistema pode evoluir de forma muito mais segura para analytics avancado, automacao operacional, LEO multi-modelo e eventualmente uma oferta SaaS.
