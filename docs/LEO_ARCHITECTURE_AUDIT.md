# Auditoria de arquitetura do LEO no ERP

**Objetivo:** Verificar se o assistente LEO possui arquitetura de comandos estruturados ou se funciona apenas como chat com LLM.

**Arquivos analisados:** (equivalentes aos solicitados)

- **API / entrada:** `server/routers/leo.ts`, `server/routers/leo.router.ts` (não existe `leo.controller.ts`; a API é exposta via rotas tRPC)
- **Serviço de chat/intenção:** `server/services/ai/erp-ai.service.ts`
- **Executor de ações:** `server/services/ai/action-executor.ts`
- **Memória:** `server/services/ai/leo-memory.ts`
- **Agente com tools:** `server/leo/agent/agent-core.ts`, `server/leo/agent/tool-registry.ts`, `server/leo/agent/tool-executor.ts`
- **Interpretação LLM:** `server/services/ai/llm-interpreter.ts`

---

## 1. Existência de command registry ou action registry

**Sim.** Existem dois mecanismos de registro:

| Nome / localização | Tipo | Descrição |
|--------------------|------|-----------|
| **toolRegistry** | `server/leo/agent/tool-registry.ts` | Classe `ToolRegistry`, instância exportada `toolRegistry`. Map de ferramentas com `name`, `description`, `inputSchema` (Zod), `handler`. |
| **ActionExecutor** | `server/services/ai/action-executor.ts` | Não é um “registry” nomeado, mas atua como **action registry**: um `switch (action)` com casos fixos que mapeiam nomes de ação para chamadas a serviços. |

**Ferramentas registradas no toolRegistry (exemplos):**

- Clientes: `buscarCliente`, `listarClientes`
- Produtos: `buscarProduto`, `listarProdutos`, `verEstoqueProduto`
- Pedidos: `criarPedido`, etc.
- Financeiro: `listContasReceber`, `getResumoFinanceiro`
- Logística: `listCargas`, `listHistoricoRotas`
- Desktop (opcional): integração com `desktopController`

**Ações no ActionExecutor (exemplos):**

- `buscar_cliente`, `detalhar_cliente` → `clientesService`
- `listar_pedidos`, `buscar_pedido`, `criar_pedido` → `ordersService`
- `resumo_financeiro`, `baixar_pedido` → `financeService`
- `listar_estoque` → `db` (produtos)

Não foram encontrados nomes literais como `commandRegistry`, `commandsMap`, `actionsMap` ou `functionRegistry`; a função de registry é cumprida por **toolRegistry** e pelo **switch do ActionExecutor**.

---

## 2. Formato de retorno do LLM (action / command / tool)

Existem **dois fluxos** com formatos diferentes:

### Fluxo A — Chat principal (erp-ai.service + llm-interpreter)

- **Arquivo:** `server/services/ai/llm-interpreter.ts`
- O LLM é instruído (via system prompt) a retornar **JSON** no formato:

```json
{
  "intent": "consultar_pedido | consultar_cliente | consultar_financeiro | ...",
  "entities": {
    "numeroPedido": 123,
    "nomeCliente": "João Silva",
    "periodo": "hoje",
    ...
  },
  "explanation": "Breve explicação do que entendi"
}
```

- Não há campo literal `"action"`, `"command"` ou `"tool"`; o **intent** é usado como “ação” no `erp-ai.service` (switch por intent → chamada ao ActionExecutor com nome de ação fixo).

### Fluxo B — Agente com tools (agent-core + model-router)

- **Arquivos:** `server/leo/agent/agent-core.ts`, `server/leo/agent/model-router.ts`
- O modelo retorna um objeto com **tool calls** (formato interno):

```ts
{
  content: string;
  toolCalls?: Array<{
    toolName: string;  // nome da tool no registry
    input: any;
    reasoning?: string;
  }>;
}
```

- Ou seja: existe formato estruturado **tipo `{ "tool": toolName, input }`** no fluxo do agente (tool calls), e formato **tipo `{ "intent", "entities" }`** no fluxo do chat principal.

---

## 3. Pasta de comandos (ex.: leo/commands/)

**Não existe** a pasta `server/leo/commands/`.

- Comandos/ações estão:
  - **No agente:** registrados em código em `server/leo/agent/tool-registry.ts` (método `registerTools()`).
  - **No chat principal:** mapeados no `switch (intent)` em `erp-ai.service.ts` e no `switch (action)` em `action-executor.ts`.
- Não há estrutura de arquivos por comando (ex.: um arquivo por comando em `leo/commands/`).

---

## 4. action-executor.ts e chamadas a serviços do ERP

**Sim.** O `ActionExecutor` chama serviços concretos do ERP:

| Ação (exemplos) | Serviço / módulo |
|------------------|-------------------|
| `buscar_cliente`, `detalhar_cliente` | `clientesService` |
| `listar_pedidos`, `buscar_pedido`, `criar_pedido` | `ordersService` |
| `resumo_financeiro`, `baixar_pedido` | `financeService` |
| `listar_estoque` | `db.getDb()` + tabela `produtos` |

O **toolRegistry** também chama serviços do ERP: `clientes.service`, `inventory.service` (estoque), `orders.service`, `finance.service`, `logistica.service`. Ou seja, tanto o ActionExecutor quanto o toolRegistry estão ligados a funções específicas do ERP (clientes, pedidos, estoque, financeiro).

---

## 5. Fluxo atual (resumido)

### Caminho usado pelo chat (tRPC `leo.chat` / `leo.ask` em routers/leo.ts)

Não existe rota literal `/api/leo/chat`; o frontend usa **tRPC** (ex.: `leo.chat` ou `leo.ask`). O fluxo equivalente é:

