import { z } from "zod";
import * as clientesService from "../../../services/clientes.service.js";
import { createToolResponse } from "../tool-response.js";
import { serviceActorFromLeoExecutionContext } from "../../runtime/service-actor.js";
const inputSchema = z.object({
    nome: z.string().optional().describe("Nome ou parte do nome do cliente"),
    clienteId: z.number().optional().describe("ID do cliente para detalhar"),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(20),
});
async function execute(input, context) {
    const { tenantId } = context;
    const actor = serviceActorFromLeoExecutionContext(context);
    if (input.clienteId != null) {
        const cliente = await clientesService.getClienteById(tenantId, actor, input.clienteId);
        return createToolResponse(!!cliente.success && !!cliente.data, cliente.success && cliente.data ? "Dados do cliente carregados." : (cliente.error ?? "Cliente não encontrado."), cliente.data ?? null, { tool: "detalhar_cliente" });
    }
    if (input.nome?.trim()) {
        const clientes = await clientesService.searchClientesByNome(tenantId, actor, input.nome.trim(), 10);
        const items = clientes.success && clientes.data ? clientes.data : [];
        return createToolResponse(clientes.success, clientes.success
            ? `Encontrei ${items.length} cliente(s) com o nome "${input.nome}".`
            : (clientes.error ?? "Falha ao buscar clientes."), items, { tool: "buscar_cliente", count: items.length });
    }
    const list = await clientesService.listClientes(tenantId, actor, {
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 20,
    });
    const listData = list.success && list.data ? list.data : { items: [], total: 0 };
    return createToolResponse(list.success, list.success ? `Listagem de clientes (${listData.total} total).` : (list.error ?? "Falha ao listar clientes."), listData, { tool: "listar_clientes", total: listData.total });
}
export const clientesTool = {
    name: "buscar_cliente",
    description: "Busca clientes por nome ou lista com paginação; ou detalha um cliente por ID",
    inputSchema,
    execute,
};
export const detalharClienteTool = {
    name: "detalhar_cliente",
    description: "Obtém detalhes de um cliente pelo ID",
    inputSchema,
    execute: (input, ctx) => execute(input, ctx),
};
