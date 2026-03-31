import { z } from "zod";
import * as ordersService from "../../../services/orders.service.js";
import type { CreatePedidoSafeInput, ListPedidosParams } from "../../../services/orders.service.js";
import type { LeoToolContext, LeoToolDefinition } from "../types.js";
import { createToolResponse } from "../tool-response.js";
import { assertVendedorActor, serviceActorFromLeoExecutionContext } from "../../../_core/service-actor.js";
import { stripSensitiveIdsFromRecord } from "../../../_core/strip-sensitive-payload.js";

const buscarInput = z.object({
  numero: z.number().describe("Número do pedido (número de exibição, não o id interno)"),
});
const listarInput = z.object({
  page: z.number().optional().default(1),
  pageSize: z.number().optional().default(20),
  status: z.string().optional(),
});
const criarInput = z.object({
  dados: z
    .record(z.string(), z.unknown())
    .describe("Dados do pedido (sem vendedorId — sempre ignorado se enviado). Apenas vendedor autenticado."),
});
const verPedidoInput = z.object({
  pedidoId: z.number().describe("ID interno do pedido"),
});

export const buscarPedidoTool: LeoToolDefinition<z.infer<typeof buscarInput>> = {
  name: "buscar_pedido",
  description: "Busca um pedido pelo número de exibição (escopo por vendedor quando aplicável)",
  inputSchema: buscarInput,
  async execute(input, ctx) {
    const { tenantId } = ctx;
    const actor = serviceActorFromLeoExecutionContext(ctx);
    const pedido = await ordersService.getPedidoByNumeroForActor(tenantId, actor, input.numero);
    return createToolResponse(
      !!pedido,
      pedido ? `Pedido #${input.numero} encontrado.` : `Pedido #${input.numero} não encontrado.`,
      pedido ?? null,
      { tool: "buscar_pedido" }
    );
  },
};

export const listarPedidosTool: LeoToolDefinition<z.infer<typeof listarInput>> = {
  name: "listar_pedidos",
  description: "Lista pedidos com paginação; escopo por vendedor/admin vem só do contexto (não use vendedorId no payload)",
  inputSchema: listarInput,
  async execute(input, ctx) {
    const { tenantId } = ctx;
    const actor = serviceActorFromLeoExecutionContext(ctx);
    const params: ListPedidosParams = {
      page: input.page,
      pageSize: input.pageSize,
      status: input.status,
    };
    const result = await ordersService.listPedidosExtended(tenantId, actor, params);
    return createToolResponse(
      true,
      `Listagem de pedidos (${result.total} total).`,
      result,
      { tool: "listar_pedidos", total: result.total }
    );
  },
};

export const verPedidoTool: LeoToolDefinition<z.infer<typeof verPedidoInput>> = {
  name: "ver_pedido",
  description: "Busca um pedido pelo ID interno (escopo por vendedor quando aplicável)",
  inputSchema: verPedidoInput,
  async execute(input, ctx) {
    const { tenantId } = ctx;
    const actor = serviceActorFromLeoExecutionContext(ctx);
    const pedido = await ordersService.getPedidoByIdForActor(tenantId, actor, input.pedidoId);
    return createToolResponse(
      !!pedido,
      pedido ? `Pedido id ${input.pedidoId} encontrado.` : "Pedido não encontrado ou sem permissão.",
      pedido ?? null,
      { tool: "ver_pedido" }
    );
  },
};

export const criarPedidoTool: LeoToolDefinition<z.infer<typeof criarInput>> = {
  name: "criar_pedido",
  description: "Cria pedido apenas como vendedor; vendedorId nunca é lido do payload (só do contexto)",
  inputSchema: criarInput,
  async execute(input, ctx) {
    const { tenantId } = ctx;
    const actor = serviceActorFromLeoExecutionContext(ctx);
    if (actor.role !== "vendedor") {
      throw new Error("criar_pedido: apenas vendedor autenticado (admin use API com trustedVendedorId)");
    }
    assertVendedorActor(actor);
    const raw = stripSensitiveIdsFromRecord({ ...(input.dados as Record<string, unknown>) });
    const pedidoPayload = { ...raw, vendedorId: 0 } as CreatePedidoSafeInput;
    const novoPedido = await ordersService.createPedidoSafe(tenantId, pedidoPayload, actor);
    return createToolResponse(
      true,
      `Pedido #${novoPedido.numero} criado com sucesso.`,
      novoPedido,
      { tool: "criar_pedido" }
    );
  },
};
