# Regras de arquitetura do LEO

Este documento define as regras para manter o assistente LEO **isolado das regras de negócio**, **leve** e **fácil de manter**, sem adicionar dependências novas.

---

## 1. Camada de isolamento da IA

O LEO **nunca acessa banco de dados diretamente**. Todas as tools devem chamar **apenas serviços existentes do ERP**.

**Serviços permitidos (exemplos):**

- `clientesService` — clientes
- `ordersService` — pedidos
- `financeService` — financeiro
- `inventoryService` — estoque/produtos
- `logisticaService` — cargas e rotas

**Proibido:**

- Acesso direto a `getDb()`, repositórios, Prisma ou qualquer camada de persistência dentro das tools.

Se uma tool precisar de um dado que hoje não existe em nenhum service, a solução é **estender o service** (ou criar um) e a tool apenas chamar esse service.

---

## 2. Padrão de resposta das tools

Todas as tools retornam o **mesmo formato**, definido em `server/leo/tools/tool-response.ts`:

```ts
{
  success: boolean;
  message: string;
  data?: unknown;
  meta?: Record<string, unknown>;
}
```

**Helper:** `createToolResponse(success, message, data?, meta?)`

Todas as tools devem usar `createToolResponse()` para garantir o formato. O `ActionExecutor` e o frontend dependem desse contrato.

---

## 3. Limites de execução

**Timeout por tool:** 3 segundos (configurável em `tool-timeout.ts`).  
Se ultrapassar, a resposta é:

```json
{ "success": false, "message": "Operação demorou mais que o esperado." }
```

**Guard por requisição** (`leo-execution-guard.ts`):

- **Máximo 5 tools** por requisição (uma pergunta do usuário).
- **Máximo 10 segundos** de tempo total de execução.

Se ultrapassar qualquer um dos limites, a execução é interrompida e retorna mensagem controlada (ex.: "Limite de execução atingido (máximo de tools ou tempo por requisição).").

O guard é iniciado no início de cada `perguntar()` e repassado ao `ActionExecutor` e ao task planner.

---

## 4. Organização das tools

Estrutura por **domínio** em `server/leo/tools/`:

```
server/leo/tools/
├── types.ts           # LeoToolContext, LeoToolResponse, LeoToolDefinition
├── tool-response.ts   # createToolResponse(), ToolResponse
├── index.ts           # getLeoToolDefinitions(), agrega todos os domínios
├── clientes/
│   ├── clientes.tool.ts
│   └── index.ts
├── pedidos/
│   ├── pedidos.tool.ts
│   └── index.ts
├── financeiro/
│   ├── financeiro.tool.ts
│   └── index.ts
├── estoque/
│   ├── estoque.tool.ts
│   └── index.ts
└── analytics/
    └── index.ts       # tools de relatórios/dashboards (expandir conforme necessidade)
```

Cada pasta exporta suas tools via `index.ts`. O registry (`getLeoToolDefinitions`) continua funcionando normalmente; apenas agrega as listas de cada domínio.

---

## 5. Fluxo de execução do LEO

1. **Usuário** envia pergunta (ex.: via chat).
2. **erp-ai.service** `perguntar()`:
   - Cria **execution guard** e chama `guard.startRequest()`.
   - Chama **interpretação** (LLM / intent).
3. **Task planner** (se múltiplas etapas): `planTasks` → `executePlan`; cada etapa chama `ActionExecutor.execute` com o **guard** no contexto.
4. **ActionExecutor.execute** (para cada tool):
   - Verifica **permissão** (`checkToolPermission`).
   - Verifica **guard** (`canRunTool()`); se não puder, retorna limite atingido.
   - (Opcional) **Cache** para tools de leitura pesada.
   - **Timeout** de 3s em volta da execução da tool.
   - Chama **tool** (que usa apenas services do ERP).
   - `guard.recordToolExecuted()`.
   - **Log** de ação (assíncrono).
   - Retorna resposta padronizada.
5. **Resposta** consolidada é devolvida ao usuário.

Nenhuma operação do LEO acessa banco diretamente; todas passam por services e por esse fluxo controlado.
