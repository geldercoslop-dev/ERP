# LEO — Arquitetura avançada (copiloto operacional)

Este documento descreve a arquitetura reforçada do assistente LEO: task planner, logs de ação, permissões, cache, recuperação de erros e event engine, mantendo o sistema **leve, modular e seguro**.

---

## 1. Task Planner

**Arquivo:** `server/services/ai/task-planner.ts`

Permite que o LEO execute uma **sequência de ferramentas** quando a pergunta exige múltiplas ações.

- **`planTasks(userMessage, interpretation)`**  
  Gera um plano com até **5 etapas** (`steps[]`). Cada etapa tem `tool` e `input`.  
  Se a interpretação já trouxer um `toolCall` único, o plano terá uma etapa; heurísticas simples podem sugerir várias (ex.: “relatório de vendas de hoje e top 5 clientes” → listar pedidos, resumo financeiro, etc.).

- **`executePlan(plan, ctx)`**  
  Executa as etapas **em sequência**. Se uma falhar, registra o erro e continua quando possível.  
  Retorno: `{ success, message, steps[], data }` (resposta consolidada).

**Regras:**

- Máximo 5 etapas.
- Execução sequencial (sem paralelismo).
- Falha em uma etapa não interrompe necessariamente o plano; resultado final é consolidado.

**Integração:** No `erp-ai.service`, após a interpretação, se `planTasks` gerar mais de uma etapa, o fluxo usa `executePlan` e devolve a resposta consolidada; caso contrário, segue o fluxo normal de uma única tool.

---

## 2. Log de ações do LEO (auditoria)

**Tabela:** `leo_action_logs` (MySQL)

| Campo           | Tipo        | Descrição                          |
|----------------|-------------|------------------------------------|
| id             | int (PK)    | Identificador                      |
| tenantId       | int (FK)    | Tenant                              |
| userId         | int (FK)    | Usuário (opcional)                 |
| tool           | varchar(128)| Nome da tool executada             |
| input          | text        | JSON do input                      |
| result         | text        | JSON do resultado (resumido)      |
| success        | boolean     | Sucesso da execução                |
| executionTime  | int         | Tempo em ms                         |
| createdAt      | timestamp   | Data/hora                          |

**Serviço:** `server/services/ai/leo-action-logger.ts`

- **`logAction({ tool, input, result, success, executionTime, ctx })`**  
  Grava um registro por execução de tool.  
  **Importante:** o log **não bloqueia** a execução; é assíncrono (fire-and-forget). Se falhar (ex.: banco indisponível), o erro é **ignorado silenciosamente**.

**Integração:** O `ActionExecutor` chama `logAction` após cada execução (sucesso ou falha), sem `await`, para não impactar latência.

---

## 3. Sistema de permissões do LEO

**Arquivo:** `server/leo/security/tool-permissions.ts`

Mapa simples **tool → roles permitidos**:

- Ex.: `buscar_cliente`, `listar_pedidos`, `criar_pedido` → `["admin", "vendedor"]`
- Ex.: `deletarCliente`, `baixar_pedido` → `["admin"]`

**Função:**

- **`checkToolPermission(tool, userRole)`**  
  Retorna `{ allowed: true }` ou `{ allowed: false, message: "Permissão insuficiente" }`.  
  Se a tool não estiver no mapa, considera-se permitida (comportamento padrão).

**Integração:** No `ActionExecutor`, antes de executar a tool, é feita a verificação; em caso de `allowed: false`, retorna-se resposta controlada `{ success: false, message }` sem chamar a tool.

---

## 4. Cache leve para consultas frequentes

**Arquivo:** `server/services/ai/leo-query-cache.ts`

Cache **em memória** (Map com TTL).

- **Estrutura:** `key` → `{ value, expiresAt }`
- **`getCached(key)`** — retorna valor se existir e não expirado.
- **`setCached(key, value, ttl)`** — TTL padrão **30 segundos**.
- **`invalidateCached(key)`** — invalida uma chave (útil após escritas).

Uso apenas em **consultas pesadas** (leituras), por exemplo:

- Pedidos do dia
- Relatório de vendas / resumo financeiro
- Estoque

**Nunca** cachear operações de escrita.

**Integração:** O `ActionExecutor` usa cache apenas para as tools configuradas em `CACHEABLE_TOOLS` (ex.: `listar_pedidos`, `resumo_financeiro`, `listar_estoque`). Chave: `leo:{tenantId}:{tool}:{JSON params}`.

---

## 5. Sistema de auto recuperação

**Arquivo:** `server/services/ai/leo-error-recovery.ts`

- **`safeToolExecute(tenantId, tool, input, ctx)`**  
  Envolve a execução da tool em try/catch: em caso de erro, registra em log e retorna resposta **segura** e padronizada:

  ```json
  { "success": false, "message": "Não consegui completar essa ação agora." }
  ```

**Nunca** expõe erro interno ao usuário.

Uso opcional em fluxos que precisam de resposta sempre controlada (ex.: APIs públicas ou relatórios em background). O fluxo principal do chat pode continuar usando `ActionExecutor.execute` diretamente.

---

## 6. Event Engine (simplificado)

**Arquivo:** `server/services/ai/leo-event-engine.ts`

Permite que o LEO **reaja a eventos do ERP** sem filas complexas.

- **`onEvent(eventName, handler)`** — registra um handler para um evento (ex.: `pedidoCriado`, `estoqueBaixo`, `clienteNovo`).
- **`emitEvent(eventName, data)`** — dispara o evento; todos os handlers são chamados (erros em um handler não bloqueiam os demais).

Exemplo de uso em outros módulos do ERP:

- Ao criar um pedido: `emitEvent("pedidoCriado", pedido)`.
- Handlers podem atualizar memória do LEO, enviar notificações ou registrar métricas.

---

## 7. Fluxo completo de execução

```
Usuário (pergunta)
       ↓
LLM interpretation (llm-interpreter / erp-ai)
       ↓
intent / toolCall
       ↓
Task planner (se plan.steps.length > 1)
       ↓
Action executor
       ↓
checkToolPermission(tool, userRole)
       ↓
Cache (se tool em CACHEABLE_TOOLS) → getCached / setCached
       ↓
Tool registry → ERP services
       ↓
logAction (assíncrono, não bloqueia)
       ↓
Resposta ao usuário
```

- **ActionExecutor:** ponto central: permissões → (cache opcional) → registry → log.
- **Task planner:** usado só quando há múltiplas etapas; caso contrário, uma única tool é executada pelo fluxo normal.
- **Logs:** assíncronos; falhas no log não afetam a resposta.
- **Cache:** opcional e apenas para leituras; TTL 30s.

---

## 8. Performance e princípios

- Nenhuma operação bloqueia o event loop: logs em background, cache leve.
- Planner só roda quando a interpretação indica múltiplas etapas.
- Cache apenas para ferramentas de leitura definidas; escritas não são cacheadas.
- Código modular: cada módulo (planner, logger, permissões, cache, recovery, events) em arquivo próprio, sem dependências pesadas nem acoplamento forte ao frontend.

O LEO permanece **leve, rápido e estável**, com planejamento de tarefas, auditoria, permissões, cache inteligente, recuperação de erros e suporte a eventos, sem aumentar a complexidade do ERP.
