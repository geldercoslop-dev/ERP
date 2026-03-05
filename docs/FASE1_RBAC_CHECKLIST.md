# FASE 1 — RBAC/ACL Backend — Checklist e Endpoints

## Objetivo
Isolamento absoluto por vendedor: nenhuma query retorna dados globais para vendedor; nenhuma rota permite forçar `vendedorId` no payload.

---

## Checklist de teste manual

### 1. Login vendedor A
- [ ] Entrar com usuário **vendedor** (ex.: vendedor A).
- [ ] Confirmar que a lista de **Pedidos** mostra apenas pedidos do vendedor A.
- [ ] Confirmar que a lista de **Clientes** mostra apenas clientes que têm ao menos um pedido do vendedor A.
- [ ] Confirmar que **Contas a receber** e **Boletos** mostram apenas itens do vendedor A.

### 2. Tentar acessar pedido do vendedor B via URL/API
- [ ] Com vendedor A logado, obter um **ID de pedido** que pertença ao **vendedor B** (ex.: logar como admin, anotar um pedido de B; ou usar devtools/API).
- [ ] Acessar diretamente (ou via front) um recurso que use esse ID, por exemplo:
  - **Detalhe do pedido**: `pedidos.getById({ id: <id_do_pedido_B> })`
  - **Atualizar status**: `pedidos.updateStatus({ id: <id_do_pedido_B>, status: 'IMPRESSO' })`
  - **Gerar PDF**: `pedidos.gerarPDF({ id: <id_do_pedido_B> })`
  - **Excluir**: `pedidos.delete({ id: <id_do_pedido_B> })`
- [ ] **Resultado esperado**: resposta **403 Forbidden** (ou **404**) e mensagem tipo "Acesso negado." / "Pedido não encontrado."
- [ ] Nenhum dado do pedido de B deve ser retornado.

### 3. Tentar acessar conta a receber / boleto de outro vendedor
- [ ] Com vendedor A logado, usar um **ID de conta a receber** ou **ID de boleto** que pertença ao vendedor B.
- [ ] Chamar `contasReceber.marcarRecebida`, `contasReceber.delete`, ou `boletos.gerarPDF` com esse ID.
- [ ] **Resultado esperado**: **403** (ou **404**).

### 4. Garantir que vendedorId não pode ser forçado
- [ ] Na criação de **Conta a receber**, o payload não deve aceitar `vendedorId`; o backend usa sempre o vendedor da sessão.
- [ ] Na criação de **Pedido** (fluxo Nova Venda), o `vendedorId` é definido no servidor a partir do contexto; o cliente não envia esse campo.

### 5. Admin
- [ ] Logado como **admin**, listar pedidos/clientes/contas/boletos e confirmar que **todos** os registros são visíveis.
- [ ] Admin pode abrir pedido de qualquer vendedor, gerar PDF, atualizar status, etc.

---

## Endpoints alterados (tRPC)

