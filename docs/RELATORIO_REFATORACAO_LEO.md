# Relatório de Refatoração Estrutural do Módulo LEO

**Data:** 2025-03-15  
**Objetivo:** Reduzir erros TypeScript via padronização de tipos, contratos de API e estrutura (sem correções pontuais).

---

## 1. Alterações realizadas

### 1.1 Centralização de tipos (`shared/types` + `server/leo/types.ts`)

- **`shared/types/leo.ts`**
  - Criado tipo global `Payload = Record<string, unknown>` e uso em:
    - `LeoAction.parameters`
    - `LeoDecision.context`
    - `LeoTask.payload`
    - `CreateTaskInput.payload`
  - Interface `ILeoErpObserver` tipada:
    - `observe(): Promise<LeoObserveResult>` (novo tipo `LeoObserveResult`: `success`, `events?`, `context?`, `error?`)
    - `collectErpContext(): Promise<Payload>`
    - `getLastContext(): Payload | null`

- **`server/leo/types.ts`** (novo)
  - Reexporta apenas tipos de dados de `shared/types`:
    - `LeoTask`, `LeoEvent`, `LeoAction`, `LeoDecision`, `LeoContext`, `Payload`, `GenericPayload`

- **`server/leo/types/index.ts`**
  - Importa tipos de dados de `../types` (que reexporta `shared/types`).
  - Contexto de **execução** renomeado para `LeoExecutionContext` (db, memory, permissions, events, task, traceId, startTime) para não colidir com `LeoContext` de `shared/types`.
  - `LeoActionHandler.execute(context)` e `LeoPermissions.canExecute(..., context)` passam a usar `LeoExecutionContext`.
  - `TaskResult`, `LeoMemory`, `TaskQueue`, `QueueStats`, etc. mantidos como interfaces de sistema.

### 1.2 Payload padronizado

- **Payload** usado de forma consistente em:
  - `LeoTask.payload`, `LeoAction.parameters`, `LeoDecision.context`
- `QueueJob.payload` e `QueueJobData.payload` em `server/queue/queue.ts` (importando `Payload` de `shared/types`)
  - `server/leo/tasks/leo-task-queue.ts`: `LeoTaskFull.payload` tipado como `Payload`
  - Observer: `lastContext`, retorno de `collectErpContext` e `generateEventsFromContext(context: Payload)`

### 1.3 Retornos async e eliminação de `Promise<any>`

- **Observer:** `observe(): Promise<LeoObserveResult>`, `collectErpContext(): Promise<Payload>`, `getLastContext(): Payload | null`.
- **Queue jobs:** Todos os processadores retornam `Promise<JobResult>` com `executionTime` e `processedAt` em todos os ramos (sucesso e erro).

### 1.4 Proteção a opcionais e acesso a `unknown`

- **`server/leo/utils/leo-context.ts`**
  - Interface de contexto de runtime renomeada para `LeoRuntimeContext` (evitar sombrear `LeoContext` de `shared/types`).
  - Helpers `buscarUsuario`, `buscarErpMetrics`, `buscarAlertas` tipados com `Database` do `server/db`.
- **`server/leo/perception/leo-erp-observer.ts`**
  - Uso de variáveis intermediárias tipadas para acessar `context.produtos`, `context.pedidos`, `context.clientes`, `context.sistema` a partir de `Payload`, com optional chaining onde aplicável.

### 1.5 Imports e API do LEO

- **`server/leo/actions/leo-actions.ts`**
  - Uso de `LeoRuntimeContext` e `Payload`; assinatura `executeLeoAction(action, context: LeoRuntimeContext, parametros?: Payload)`.
- **`server/leo/index.ts`**
  - Export de `LeoRuntimeContext` e `buildLeoContext` a partir de `./utils/leo-context`.
  - Export de `LeoContext`, `LeoTask`, `LeoEvent`, `LeoAction`, `Payload` a partir de `./types`.
  - Remoção de reexport duplicado de `LeoEvent`/`LeoAction` em memory e actions.
- **`server/leo/engine/leo-engine.ts`**
  - Uso de `LeoEventType` e `LeoEventPriority` em `makeDecision`; `context` da decisão tipado como `Payload`.
