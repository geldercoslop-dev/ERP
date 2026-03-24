# Mapa final de erros TypeScript — pós-refatoração estrutural

**Data:** 15/03/2025  
**Comando:** `pnpm tsc --noEmit`  
**Saída:** `tsc-final.txt`

---

## 1. Total de erros

**562** erros de TypeScript no projeto.

---

## 2. Top 10 arquivos com mais erros

| # | Arquivo | Qtd. erros |
|---|---------|------------|
| 1 | server/leo/security/leo-hardening.ts | **21** |
| 2 | server/routers.ts | **17** |
| 3 | server/leo/planning/leo-planner.ts | **16** |
| 4 | server/leo/learning/leo-learning-engine.ts | **14** |
| 5 | server/queue/jobs.ts | **14** |
| 6 | server/leo/desktop/system-controller.ts | **13** |
| 7 | server/leo/actions/leo-actions.ts | **13** |
| 8 | server/leo/engine/leo-scheduler.ts | **13** |
| 9 | server/leo/index.ts | **13** |
| 10 | server/services/ai/finance-engine.ts | **12** |

---

## 3. Tipos principais de erro

| Código | Descrição resumida | Qtd. |
|--------|--------------------|------|
| **TS2339** | Propriedade não existe no tipo | **121** |
| **TS2345** | Argumento não atribuível ao parâmetro | **82** |
| **TS2322** | Tipo não atribuível (atribuição) | **39** |
| **TS2532** | Object possibly undefined | **34** |
| **TS7006** | Parâmetro implicitamente tem tipo 'any' | **33** |
| **TS2724** | Módulo não tem membro exportado / nome incorreto | **28** |
| TS2551 | Propriedade não existe (objeto) | 24 |
| TS18046 | Variável é do tipo 'unknown' | 21 |
| TS2554 | Número incorreto de argumentos | 20 |
| TS18048 | Valor possibly undefined | 18 |
| TS2304 | Nome não encontrado | 17 |
| TS2352 | Conversão de tipo incompatível | 15 |
| **TS2614** | Módulo não tem membro nomeado (sugestão default) | **12** |
| **TS2307** | Módulo não encontrado (caminho) | **12** |
| TS2769 | Nenhuma overload compatível | 10 |
| TS2305 | Módulo não tem export | 9 |
| TS2353 | Propriedade não existe em tipo de objeto literal | 8 |
| TS2739 | Tipo não tem propriedades em comum | 7 |
| TS2367 | Comparação aparentemente não intencional | 6 |
| TS7031 | Binding element implicitamente tem 'any' | 6 |
| … | Outros (TS2315, TS2300, TS7053, etc.) | diversos |

**Foco solicitado (TS2339, TS2345, TS2532, TS2307):**

- **TS2339**: 121 (maior volume — propriedade não existe).
- **TS2345**: 82 (argumento não atribuível).
- **TS2532**: 34 (object possibly undefined).
- **TS2307**: 12 (módulo não encontrado).

---

## 4. Arquivos com mais de 10 erros

Estes arquivos ainda concentram **mais de 10 erros** cada e são prioridade para a próxima rodada de correções:

| Arquivo | Erros |
|---------|-------|
| server/leo/security/leo-hardening.ts | 21 |
| server/routers.ts | 17 |
| server/leo/planning/leo-planner.ts | 16 |
| server/leo/learning/leo-learning-engine.ts | 14 |
| server/queue/jobs.ts | 14 |
| server/leo/desktop/system-controller.ts | 13 |
| server/leo/actions/leo-actions.ts | 13 |
| server/leo/engine/leo-scheduler.ts | 13 |
| server/leo/index.ts | 13 |
| server/services/ai/finance-engine.ts | 12 |
| server/leo/desktop/browser-controller.ts | 11 |
| server/queue/worker.ts | 11 |

**Total:** 12 arquivos com mais de 10 erros (167 erros nesses arquivos).

---

## 5. Resumo executivo

- **Total de erros:** 562.
- **Meta “menos de 100”:** ainda não atingida.
- **Principais padrões:** propriedade inexistente (TS2339), argumento incompatível (TS2345), possibly undefined (TS2532), módulo não encontrado (TS2307).
- **Concentração:** 12 arquivos com >10 erros (server/leo, server/routers, server/queue, server/services/ai).

Este mapa reflete o estado **após a refatoração estrutural** (GenericPayload, QueueJob, eliminação de `any` em tipos centrais, proteção a opcionais no leo-planner, etc.). Para reduzir o total, a próxima fase deve focar nos 12 arquivos listados na seção 4 e nos códigos TS2339, TS2345, TS2532 e TS2307.