1. **Usuário** envia mensagem (ex.: via tRPC `leo.chat` ou `leo.ask`).
2. **Endpoint:** procedimento tRPC em `server/routers/leo.ts` (chat/ask) ou `server/routers/leo.router.ts` (ask/agentAsk). O app monta `leo: leoRouter` em `routers.ts`, então o ponto de entrada atual é **leo.router.ts** (ask, agentAsk).
3. **Interpretação:**
   - No fluxo **erp-ai:** `perguntar()` → `interpretar(pergunta)` em `llm-interpreter.ts` (LLM ou query-engine) → retorno `{ intent, entities, explanation }`.
   - No fluxo **agent:** `leoAgentCore.handleRequest()` (ou `.run()` se existir) → `modelRouter.getResponse()` com tools do `toolRegistry` → resposta com `content` e opcionalmente `toolCalls`.
4. **Execução:**
   - **erp-ai:** `switch (intent)` em `erp-ai.service.ts` → `ActionExecutor.execute(tenantId, actionName, params)` (actionName derivado do intent).
   - **agent:** para cada `toolCall`, `toolExecutor.executeTool(toolName, input, context)` usando `toolRegistry.getTool(toolName)`.
5. **Resposta:** texto (+ dados) formatado e devolvido ao cliente; em `erp-ai` também há `leoMemory.record()` para contexto futuro.

Fluxo em uma linha:

**Usuário → tRPC (leo.chat / leo.ask ou leo.agentAsk) → interpretação (LLM intent ou LLM tool calls) → execução (ActionExecutor ou toolRegistry) → resposta.**

---

## 6. Maturidade da arquitetura

| Nível | Descrição | Avaliação |
|-------|-----------|-----------|
| **1 — Chat simples** | Apenas pergunta → LLM → resposta texto. | Não é o caso: há execução de ações/tools. |
| **2 — Chat com actions** | Intenção identificada e mapeada para ações fixas. | **Atendido** pelo fluxo erp-ai + ActionExecutor (intent → action). |
| **3 — Command registry estruturado** | Registry explícito de comandos/tools; LLM escolhe nome do comando/tool e parâmetros. | **Parcialmente atendido:** existe **toolRegistry** e fluxo de tool calls no agente, mas o **chat principal** usa intent + switch fixo + ActionExecutor, não um único registry unificado. Não há pasta `leo/commands/` nem registro declarativo por arquivo. |
| **4 — Copiloto completo** | Assistente com muitas operações do ERP, contexto rico, confirmações, reversão, auditoria. | **Parcial:** há memória (leo-memory), confirmação para baixa de pedido, e muitas operações (clientes, pedidos, financeiro, estoque), mas dois fluxos separados (erp-ai vs agent) e sem unificação clara em um único “copiloto” com um único registry. |

**Classificação sugerida:** entre **nível 2 e nível 3** — chat com actions (nível 2) já implementado; command/tool registry estruturado (nível 3) existe no agente (toolRegistry), mas não é o único caminho do chat e não há um único registry usado por todo o LEO.

---

## 7. Sugestões de melhoria

1. **Unificar entrada do chat**  
   Decidir um único ponto de entrada para “perguntar ao LEO” (por exemplo sempre `leo.chat` ou sempre `leo.ask`) e um único pipeline (ou um que internamente escolha entre intent-based e tool-based), para evitar dois fluxos paralelos (erp-ai + ActionExecutor vs agent-core + toolRegistry).

2. **Unificar registros de ações**  
   Ou fazer o fluxo principal usar o **toolRegistry** para todas as ações (incluindo as que hoje estão só no ActionExecutor), ou manter um único “action registry” que liste todas as ações (incluindo as do toolRegistry) e seja usado tanto pelo intent-based quanto pelo tool-based.

3. **Formato único de saída do LLM**  
   Padronizar um formato único (ex.: sempre `{ intent?, toolCalls? }` ou sempre `toolCalls`) para que um único interpretador decida se chama ActionExecutor ou toolRegistry, em vez de dois formatos (intent+entities vs toolCalls).

4. **Pasta de comandos (opcional)**  
   Introduzir algo como `server/leo/commands/` (ou `server/leo/tools/`) onde cada comando seja um módulo que se auto-registra no registry (toolRegistry ou outro), facilitando adicionar novos comandos sem alterar um único arquivo grande.

5. **Compatibilidade leo.router.ts e agent-core**  
   Em `leo.router.ts` é usado `leoAgentCore.run()`. Em `agent-core.ts` o método exposto é `handleRequest()`. Verificar se existe `run()` em algum lugar ou ajustar para `leoAgentCore.handleRequest()` (e assinatura compatível) para evitar erro em tempo de execução.

6. **Documentar qual fluxo o frontend usa**  
   Deixar explícito na documentação e no código se o assistente visível ao usuário usa o fluxo “intent + ActionExecutor” ou o fluxo “toolRegistry + tool calls”, e garantir que esse seja o fluxo estável e testado.

---

## Resumo

- **Registry:** Existe **toolRegistry** (leo/agent) e **ActionExecutor** como registry implícito de ações.
- **Formato LLM:** Intent + entities no fluxo do chat; tool calls (toolName + input) no fluxo do agente.
- **Pasta leo/commands/:** Não existe; comandos estão em tool-registry e action-executor.
- **action-executor:** Chama clientesService, ordersService, financeService e db (produtos/estoque).
- **Fluxo:** Usuário → tRPC LEO → interpretação (LLM) → execução (ActionExecutor ou toolRegistry) → resposta.
- **Maturidade:** Nível 2–3 (chat com actions + registry estruturado apenas em um dos fluxos).
- **Melhorias:** Unificar fluxo e registry, padronizar formato do LLM, considerar pasta de comandos e corrigir uso de agent-core (run vs handleRequest).