- **`server/leo/core/task-queue.ts`**
- Uso de `LeoTaskStatus` (enum de `shared/types`) em vez de strings `'pending'`, `'running'`, `'done'`, `'error'`.
  - Filtros e atribuições de status passam a usar o enum.

### 1.6 Fila (`server/queue`)

- **`server/queue/queue.ts`**
- `QueuePayload` e `QueueJob.payload` / `QueueJobData.payload` tipados como `Payload` (de `shared/types`).
- Import de `LeoTask` e `Payload` de `shared/types` (em vez de `../leo/tasks/leo-task-queue` para o tipo da fila global).
- **`server/queue/jobs.ts`**
  - Cast de `data.payload` para payloads específicos via `as unknown as OcrJobPayload` (e equivalentes) para evitar incompatibilidade direta com `Payload`.
  - Retornos de todos os processadores padronizados com `executionTime` e `processedAt` em cada ramo.

---

## 2. Estrutura de tipos LEO (resumo)

| Tipo            | Origem        | Uso principal                                      |
|-----------------|---------------|----------------------------------------------------|
| `LeoTask`       | `shared/types` | Fila de tarefas, engine, task-queue               |
| `LeoEvent`      | `shared/types` | Eventos, observer, memory                         |
| `LeoAction`     | `shared/types` | Ações, engine, logs                               |
| `LeoDecision`   | `shared/types` | Decisões no engine, memória                       |
| `LeoContext`    | `shared/types` | Contexto canônico (timestamp, system, erp, …)     |
| `Payload`       | `shared/types` | Payloads dinâmicos (task, action, queue, observer) |
| `LeoRuntimeContext` | `server/leo/utils/leo-context` | Contexto construído para ações (usuario, erp, alertas, servidor) |
| `LeoExecutionContext` | `server/leo/types/index` | Contexto de execução (db, memory, task, traceId, …) |
| `QueueJob`      | `server/queue/queue` | `id`, `type`, `payload: Payload`, `createdAt`   |

---

## 3. Validação e erros restantes

- **Comando:** `pnpm tsc --noEmit`
- **Escopo:** O projeto continua com erros em outros módulos (services, routers, tests, client). Os diretórios **server/leo** e **server/queue** foram os focos da refatoração.

**Categorias de erros ainda presentes (fora da refatoração feita):**

1. **Imports de `db`:** Vários arquivos em `server/leo` importam `insertLeoActionLog` de `../../db`; em alguns ambientes de compilação o export pode não ser resolvido (sugestão: confirmar barrel export em `server/db/index.ts`).
2. **Status de tarefa:** `server/leo/core/task-queue.ts` passou a usar `LeoTaskStatus` em todos os pontos relevantes.
3. **Queue/jobs:** Payloads tipados com cast `as unknown as X` e `JobResult` com `executionTime` e `processedAt` em todos os retornos.
4. **Outros módulos:** Erros em `server/services/ai`, `server/services/*`, `server/tests`, etc. não foram alterados (conforme escopo: apenas arquitetura do módulo LEO).

---

## 4. Próximos passos sugeridos

1. Garantir que `insertLeoActionLog` esteja exportado em todos os barrels usados por `server/leo` (ex.: `server/db/index.ts`).
2. Rodar `pnpm tsc --noEmit` e gerar contagem por arquivo (ex.: script que agrupa por caminho) para acompanhar “total de erros” e “top 10 arquivos com mais erros”.
3. Repetir a padronização de retornos async (`Promise<void>`, `Promise<boolean>`, `Promise<LeoTask>`, etc.) e proteção a opcionais nos demais arquivos de `server/leo` e `server/queue` que ainda usem `any` ou `unknown` sem guard.
4. Unificar métodos da API LEO em: `executeAction`, `scheduleTask`, `registerEvent`, `listEvents`, removendo aliases/duplicatas onde fizer sentido.

---

## 5. Meta

- **Meta:** Reduzir para menos de 100 erros no projeto.
- **Escopo desta refatoração:** Estrutura e tipos do módulo LEO e da fila (server/leo, server/queue). A contagem total de erros e o “top 10 arquivos” devem ser obtidos com `pnpm tsc --noEmit` e um script de agregação por arquivo após a refatoração.
