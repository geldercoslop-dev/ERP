# Arquitetura de Tools do LEO — Copiloto do ERP

O LEO evoluiu de um chat com actions para um **copiloto estruturado**: todas as ações são **tools** registradas dinamicamente, com interpretação em formato de **tool call** e resposta padronizada.

---

## 1. Fluxo de execução

```
Usuário (pergunta)
       ↓
Interpretação (LLM ou query-engine)
       → intent + entities
       → (opcional) tool call { tool, input }
       ↓
Mapeamento intent → tool call (erp-ai.service)
       → { tool: "buscar_cliente", input: { nome: "joão" } }
       ↓
ActionExecutor.execute(tenantId, tool, input)
       → toolRegistry.getTool(tool) → handler(input, context)
       ↓
Tool (server/leo/tools/*.tool.ts)
       → execute(input, context) com tenantId/userId
       ↓
Resposta padronizada
       → { success, message, data, meta }
       ↓
Memória (sessionContext, recentEntities, lastAction)
```

- **Caminho principal (Agent Core):** `leoAgentCore.run()` → provider (Groq/Gemini) pode devolver `toolCalls` → `toolExecutor.executeTool(toolName, input, context)` usa o mesmo `toolRegistry`.
- **Caminho fallback (erp-ai):** `interpretar(pergunta)` → intent + entities → `intentToToolCall(intent, entities)` → `ActionExecutor.execute(tenantId, tool, input)` → resposta padronizada.

Ambos os caminhos usam o **registry dinâmico** (sem `switch` por ação).

---

## 2. Registro de tools

### Onde ficam as tools

- **Módulo LEO:** `server/leo/tools/`
  - `clientes.tool.ts` — buscar_cliente, detalhar_cliente
  - `pedidos.tool.ts` — buscar_pedido, listar_pedidos, criar_pedido
  - `financeiro.tool.ts` — resumo_financeiro, baixar_pedido
  - `estoque.tool.ts` — listar_estoque
  - `types.ts` — LeoToolContext, LeoToolResponse, LeoToolDefinition
  - `index.ts` — `getLeoToolDefinitions()` e re-exports

Cada tool exporta:

- `name` (string)
- `description` (string)
- `inputSchema` (Zod)
- `execute(input, context)` → `Promise<LeoToolResponse>`

### Registro no Tool Registry

- **Registry:** `server/leo/agent/tool-registry.ts`
  - No construtor, após registrar as tools “legadas” (buscarCliente, listarClientes, etc.), chama `registerLeoTools()`.
  - `registerLeoTools()` importa `getLeoToolDefinitions()` de `../tools` e faz `register(def)` para cada definição.
  - Cada definição LEO é convertida em `ToolDefinition` do registry: mesmo `name`, `description`, `inputSchema`, e um `handler` que chama `tool.execute(input, toRegistryContext(ctx))` e devolve a resposta já no formato padronizado.

Para **adicionar uma nova tool**:

1. Criar ou editar um arquivo em `server/leo/tools/` (ex.: `minha.tool.ts`) com `name`, `description`, `inputSchema`, `execute()`.
2. Incluir a tool no array em `server/leo/tools/index.ts` e em `getLeoToolDefinitions()`.
3. Nenhum `switch` ou registro manual em outro arquivo é necessário; o registry é preenchido na inicialização.

---

## 3. Integração com o ERP

As tools usam apenas serviços já existentes do backend:

| Tool / Módulo   | Serviço / Fonte              |
|-----------------|------------------------------|
| clientes        | clientes.service             |
| pedidos         | orders.service               |
| financeiro      | finance.service              |
| estoque         | db + tabela produtos         |

- **tenantId** e **userId** (e, quando aplicável, **vendedorId**) vêm do contexto autenticado e são repassados a todas as tools.
- Nenhuma ação é executada sem contexto de tenant; o registry e o ActionExecutor recebem `tenantId` (e opcionalmente `userId`, `userRole`, `vendedorId`) e repassam às tools.

---

## 4. Formato de tool call

Formato esperado (usado internamente e passível de ser devolvido pelo LLM no futuro):

```json
{
  "tool": "buscar_cliente",
  "input": { "nome": "joão" }
}
```

No fluxo atual do erp-ai, o **intent + entities** são convertidos nesse formato pela função `intentToToolCall(intent, entities)` em `erp-ai.service.ts`. O ActionExecutor recebe `(tenantId, tool, input)` e delega ao registry.

---

## 5. Resposta padronizada da IA

Todo retorno de ação/tool é normalizado para:

```ts
{
  success: boolean;
  message: string;
  data?: unknown;
  meta?: Record<string, unknown>;
}
```

- **ActionExecutor** devolve isso (incluindo quando o handler da tool já retorna `LeoToolResponse`).
- **Resposta do LEO (RespostaLeo)** inclui `success`, `message`, `response` (alias), `data`, `meta` e campos opcionais (`action`, `context`, `pendingConfirmation`).
- O router de fallback expõe `success`, `mensagem` (= message), `data`, `meta` para o cliente.

---

## 6. Memória e continuidade (leo-memory)

`server/services/ai/leo-memory.ts` suporta:

- **sessionContext** — `getSessionContext(usuario, maxTurns)`: últimas N perguntas/respostas para contexto de conversa.
- **recentEntities** — `getRecentEntities(usuario, maxEntries)`: entidades das últimas interações (ex.: último cliente/pedido) para referência anafórica.
- **lastAction** — `getLastAction(usuario)`: nome da última ação/tool executada.

Isso permite perguntas de acompanhamento (“quem é esse cliente?”, “quanto ele está devendo?”) usando o mesmo histórico e última ação.

---

## 7. Segurança

- Todas as tools recebem **tenantId** e **userId** (e, quando aplicável, **vendedorId**) do contexto autenticado.
- O contexto é definido em `ToolContext` no registry e em `LeoToolContext` em `server/leo/tools/types.ts`.
- O ActionExecutor e o Agent Core passam esse contexto para o registry; as tools não devem confiar em parâmetros de input para identificar tenant ou usuário.

---

## 8. Resumo

| Item              | Onde / Como |
|-------------------|------------|
| Definição de tools| `server/leo/tools/*.tool.ts` + `index.ts` |
| Registro dinâmico | `tool-registry.ts` → `registerLeoTools()` → `getLeoToolDefinitions()` |
| Execução sem switch | `ActionExecutor.execute(tenantId, action, params)` usa `toolRegistry.getTool(action)` |
| Tool call         | Formato `{ tool, input }`; conversão intent→tool em `intentToToolCall()` |
| Resposta          | `{ success, message, data, meta }` em ActionExecutor e RespostaLeo |
| Memória           | `sessionContext`, `recentEntities`, `lastAction` em `leo-memory.ts` |
| Segurança         | `tenantId` e `userId` em todas as tools via contexto |

Com isso, o LEO funciona como **copiloto modular do ERP**, com ações centralizadas no registry e fluxo único de execução e resposta.
