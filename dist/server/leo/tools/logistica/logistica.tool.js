import { z } from "zod";
import { getPedidosParaCarga, listCargas, listHistoricoRotas, } from "../../../services/logistica.service.js";
import { assertVendedorActor } from "../../../_core/service-actor.js";
import { serviceActorFromLeoExecutionContext } from "../../runtime/service-actor.js";
import { createToolResponse } from "../tool-response.js";
const verCargasInput = z.object({
    status: z.string().optional(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(50),
});
export const verCargasTool = {
    name: "ver_cargas",
    description: "Lista cargas com filtros",
    inputSchema: verCargasInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const filtros = {
            status: input.status,
            dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
            dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
            page: input.page ?? 1,
            pageSize: input.pageSize ?? 50,
        };
        const result = await listCargas(tenantId, filtros);
        const { total } = result;
        return createToolResponse(true, `Cargas (${total} total).`, result, {
            tool: "ver_cargas",
            total,
        });
    },
};
const verPedidosEntregaInput = z.object({
    clienteId: z.number().optional(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
});
export const verPedidosEntregaTool = {
    name: "ver_pedidos_entrega",
    description: "Lista pedidos disponíveis para carga; vendedor só vê os seus (sem vendedorId no payload)",
    inputSchema: verPedidosEntregaInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const actor = serviceActorFromLeoExecutionContext(ctx);
        const filtros = {
            clienteId: input.clienteId,
            dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
            dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
        };
        if (actor.role === "vendedor") {
            assertVendedorActor(actor);
            filtros.vendedorId = actor.vendedorId;
        }
        const result = await getPedidosParaCarga(tenantId, filtros);
        const payload = Array.isArray(result) ? result : result;
        const count = Array.isArray(result)
            ? result.length
            : (typeof result === "object" && result !== null && "total" in result && typeof result.total === "number"
                ? (result.total)
                : 0);
        return createToolResponse(true, `${count} pedido(s) para carga.`, payload, {
            tool: "ver_pedidos_entrega",
            count,
        });
    },
};
const verHistoricoRotaInput = z.object({
    cargaId: z.number().optional(),
    cidade: z.string().optional(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
});
export const verHistoricoRotaTool = {
    name: "ver_historico_rota",
    description: "Lista histórico de rotas (quando disponível)",
    inputSchema: verHistoricoRotaInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const filtros = {
            cargaId: input.cargaId,
            cidade: input.cidade,
            dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
            dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
        };
        const rows = await listHistoricoRotas(tenantId, filtros);
        return createToolResponse(true, "Histórico de rotas.", rows, { tool: "ver_historico_rota" });
    },
};
