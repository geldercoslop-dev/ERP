import { z } from "zod";
import * as clientesService from "../../../services/clientes.service.js";
import type { LeoToolContext, LeoToolDefinition } from "../types.js";
import { createToolResponse } from "../tool-response.js";
import { serviceActorFromLeoExecutionContext } from "../../../_core/service-actor.js";

type Payload = Record<string, unknown>;

const inputSchema = z.object({
  nome: z.string().optional().describe("Nome ou parte do nome do cliente"),
  clienteId: z.number().optional().describe("ID do cliente para detalhar"),
  page: z.number().optional().default(1),
  pageSize: z.number().optional().default(20),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, context: LeoToolContext) {
  const { tenantId } = context;
  const actor = serviceActorFromLeoExecutionContext(context);

  if (input.clienteId != null) {
    const cliente = await clientesService.getClienteById(tenantId, actor, input.clienteId);
    return createToolResponse(
      !!cliente.success && !!cliente.data,
      cliente.success && cliente.data ? "Dados do cliente carregados." : (cliente.error ?? "Cliente não encontrado."),
      cliente.data ?? null,
      { tool: "detalhar_cliente" }
    );
  }

  if (input.nome?.trim()) {
    const clientes = await clientesService.searchClientesByNome(tenantId, actor, input.nome.trim(), 10);
    const items = clientes.success && clientes.data ? clientes.data : [];
    return createToolResponse(
      clientes.success,
      clientes.success
        ? `Encontrei ${items.length} cliente(s) com o nome "${input.nome}".`
        : (clientes.error ?? "Falha ao buscar clientes."),
      items,
      { tool: "buscar_cliente", count: items.length }
    );
  }

  const list = await clientesService.listClientes(tenantId, actor, {
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 20,
  });
  const listData = list.success && list.data ? list.data : { items: [], total: 0 };
  return createToolResponse(
    list.success,
    list.success ? `Listagem de clientes (${listData.total} total).` : (list.error ?? "Falha ao listar clientes."),
    listData,
    { tool: "listar_clientes", total: listData.total }
  );
}

export const clientesTool: LeoToolDefinition<Input> = {
  name: "buscar_cliente",
  description: "Busca clientes por nome ou lista com paginação; ou detalha um cliente por ID",
  inputSchema,
  execute,
};

export const detalharClienteTool: LeoToolDefinition<Input> = {
  name: "detalhar_cliente",
  description: "Obtém detalhes de um cliente pelo ID",
  inputSchema,
  execute: (input, ctx) => execute(input, ctx),
};