| Router | Procedure | Alteração |
|--------|-----------|-----------|
| **clientes** | `list` | Para `role !== admin`: retorna apenas clientes com ao menos um pedido do vendedor (`listClientesByVendedor`). |
| **clientes** | `search` | Para `role !== admin`: mesma restrição por vendedor (`searchClientesByVendedor`). |
| **clientes** | `update` | Para `role !== admin`: verifica ownership via `clienteTemPedidoDoVendedor`; 403 se cliente não tiver pedido do vendedor. |
| **pedidos** | `list` | Já existia filtro por `vendedorId` para não-admin. Nenhuma mudança de contrato. |
| **pedidos** | `getById` | Já existia checagem de ownership. Mantido. |
| **pedidos** | `getItens` | Já existia checagem de ownership. Mantido. |
| **pedidos** | `update` | **Novo:** antes de atualizar, verifica ownership (pedido.vendedorId === vendedor.id); 403 se não for do vendedor. |
| **pedidos** | `delete` | Já existia checagem de ownership. Mantido. |
| **pedidos** | `updateStatus` | Já existia checagem de ownership. Mantido. |
| **pedidos** | `gerarPDF` | Já existia checagem de ownership. Mantido. |
| **pedidos** | `marcarEntregue` | Já existia checagem de ownership. Mantido. |
| **pedidos** | `buscar` | **Alterado:** deixou de usar REST mock; usa mesma query SQL de `list` com filtro por vendedor e termo de busca (não retorna dados globais para vendedor). |
| **pedidos** | `create` | Não aceita `vendedorId` no input (legacy). Fluxo principal é `createVenda`, que define `vendedorId` no servidor. |
| **contasReceber** | `list` | Já existia: admin vê todas; vendedor vê só as suas (`getContasReceberByVendedor`). |
| **contasReceber** | `create` | **Reforçado:** payload montado explicitamente sem usar `input.vendedorId`; `vendedorId` vem apenas do contexto. |
| **contasReceber** | `marcarRecebida` | **Novo:** para não-admin, verifica ownership (conta.vendedorId); 403 se conta for de outro vendedor ou sem vendedor. |
| **contasReceber** | `delete` | **Novo:** mesma verificação de ownership que `marcarRecebida`. |
| **boletos** | `list` | Já existia: admin vê todos; vendedor vê só os seus. |
| **boletos** | `gerarPDF` | **Novo:** para não-admin, verifica ownership (boleto.vendedorId); 403 se boleto for de outro vendedor. |
| **boletos** | `gerarExtrato` | **Novo:** para não-admin, verifica se o cliente tem boleto do vendedor; PDF gerado com filtro por `vendedorId` (só boletos do vendedor). |
| **boletos** | `gerarBoletosCarga` | **Novo:** para não-admin, verifica que todos os pedidos da carga são do vendedor; 403 caso contrário. |
| **boletos** | `gerarZip` | **Novo:** para não-admin, verifica ownership de cada boleto da lista; 403 se algum for de outro vendedor. |

---

## Funções novas / alteradas em `server/db.ts`

| Função | Descrição |
|--------|-----------|
| `listClientesByVendedor(vendedorId)` | Lista clientes que têm ao menos um pedido do vendedor (isolamento sem coluna `vendedorId` em `clientes`). |
| `searchClientesByVendedor(term, vendedorId)` | Busca clientes por termo restrita a clientes com pedido do vendedor. |
| `clienteTemPedidoDoVendedor(clienteId, vendedorId)` | Retorna true se o cliente tem ao menos um pedido do vendedor (ownership para update). |
| `getContaReceberById(id)` | Retorna `{ id, vendedorId }` para checagem de ownership. |
| `getBoletoById(id)` | Retorna `{ id, vendedorId }` para checagem de ownership. |
| `getContasReceberByVendedor` | Ajuste de `where` (um único `and` quando há status). |

---

## PDF

| Arquivo | Alteração |
|---------|-----------|
| `server/pdf.ts` | `gerarExtratoClientePDF(clienteId, vendedorId?)`: parâmetro opcional `vendedorId`; quando informado, filtra boletos apenas desse vendedor. |

---

## Esquema

- **Nenhuma alteração de schema** (tabelas/colunas) nesta fase.
- Isolamento de **clientes** por vendedor é feito via vínculo com **pedidos** (clientes que têm pedido do vendedor).

---

## Garantias

- **Estoque**: consulta global (produtos/catálogo); alteração de estoque já é `adminProcedure`. Nenhuma mudança.
- **Garantias**: não há endpoint dedicado de “garantias”; dados de garantia vêm de produtos e itens de pedido, já cobertos por ownership de pedidos.
- **REST**: rotas REST em `server/routes/` (ex.: `pedidos.ts`, `clientes.ts`) usam dados mock/in-memory; o uso real do sistema é via tRPC. Isolamento RBAC aplicado nos procedimentos tRPC acima.
