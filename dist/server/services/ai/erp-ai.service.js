/**
 * LEO — Copiloto inteligente do ERP.
 * Fluxo: pergunta → normalização → identificação da intenção → tools/services → resposta.
 */
import { interpretar } from "./llm-interpreter.js";
import { ActionExecutor } from "./action-executor.js";
import { planTasks, executePlan } from "./task-planner.js";
import { createExecutionGuard } from "./leo-execution-guard.js";
import { leoMemory } from "./leo-memory.js";
import { logger } from "../../utils/logger.js";
import * as actionEngine from "./action-engine.js";
// LEO ISOLADO — import removido
// import { buildLeoSessionKey, leoSessionGate } from "../../leo/runtime/leo-session-gate.js";
// Stub para leoSessionGate — LEO ISOLADO
const leoSessionGate = {
    run: async (_key, fn) => fn(),
};
// Stub para buildLeoSessionKey — LEO ISOLADO  
function buildLeoSessionKey(tenantId, userId, sessionId, _user) {
    return `leo:${tenantId}:${userId ?? 'anon'}:${sessionId ?? 'default'}`;
}
import { leoRoleFromActor } from "../../leo/runtime/service-actor.js";
function isRecord(v) {
    return typeof v === "object" && v !== null;
}
function pedidoFromToolData(data) {
    if (!isRecord(data))
        return null;
    const id = Number(data.id);
    const numero = Number(data.numero);
    if (!Number.isFinite(id) || !Number.isFinite(numero))
        return null;
    return {
        id,
        numero,
        clienteNome: String(data.clienteNome ?? ""),
        total: Number(data.total ?? 0),
    };
}
/** Mapeia intent + entities para tool call { tool, input } para uso no ActionExecutor. */
function intentToToolCall(intent, entities) {
    switch (intent) {
        case "consultar_pedido":
            return { tool: "buscar_pedido", input: { numero: entities.numeroPedido } };
        case "consultar_cliente":
            return { tool: "buscar_cliente", input: { nome: entities.nomeCliente } };
        case "consultar_financeiro":
            return { tool: "resumo_financeiro", input: { periodo: entities.periodo } };
        case "consultar_estoque":
            return { tool: "listar_estoque", input: { nome: entities.nomeProduto } };
        default:
            return null;
    }
}
/**
 * Responde à pergunta do usuário utilizando interpretação de linguagem natural (LLM).
 * Concorrência: uma execução por sessão (fila interna).
 */
