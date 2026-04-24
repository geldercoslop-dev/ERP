// BLOQUEADO — LOTE 2 FINALIZADO
// ISOLAMENTO LEO EM ROUTERS CONCLUÍDO
// NÃO ALTERAR SEM AUTORIZAÇÃO
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from '../_core/trpc.js';
import { requireTenant } from "../_core/tenant.js";
// LEO ISOLADO — imports removidos
// import { leoEngine } from '../leo/engine/leo-engine.js';
// import { leoLoop } from '../leo/engine/leo-loop.js';
// Stubs que retornam valores válidos — LEO ISOLADO
const leoEngine = {
    getStatus: () => ({ online: false, running: false, uptime: 0, runCount: 0 }),
};
const leoLoop = {
    getLoopStatus: () => ({ running: false, uptime: 0, runCount: 0 }),
    start: () => { },
    stop: () => { },
};
import { perguntar } from "../services/ai/erp-ai.service.js";
import { resolveServiceActor } from "../_core/service-actor.js";
// Schema de validação — sessionId: fila LEO por aba/cliente (1 ação ativa por sessão)
const perguntaSchema = z.object({
    pergunta: z.string().min(1, "Pergunta é obrigatória"),
    contexto: z.string().optional(),
    sessionId: z.string().max(128).optional(),
});
const controleSchema = z.object({
    acao: z.enum(["iniciar", "parar", "reiniciar", "status"]),
});
export const leoRouter = router({
    // Status do LEO — STUB LEO ISOLADO
    status: publicProcedure.query(async () => {
        return {
            ativo: false,
            uptime: 0,
            ciclo: 0,
            memoria: {}, // Simplificado por enquanto
            tarefas: {}, // Simplificado por enquanto
            timestamp: new Date().toISOString(),
        };
    }),
    // Chat com o LEO (Endpoint definitivo para o frontend)
    chat: protectedProcedure
        .input(perguntaSchema)
        .mutation(async ({ input, ctx }) => {
        try {
            const tenantId = await requireTenant(ctx);
            const usuario = ctx.user?.name || "Usuário";
            if (!ctx.user?.id) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida para o LEO." });
            }
            const actor = await resolveServiceActor(ctx);
            const resposta = await perguntar(tenantId, input.pergunta, usuario, {
                sessionId: input.sessionId,
                userId: ctx.user.id,
                actor,
            });
            return resposta;
        }
        catch (error) {
            console.error('Erro no chat com LEO:', error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error instanceof Error ? error.message : "Erro ao processar chat",
            });
        }
    }),
    // Alias para compatibilidade ou uso específico se necessário
    ask: protectedProcedure
        .input(perguntaSchema)
        .mutation(async ({ input, ctx }) => {
        try {
            const tenantId = await requireTenant(ctx);
            const actor = {
                id: ctx.user?.id || 0,
                role: ctx.user?.role === 'admin' ? 'admin' : 'vendedor',
                vendedorId: ctx.user?.id || 0
            };
            const usuario = ctx.user?.name || "Usuário";
            // erp-ai.service já retorna o formato padronizado
            const resposta = await perguntar(tenantId, input.pergunta, usuario, {
                sessionId: input.sessionId,
                userId: ctx.user?.id || 0,
                actor
            });
            return {
                resposta,
            };
        }
        catch (error) {
            console.error('Erro no chat com LEO:', error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error instanceof Error ? error.message : "Erro ao processar pergunta",
            });
        }
    }),
    // Controle do LEO
    control: protectedProcedure
        .input(controleSchema)
        .mutation(async ({ input, ctx }) => {
        // STUB LEO ISOLADO — leoLoop removido
        return {
            success: false,
            message: 'LEO ISOLADO — router bloqueado',
            acao: input.acao,
            timestamp: new Date().toISOString(),
        };
    }),
    // Teste do LEO
    test: protectedProcedure
        .input(z.object({ prompt: z.string(), sessionId: z.string().max(128).optional() }))
        .mutation(async ({ input, ctx }) => {
        try {
            const tenantId = await requireTenant(ctx);
            const usuario = ctx.user?.name || "Admin";
            if (!ctx.user?.id) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida para o LEO." });
            }
            const actor = await resolveServiceActor(ctx);
            const resposta = await perguntar(tenantId, input.prompt, usuario, {
                sessionId: input.sessionId,
                userId: ctx.user.id,
                actor,
            });
            if (!resposta.success || !resposta.data) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: resposta.error ?? "Falha ao processar resposta do LEO",
                });
            }
            const respostaData = resposta.data;
            return {
                prompt: input.prompt,
                resposta: respostaData.response,
                data: respostaData.data,
                pendingConfirmation: respostaData.pendingConfirmation,
                success: true,
                timestamp: new Date()
            };
        }
        catch (error) {
            console.error('Erro no endpoint de teste do LEO:', error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: error instanceof Error ? error.message : "Erro ao testar LEO",
            });
        }
    }),
    // Insights do LEO
    insights: publicProcedure.query(async () => {
        try {
            // Dados mock simplificados por enquanto
            return [
                {
                    id: '1',
                    action: 'Sistema inicializado',
                    entity: 'LEO',
                    result: 'SUCESSO',
                    timestamp: new Date()
                },
                {
                    id: '2',
                    action: 'Monitoramento ativo',
                    entity: 'ERP',
                    result: 'SUCESSO',
                    timestamp: new Date()
                }
            ];
        }
        catch (error) {
            console.error('Erro ao buscar insights do LEO:', error);
            return [];
        }
    }),
    // Memória do LEO
    memories: publicProcedure.query(async () => {
        try {
            // Dados mock simplificados por enquanto
            return [
                {
                    id: '1',
                    type: 'event',
                    content: 'LEO inicializado e monitorando sistema',
                    timestamp: new Date()
                },
                {
                    id: '2',
                    type: 'decision',
                    content: 'Análise de padrões de vendas iniciada',
                    timestamp: new Date()
                }
            ];
        }
        catch (error) {
            console.error('Erro ao buscar memória do LEO:', error);
            return [];
        }
    }),
});
