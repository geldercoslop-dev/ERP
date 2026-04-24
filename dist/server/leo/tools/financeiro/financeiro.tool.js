import { z } from "zod";
import * as financeService from "../../../services/finance.service.js";
import { createToolResponse } from "../tool-response.js";
import { serviceActorFromLeoExecutionContext } from "../../runtime/service-actor.js";
export const resumoFinanceiroTool = {
    name: "resumo_financeiro",
    description: "Retorna resumo financeiro consolidado (contas a receber, pagar, caixa)",
    inputSchema: z.object({}),
    async execute(_, ctx) {
        const { tenantId } = ctx;
        const actor = serviceActorFromLeoExecutionContext(ctx);
        const financeiro = await financeService.getResumoFinanceiro(tenantId, actor);
        return createToolResponse(true, "Resumo financeiro consolidado.", financeiro, {
            tool: "resumo_financeiro",
        });
    },
};
const baixarInput = z.object({
    pedidoId: z.number(),
    dados: z.record(z.string(), z.unknown()).describe("Forma de pagamento e valor"),
});
export const baixarPedidoTool = {
    name: "baixar_pedido",
    description: "Dá baixa em um pedido (registra pagamento)",
    inputSchema: baixarInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const actor = serviceActorFromLeoExecutionContext(ctx);
        const baixa = await financeService.baixarPedidoDireto(tenantId, input.pedidoId, input.dados, {
            actor,
        });
        return createToolResponse(true, `Pedido #${baixa.pedidoNumero} baixado com sucesso.`, baixa, { tool: "baixar_pedido" });
    },
};
const contasReceberInput = z.object({
    status: z.string().optional().describe("Filtrar por status"),
    dataInicio: z.string().optional().describe("Data inicial (YYYY-MM-DD)"),
    dataFim: z.string().optional().describe("Data final (YYYY-MM-DD)"),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(50),
});
export const listarContasReceberTool = {
    name: "listar_contas_receber",
    description: "Lista contas a receber (escopo por vendedor quando aplicável)",
    inputSchema: contasReceberInput,
    async execute(input, ctx) {
        const { tenantId } = ctx;
        const actor = serviceActorFromLeoExecutionContext(ctx);
        const filtros = {
            status: input.status,
            dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
            dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
            page: input.page ?? 1,
            pageSize: input.pageSize ?? 50,
        };
        const result = await financeService.listContasReceber(tenantId, actor, filtros);
        const { total } = result;
        return createToolResponse(true, `Contas a receber (${total} total).`, result, { tool: "listar_contas_receber", total });
    },
};
