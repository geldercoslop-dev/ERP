import { z, ZodError } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc.js";
import { perguntar } from "../services/ai/erp-ai.service.js";
import { resolveServiceActor } from "../_core/service-actor.js";
import { leoAgentCore } from "../leo/agent/agent-core.js";
import { leoLogManager } from "../leo/utils/leo-log-manager.js";
import { leoActionService, type LeoAction, type LeoActionPayloadMap } from "../services/leoAction.service.js";
import { parseLeoActionPayload } from "../services/leoActionPayload.parse.js";
import { ValidationError } from '../_core/errors/typed-errors.js';

const leoActionSchema = z.enum(["CREATE_ORDER", "PROCESS_PAYMENT", "REGISTER_SALE"]);

function parseLeoActionFromCommand(command: string): LeoAction | null {
  const normalized = command.toUpperCase();
  if (normalized.includes("PEDIDO") || normalized.includes("CREATE_ORDER")) return "CREATE_ORDER";
  if (normalized.includes("PAGAMENTO") || normalized.includes("PROCESS_PAYMENT")) return "PROCESS_PAYMENT";
  if (normalized.includes("VENDA") || normalized.includes("REGISTER_SALE")) return "REGISTER_SALE";
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

      leoLogManager.writeLog({
        timestamp: new Date(),
        level: "INFO",
        module: "LEO_ROUTER",
        message: "Entrada do LEO recebida",
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.user?.id,
          role: ctx.user?.role,
          pergunta: input.pergunta,
        },
      });

      const mappedAction = parseLeoActionFromCommand(input.pergunta);
      if (mappedAction && ctx.tenantId) {
        leoLogManager.writeLog({
          timestamp: new Date(),
          level: "INFO",
          module: "LEO_ROUTER",
          message: "Ação detectada pelo parser do LEO",
          data: {
            action: mappedAction,
            tenantId: ctx.tenantId,
            userId: ctx.user?.id,
          },
        });
        const controlResponse = await leoActionService.executeAction({
          action: mappedAction,
          actor: {
            tenantId: ctx.tenantId,
            userId: ctx.user?.id,
            userName: ctx.user?.name ?? usuario,
            role: ctx.user?.role,
            vendedorId: ctx.vendedor?.id,
          },
          confirmed: false,
        });
        if (controlResponse.requiresConfirmation) {
          return {
            mensagem: controlResponse.message,
            toolCalls: [],
            success: true,
            executionTime: 0,
            requiresConfirmation: true,
            action: mappedAction,
          };
        }
      }

      // Usar o novo LEO Agent Core
      try {
        const agentResponse = await leoAgentCore.handleRequest({
          message: input.pergunta,
          tenantId: ctx.tenantId,
          userRole: ctx.user?.role,
          userId: ctx.user?.id,
          vendedorId: ctx.vendedor?.id,
          context: input.context
        });

        return {
          mensagem: agentResponse.response,
          toolCalls: agentResponse.toolCalls,
          success: agentResponse.success,
          executionTime: agentResponse.executionTime,
          error: agentResponse.error
        };
      } catch (error) {
        // Fallback para o serviço antigo em caso de erro
        const errorMessage = error instanceof Error ? error.message : String(error);
        leoLogManager.writeLog({
          timestamp: new Date(),
          level: "ERROR",
          module: "LEO_ROUTER",
          message: "Erro no LEO Agent Core, acionando fallback",
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.user?.id,
            error: errorMessage,
          },
        });
        if (!ctx.tenantId) {
          throw new ValidationError("Tenant ID is required for fallback");
        }
        const actor = await resolveServiceActor(ctx);
        const fallbackResponse = await perguntar(ctx.tenantId, input.pergunta, usuario, {
          userId: ctx.user.id,
          actor,
        });
        return {
          mensagem: (fallbackResponse as { response?: string }).response ?? '',
          toolCalls: [],
          success: fallbackResponse.success ?? true,
          executionTime: 0,
          fallback: true,
          data: fallbackResponse.data
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

      const agentResponse = await leoAgentCore.handleRequest({
        message: input.message,
        tenantId: ctx.tenantId,
        userRole: ctx.user?.role,
        userId: ctx.user?.id,
        vendedorId: ctx.vendedor?.id,
        sessionId: input.sessionId,
        context: input.context
      });

      return agentResponse;
    }),

  confirmAction: protectedProcedure
    .input(
      z.object({
        action: leoActionSchema,
        payload: z.record(z.string(), z.unknown()).optional(),
        confirmed: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ID do tenant é obrigatório para confirmar ação." });
      }
      let parsedPayload: LeoActionPayloadMap[LeoAction] | undefined;
      if (input.confirmed) {
        try {
          parsedPayload = parseLeoActionPayload(input.action, input.payload ?? {});
        } catch (err) {
          if (err instanceof ZodError) {
            const flat = err.flatten();
            const parts: string[] = [...flat.formErrors];
            for (const msgs of Object.values(flat.fieldErrors)) {
              if (Array.isArray(msgs)) {
                for (const m of msgs) {
                  if (typeof m === "string") parts.push(m);
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
      const response = await leoActionService.executeAction({
        action: input.action,
        payload: parsedPayload,
        actor: {
          tenantId: ctx.tenantId,
          userId: ctx.user?.id,
          userName: ctx.user?.name ?? ctx.user?.openId ?? "usuario",
          role: ctx.user?.role,
          vendedorId: ctx.vendedor?.id,
        },
        confirmed: input.confirmed,
      });
      return {
        mensagem: response.message,
        ok: response.ok,
        requiresConfirmation: response.requiresConfirmation,
        action: response.action,
        timestamp: response.timestamp,
        result: response.result,
      };
    }),

  insights: protectedProcedure.query(async ({ ctx }) => {
    const now = Date.now();
    
    if (!ctx.tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "ID do tenant é obrigatório para insights." });
    }

    const actor = await resolveServiceActor(ctx);
    const { getProdutosCache, getClientesCache, getFinanceiroResumoCache } = await import("../cache/intelligent-cache.js");

    const [produtos, clientes, financeiro] = await Promise.all([
      getProdutosCache(ctx.tenantId),
      getClientesCache(ctx.tenantId, actor),
      getFinanceiroResumoCache(ctx.tenantId, actor),
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

