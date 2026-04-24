// BLOQUEADO — LOTE 2 FINALIZADO
// ISOLAMENTO LEO EM ROUTERS CONCLUÍDO
// NÃO ALTERAR SEM AUTORIZAÇÃO
import { z, ZodError } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc.js";
// LEO ISOLADO — imports removidos
// import { leoAgentCore } from "../leo/agent/agent-core.js";
// import { leoLogManager } from "../leo/utils/leo-log-manager.js";
// Stubs que retornam valores válidos — LEO ISOLADO
const leoAgentCore = {
    handleRequest: (_request) => ({ success: false, response: "LEO ISOLADO — router bloqueado", toolCalls: [], executionTime: 0, error: undefined }),
};
const leoLogManager = {
    writeLog: (_log) => { },
};
import { parseLeoActionPayload } from "../services/leoActionPayload.parse.js";
const leoActionSchema = z.enum(["CREATE_ORDER", "PROCESS_PAYMENT", "REGISTER_SALE"]);
function parseLeoActionFromCommand(command) {
    const normalized = command.toUpperCase();
    if (normalized.includes("PEDIDO") || normalized.includes("CREATE_ORDER"))
        return "CREATE_ORDER";
    if (normalized.includes("PAGAMENTO") || normalized.includes("PROCESS_PAYMENT"))
        return "PROCESS_PAYMENT";
    if (normalized.includes("VENDA") || normalized.includes("REGISTER_SALE"))
        return "REGISTER_SALE";
    return null;
}
// Create router with middleware
const leoRouterWithMiddleware = router({
    ask: protectedProcedure
        .input(z.object({
        pergunta: z.string().min(1),
        context: z.record(z.string(), z.unknown()).optional(),
        sessionId: z.string().max(128).optional(),
    }))
        .mutation(async ({ input, ctx }) => {
        const usuario = ctx.user?.openId ?? ctx.user?.name ?? "usuario";
        if (!ctx.tenantId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "ID do tenant é obrigatório para o LEO." });
        }
        // STUB LEO ISOLADO — leoLogManager.writeLog removido
        const mappedAction = parseLeoActionFromCommand(input.pergunta);
        if (mappedAction && ctx.tenantId) {
            // STUB LEO ISOLADO — leoLogManager.writeLog removido
            return {
                success: false,
                resposta: "LEO ISOLADO — router bloqueado",
                acaoExecutada: mappedAction,
                detalhes: { success: false, message: "LEO ISOLADO — router bloqueado" },
                timestamp: new Date().toISOString(),
            };
        }
    }),
    // Endpoint específico para o novo agente
    agentAsk: protectedProcedure
        .input(z.object({
        message: z.string().min(1),
        context: z.record(z.string(), z.unknown()).optional(),
        sessionId: z.string().max(128).optional(),
    }))
        .mutation(async ({ input, ctx }) => {
        if (!ctx.tenantId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "ID do tenant é obrigatório para o LEO Agent." });
        }
        // STUB LEO ISOLADO — leoAgentCore.handleRequest removido
        return {
            success: false,
            response: "LEO ISOLADO — router bloqueado",
            toolCalls: [],
            executionTime: 0,
            error: undefined,
        };
    }),
    confirmAction: protectedProcedure
        .input(z.object({
        action: leoActionSchema,
        payload: z.record(z.string(), z.unknown()).optional(),
        confirmed: z.boolean().optional().default(true),
    }))
        .mutation(async ({ input, ctx }) => {
        if (!ctx.tenantId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "ID do tenant é obrigatório para confirmar ação." });
        }
        let parsedPayload;
        if (input.confirmed) {
            try {
                parsedPayload = parseLeoActionPayload(input.action, input.payload ?? {});
            }
            catch (err) {
                if (err instanceof ZodError) {
                    const flat = err.flatten();
                    const parts = [...flat.formErrors];
                    for (const msgs of Object.values(flat.fieldErrors)) {
                        if (Array.isArray(msgs)) {
                            for (const m of msgs) {
                                if (typeof m === "string")
                                    parts.push(m);
                            }
                        }
                    }
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: parts.length > 0 ? parts.join("; ") : "Payload inválido para a ação.",
                    });
                }
                if (err instanceof Error) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
                }
                throw new TRPCError({ code: "BAD_REQUEST", message: "Payload inválido para a ação." });
            }
        }
        // STUB LEO ISOLADO — leoActionService.executeAction removido
        const response = {
            message: "LEO ISOLADO — router bloqueado",
            ok: false,
            requiresConfirmation: false,
            action: input.action,
            timestamp: new Date().toISOString(),
            result: null,
        };
        return {
            mensagem: response.message,
            ok: response.ok,
            requiresConfirmation: response.requiresConfirmation,
            action: response.action,
            timestamp: response.timestamp,
            result: response.result,
        };
    }),
    insights: publicProcedure.query(async () => {
        const now = Date.now();
        const { getProdutosCache, getClientesCache, getFinanceiroResumoCache } = await import("../cache/intelligent-cache.js");
        const [produtos, clientes, financeiro] = await Promise.all([
            getProdutosCache(),
            getClientesCache(),
            getFinanceiroResumoCache(),
        ]);
        return [
            { id: "pedidos_total", title: "Pedidos", message: "0 pedidos (cache desabilitado)", type: "operacional", timestamp: now },
            { id: "produtos_total", title: "Produtos", message: `${produtos.length} produtos no cache`, type: "estoque", timestamp: now },
            { id: "clientes_total", title: "Clientes", message: `${clientes.length} clientes no cache`, type: "vendas", timestamp: now },
            {
                id: "financeiro_resumo",
                title: "Financeiro",
                message: `A receber: ${financeiro.aReceber} | A pagar: ${financeiro.aPagar} | Vencidas: ${financeiro.vencidas}`,
                type: "financeiro",
                timestamp: now,
            },
        ];
    }),
});
// Apply middleware and export
export const leoRouter = leoRouterWithMiddleware;
