# Relatório: Reforço da arquitetura do LEO

Objetivo: fortalecer a arquitetura do assistente LEO com isolamento IA/negócio, padronização de resposta, timeout, organização por domínio e limites de execução, **sem novas dependências** e sem quebrar funcionalidade existente.

---

## 1. Arquivos criados

| Arquivo | Descrição |
|--------|-----------|
| `server/leo/tools/tool-response.ts` | Interface `ToolResponse` e helper `createToolResponse(success, message, data?, meta?)` |
| `server/services/ai/tool-timeout.ts` | `executeWithTimeout(promise, ms)` — padrão 3000 ms |
| `server/services/ai/leo-execution-guard.ts` | `createExecutionGuard()` — máx. 5 tools/requisição, 10 s total |
| `server/leo/tools/clientes/clientes.tool.ts` | Tools de clientes (buscar_cliente, detalhar_cliente) usando `clientesService` e `createToolResponse` |
| `server/leo/tools/clientes/index.ts` | Export do domínio clientes |
| `server/leo/tools/pedidos/pedidos.tool.ts` | Tools de pedidos (buscar_pedido, listar_pedidos, criar_pedido) usando `ordersService` e `createToolResponse` |
| `server/leo/tools/pedidos/index.ts` | Export do domínio pedidos |
| `server/leo/tools/financeiro/financeiro.tool.ts` | Tools financeiro (resumo_financeiro, baixar_pedido) usando `financeService` e `createToolResponse` |
| `server/leo/tools/financeiro/index.ts` | Export do domínio financeiro |
| `server/leo/tools/estoque/estoque.tool.ts` | Tool listar_estoque usando **apenas** `inventoryService.getAllProdutosComPrecoVigente` (sem acesso direto ao DB) |
| `server/leo/tools/estoque/index.ts` | Export do domínio estoque |
| `server/leo/tools/analytics/index.ts` | Placeholder para tools de analytics (lista vazia) |
| `docs/LEO_ARCHITECTURE_RULES.md` | Regras: isolamento, resposta padrão, limites, organização, fluxo |

---

## 2. Arquivos modificados

| Arquivo | Alteração |
|--------|-----------|
| `server/leo/tools/index.ts` | Passa a importar tools dos domínios `clientes/`, `pedidos/`, `financeiro/`, `estoque/`, `analytics/` e reexporta `createToolResponse` / `ToolResponse` |
| `server/services/ai/action-executor.ts` | Integra: (1) `ExecutionGuard` — verifica `canRunTool()` antes de executar, chama `recordToolExecuted()` após; (2) `executeWithTimeout(tool.handler(...), 3000)`; (3) tipo `ActionExecutorContext` com `guard?: ExecutionGuard` |
| `server/services/ai/erp-ai.service.ts` | Cria `createExecutionGuard()`, chama `guard.startRequest()` no início de `perguntar`, passa `{ guard }` em todas as chamadas a `ActionExecutor.execute` e em `PlanContext` para `executePlan` |
| `server/services/ai/task-planner.ts` | `PlanContext` passa a incluir `guard?: ExecutionGuard`; repassa `guard` em cada `ActionExecutor.execute` |

---

## 3. Arquivos removidos

| Arquivo | Motivo |
|--------|--------|
| `server/leo/tools/clientes.tool.ts` | Substituído por `clientes/clientes.tool.ts` |
| `server/leo/tools/pedidos.tool.ts` | Substituído por `pedidos/pedidos.tool.ts` |
| `server/leo/tools/financeiro.tool.ts` | Substituído por `financeiro/financeiro.tool.ts` |
| `server/leo/tools/estoque.tool.ts` | Substituído por `estoque/estoque.tool.ts` (e refatorado para usar só `inventoryService`) |

---

## 4. Estrutura final das tools

```
server/leo/tools/
├── types.ts              # LeoToolContext, LeoToolResponse, LeoToolDefinition
├── tool-response.ts      # createToolResponse(), ToolResponse
├── index.ts              # getLeoToolDefinitions(), agregador
├── clientes/
│   ├── clientes.tool.ts  # clientesTool, detalharClienteTool
│   └── index.ts
├── pedidos/
│   ├── pedidos.tool.ts   # buscarPedidoTool, listarPedidosTool, criarPedidoTool
│   └── index.ts
├── financeiro/
│   ├── financeiro.tool.ts # resumoFinanceiroTool, baixarPedidoTool
│   └── index.ts
├── estoque/
│   ├── estoque.tool.ts   # estoqueTool (listar_estoque)
│   └── index.ts
└── analytics/
    └── index.ts         # analyticsToolList (vazio, expansível)
```

O registry em `server/leo/agent/tool-registry.ts` continua usando `getLeoToolDefinitions()` do `server/leo/tools`; não foi alterado.

---

## 5. Proteções adicionadas

1. **Isolamento IA**  
   - `estoque.tool` deixou de usar `db.getDb()` e `db.produtos`; usa apenas `inventoryService.getAllProdutosComPrecoVigente` e filtra/limita em memória.  
   - Demais tools já usavam apenas services.

2. **Resposta padronizada**  
   - Todas as tools passam a usar `createToolResponse()`, garantindo `{ success, message, data?, meta? }`.

3. **Timeout de execução**  
   - Cada execução de tool é envolvida em `executeWithTimeout(..., 3000)`. Em caso de atraso, retorna `{ success: false, message: "Operação demorou mais que o esperado." }`.

4. **Limites por requisição**  
   - Guard com **máximo 5 tools** e **10 segundos** totais por requisição.  
   - Iniciado em `perguntar()` e repassado ao ActionExecutor e ao task planner.  
   - Se o limite for atingido, retorna mensagem controlada e interrompe novas execuções nessa requisição.

---

## 6. Garantia de não quebra

- **Nomes das tools** inalterados: `buscar_cliente`, `detalhar_cliente`, `buscar_pedido`, `listar_pedidos`, `criar_pedido`, `resumo_financeiro`, `baixar_pedido`, `listar_estoque`.
- **Assinaturas** de input das tools mantidas (mesmos schemas Zod).
- **Formato de resposta** já era compatível com `LeoToolResponse`; apenas padronizado via `createToolResponse`.
- **Registro** segue via `getLeoToolDefinitions()`; nenhuma alteração em `tool-registry.ts` além do uso indireto da nova estrutura.
- **erp-ai.service** e **task-planner** seguem o mesmo fluxo; apenas recebem e repassam o `guard`.

Recomenda-se rodar os testes existentes do LEO/chat e, se houver, testes de integração das tools, para validar em ambiente de desenvolvimento.
