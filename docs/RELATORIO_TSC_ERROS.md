# Relatório de erros TypeScript – pnpm tsc --noEmit

**Data:** 2025-03-15

## 1) Total de erros

**675** erros TypeScript no projeto (client + server).

---

## 2) Top 15 arquivos com mais erros

| # | Erros | Arquivo |
|---|-------|---------|
| 1 | 102 | server/leo/planning/leo-insights.ts |
| 2 | 25 | server/leo/security/leo-hardening.ts |
| 3 | 17 | server/routers.ts |
| 4 | 16 | server/leo/planning/leo-planner.ts |
| 5 | 15 | server/leo/tasks/leo-task-queue.ts |
| 6 | 14 | server/leo/learning/leo-learning-engine.ts |
| 7 | 13 | server/leo/desktop/system-controller.ts |
| 8 | 13 | server/leo/engine/leo-scheduler.ts |
| 9 | 13 | server/leo/operator/leo-operator-mode.ts |
| 10 | 12 | server/leo/index.ts |
| 11 | 12 | server/services/ai/finance-engine.ts |
| 12 | 11 | server/leo/desktop/browser-controller.ts |
| 13 | 11 | server/queue/worker.ts |
| 14 | 10 | server/leo/actions/leo-actions.ts |
| 15 | 10 | server/leo/engine/leo-loop.ts |

---

## 3) Erros agrupados por módulo

| Módulo | Total de erros |
|--------|-----------------|
| server/db | 6 |
| server/services | 86 |
| server/routers | 76 |
| server/infra | 17 |
| tests | 10 |
| server/leo | 369 |
| other (client, _core, etc.) | 111 |

---

## 4) Correções já realizadas

- **server/leo/security/leo-desktop-sandbox.ts**: Ajuste de estrutura (`getInstance` fechado), `Payload` no lugar de `any`, `validateAction` implementado e fechado, `executeScript` com `Payload`.
- **server/leo/security/leo-hardening.ts**: Remoção de bloco órfão e métodos duplicados (shouldLog, getCallingModule, logToConsole, logToFile), conclusão de `executeWithRecovery`, indentação e tipos (`Payload` no lugar de `any`, `logToDatabase` retorna `Promise<void>`, import de `insertLeoActionLog` de `../../db`).

**Objetivo:** reduzir para menos de 50 erros (próximos alvos: leo-insights.ts, leo-hardening restantes, leo-planner, leo-task-queue, etc.).
