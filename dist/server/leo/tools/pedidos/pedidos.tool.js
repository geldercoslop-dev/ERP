import { z } from "zod";
import * as ordersService from "../../../services/orders.service.js";
import { createToolResponse } from "../tool-response.js";
import { assertVendedorActor } from "../../../_core/service-actor.js";
import { serviceActorFromLeoExecutionContext } from "../../runtime/service-actor.js";
import { stripSensitiveIdsFromRecord } from "../../../_core/strip-sensitive-payload.js";
import { ValidationError } from '../../../_core/errors/typed-errors.js';
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
export const buscarPedidoTool = {
    name: "buscar_pedido",
    description: "Busca um pedido pelo número de exibição (escopo por vendedor quando aplicável)",
    inputSchema: buscarInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const actor = serviceActorFromLeoExecutionContext(ctx);
        const pedido = await ordersService.getPedidoByNumeroForActor(tenantId, actor, input.numero);
        return createToolResponse(!!pedido, pedido ? `Pedido #${input.numero} encontrado.` : `Pedido #${input.numero} não encontrado.`, pedido ?? null, { tool: "buscar_pedido" });
    },
};
export const listarPedidosTool = {
    name: "listar_pedidos",
    description: "Lista pedidos com paginação; escopo por vendedor/admin vem só do contexto (não use vendedorId no payload)",
    inputSchema: listarInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const actor = serviceActorFromLeoExecutionContext(ctx);
        const params = {
            page: input.page,
            pageSize: input.pageSize,
            status: input.status,
        };
        const result = await ordersService.listPedidosExtended(tenantId, actor, params);
        const { total } = result;
        return createToolResponse(true, `Listagem de pedidos (${total} total).`, result, { tool: "listar_pedidos", total });
    },
};
export const verPedidoTool = {
    name: "ver_pedido",
    description: "Busca um pedido pelo ID interno (escopo por vendedor quando aplicável)",
    inputSchema: verPedidoInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const actor = serviceActorFromLeoExecutionContext(ctx);
        const pedido = await ordersService.getPedidoByIdForActor(tenantId, actor, input.pedidoId);
        return createToolResponse(!!pedido, pedido ? `Pedido id ${input.pedidoId} encontrado.` : "Pedido não encontrado ou sem permissão.", pedido ?? null, { tool: "ver_pedido" });
    },
};
export const criarPedidoTool = {
    name: "criar_pedido",
    description: "Cria pedido apenas como vendedor; vendedorId nunca é lido do payload (só do contexto)",
    inputSchema: criarInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const actor = serviceActorFromLeoExecutionContext(ctx);
        if (actor.role !== "vendedor") {
            throw new ValidationError("criar_pedido: apenas vendedor autenticado (admin use API com trustedVendedorId)");
        }
        assertVendedorActor(actor);
        const raw = stripSensitiveIdsFromRecord({ ...input.dados });
        const pedidoPayload = { ...raw, vendedorId: 0 };
        const novoPedido = await ordersService.createPedidoSafe(tenantId, pedidoPayload, actor);
        return createToolResponse(true, `Pedido #${novoPedido.numero} criado com sucesso.`, novoPedido, { tool: "criar_pedido" });
    },
};