function leoExecutionContextFromOptions(options) {
    return {
        userId: options.userId,
        userRole: leoRoleFromActor(options.actor),
        vendedorId: options.actor.role === "vendedor" ? options.actor.vendedorId : undefined,
    };
}
export async function perguntar(tenantId, pergunta, usuario, options) {
    if (!tenantId || tenantId <= 0) {
        return { success: false, error: "Tenant ID inválido ou ausente" };
    }
    if (!options?.userId || options.userId <= 0) {
        return { success: false, error: "userId obrigatório para o LEO" };
    }
    if (!options?.actor) {
        return { success: false, error: "actor obrigatório para o LEO" };
    }
    const user = usuario || "Usuário";
    const sessionKey = buildLeoSessionKey(tenantId, options.userId, options.sessionId, user);
    const result = await leoSessionGate.run(sessionKey, () => perguntarUnqueued(tenantId, pergunta, user, options));
    if (!result.success) {
        return { success: false, error: result.message };
    }
    return { success: true, data: result };
}
async function perguntarUnqueued(tenantId, pergunta, user, options) {
    const guard = createExecutionGuard();
    guard.startRequest();
    const execBase = { ...leoExecutionContextFromOptions(options), guard };
    logger.info({ message: "LEO recebendo pergunta (fila por sessão)", tenantId, user, pergunta });
    const padrao = (success, message, data, meta, extra) => ({
        success,
        message,
        response: message,
        data,
        meta: meta ?? { timestamp: new Date().toISOString() },
        context: extra?.context,
        action: extra?.action,
        pendingConfirmation: extra?.pendingConfirmation,
    });
    try {
        const interpretacao = await interpretar(pergunta);
        const { intent, entities } = interpretacao;
        if (intent === "status_sistema") {
            throw new Error("SystemObserver não implementado ainda");
        }
        if (intent === "dar_baixa_pedido") {
            const res = await ActionExecutor.execute(tenantId, "buscar_pedido", { numero: entities.numeroPedido }, execBase);
            const pedido = pedidoFromToolData(res.data);
            if (res.success && pedido) {
                leoMemory.record(user, pergunta, res.message, entities, intent, tenantId);
                return padrao(true, `Encontrei o pedido #${pedido.numero} do cliente ${pedido.clienteNome}. Confirma a baixa deste pedido?`, res.data, { intent }, {
                    action: intent,
                    pendingConfirmation: {
                        action: "baixar_pedido",
                        resumo: `Baixa do pedido #${pedido.numero} (${pedido.clienteNome})`,
                        payload: { pedidoId: pedido.id, dados: { formaPagamento: "PIX", valor: pedido.total } },
                    },
                    context: { entities, intent },
                });
            }
            leoMemory.record(user, pergunta, res.message, entities, intent, tenantId);
            return padrao(res.success, res.message, res.data, res.meta, { action: intent });
        }
        if (intent === "gerar_relatorio") {
            const respostaTexto = `Vou gerar o relatório de ${entities.tipoRelatorio || "dados"} para você agora.`;
            leoMemory.record(user, pergunta, respostaTexto, entities, intent, tenantId);
            return padrao(true, respostaTexto, null, { intent }, { action: intent });
        }
        const plan = planTasks(pergunta, {
            intent,
            toolCall: interpretacao.toolCall ?? intentToToolCall(intent, entities) ?? undefined,
            entities: entities,
        });
        if (plan.steps.length > 1) {
            const planCtx = {
                tenantId,
                guard,
                userId: options.userId,
                userRole: execBase.userRole,
                vendedorId: execBase.vendedorId,
            };
            const planResult = await executePlan(plan, planCtx);
            const msg = planResult.message +
                (planResult.data
                    ? "\n" +
                        (typeof planResult.data === "object"
                            ? JSON.stringify(planResult.data).slice(0, 500)
                            : String(planResult.data).slice(0, 500))
                    : "");
            leoMemory.record(user, pergunta, msg, entities, intent, tenantId);
            return padrao(planResult.success, msg, planResult.data, { intent, steps: planResult.steps.length }, { action: intent });
        }
        const toolCall = interpretacao.toolCall ?? intentToToolCall(intent, entities);
        if (toolCall) {
            const res = await ActionExecutor.execute(tenantId, toolCall.tool, toolCall.input, execBase);
            leoMemory.record(user, pergunta, res.message, entities, intent, tenantId);
            return padrao(res.success, res.message, res.data, { ...res.meta, intent, tool: toolCall.tool }, { action: intent });
        }
        const respostaTexto = "Desculpe, ainda não sei como processar esse pedido. Tente perguntar sobre pedidos, clientes ou financeiro.";
        leoMemory.record(user, pergunta, respostaTexto, entities, intent, tenantId);
        return padrao(false, respostaTexto, null, { intent }, { action: intent });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error({ message: "Erro no processamento do LEO", tenantId, user, pergunta, error: errMsg });
        return padrao(false, "Opa, tive um problema técnico ao processar sua pergunta. Pode tentar de novo?", null, { error: true });
    }
}
/** Executa ação previamente confirmada pelo usuário (baixa pedido, etc.). Mesma fila de sessão que `perguntar`. */
export async function confirmarAcao(tenantId, action, payload, usuario, options) {
    const sessionKey = buildLeoSessionKey(tenantId, options?.userId, options?.sessionId, usuario);
    return leoSessionGate.run(sessionKey, () => confirmarAcaoUnqueued(tenantId, action, payload, usuario, options));
}
async function confirmarAcaoUnqueued(tenantId, action, payload, usuario, options) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        return { ok: false, mensagem: "Tenant inválido." };
    }
    if (!options?.actor) {
        return { ok: false, mensagem: "Contexto de segurança (actor) ausente." };
    }
    if (action === "baixa_pedido") {
        const pedidoId = Number(payload.pedidoId);
        const entradaForma = payload.entradaForma || "DINHEIRO";
        const entradaValor = Number(payload.entradaValor ?? payload.valor ?? 0);
        if (!pedidoId || !Number.isFinite(pedidoId))
            return { ok: false, mensagem: "Pedido inválido." };
        return actionEngine.executarBaixaPedido(tenantId, pedidoId, { entradaForma: entradaForma, entradaValor }, usuario, options.actor);
    }
    if (action === "registrar_pagamento") {
        const contaId = Number(payload.contaId);
        const dataRecebimento = payload.dataRecebimento || new Date().toISOString().slice(0, 10);
        const formaPagamento = payload.formaPagamento || "DINHEIRO";
        if (!contaId || !Number.isFinite(contaId))
            return { ok: false, mensagem: "Conta inválida." };
        return actionEngine.executarRegistrarPagamento(tenantId, contaId, dataRecebimento, formaPagamento, usuario, options.actor);
    }
    return { ok: false, mensagem: "Ação não reconhecida." };
}
