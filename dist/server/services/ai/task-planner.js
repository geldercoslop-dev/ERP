// BLOQUEADO — LOTE 1 FINALIZADO
// ISOLAMENTO LEO + HARDEN CONCLUÍDO
// NÃO ALTERAR SEM AUTORIZAÇÃO
/**
 * Task Planner — execução de múltiplas ações do LEO em sequência.
 * Máximo 5 etapas, execução sequencial, sem workflow complexo.
 */
import { ActionExecutor } from "./action-executor.js";
// LEO ISOLADO — import removido
// import { toolRegistry } from "../../leo/agent/tool-registry.js";
// Stub para toolRegistry — LEO ISOLADO
const toolRegistry = {
    getTool: (_name) => {
        throw new Error("LEO ISOLADO — toolRegistry não disponível");
    },
};
const MAX_STEPS = 5;
/**
 * Extrai mensagem de erro de forma determinística sem JSON.stringify
 */
function getErrorMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "string")
        return err;
    if (typeof err === "number" || typeof err === "boolean") {
        return String(err);
    }
    if (err && typeof err === "object") {
        if ("message" in err && typeof err.message === "string") {
            return err.message;
        }
        return "[object error]";
    }
    return "[unknown error]";
}
/**
 * Gera um plano de até MAX_STEPS etapas a partir da mensagem e interpretação.
 * Retorna steps vazios se não houver tools reconhecidas.
 */
export function planTasks(userMessage, interpretation) {
    const steps = [];
    // LEO ISOLADO — toolRegistry removido
    throw new Error("LEO ISOLADO — planTasks não disponível");
    /*
    // Se já existe um toolCall único, usar como única etapa
    if (interpretation.toolCall && toolRegistry.getTool(interpretation.toolCall.tool)) {
      steps.push({ tool: interpretation.toolCall.tool, input: interpretation.toolCall.input ?? {} });
      return { steps };
    }
    */
    // Heurística simples: frases que sugerem múltiplas ações
    const msg = userMessage.toLowerCase();
    const hasRelatorio = /relatório|relatorio|vendas de hoje|hoje/.test(msg);
    const hasTopClientes = /top|mais compraram|maiores clientes|5 clientes/.test(msg);
    const hasPedidos = /pedidos|vendas/.test(msg);
    // LEO ISOLADO — lógica de toolRegistry removida
    /*
    if (hasRelatorio && hasTopClientes && hasPedidos) {
      if (toolRegistry.getTool("listar_pedidos")) {
        steps.push({ tool: "listar_pedidos", input: { page: 1, pageSize: 100 } });
      }
      if (toolRegistry.getTool("resumo_financeiro")) {
        steps.push({ tool: "resumo_financeiro", input: { periodo: "hoje" } });
      }
      if (toolRegistry.getTool("buscar_cliente")) {
        steps.push({ tool: "buscar_cliente", input: {} });
      }
    }
    */
    // Limitar a MAX_STEPS
    const trimmed = steps.slice(0, MAX_STEPS);
    return { steps: trimmed };
}
/**
 * Executa o plano sequencialmente. Se uma etapa falhar, registra e continua quando possível.
 */
export async function executePlan(plan, ctx) {
    if (!plan.steps.length) {
        return {
            success: false,
            message: "Nenhuma etapa no plano.",
            steps: [],
        };
    }
    const stepResults = [];
    const outputs = [];
    let lastMessage = "";
    for (const step of plan.steps) {
        // LEO ISOLADO — toolRegistry removido
        throw new Error("LEO ISOLADO — execução de tool não disponível");
        /*
        const tool = toolRegistry.getTool(step.tool);
        if (!tool) {
          console.warn(`Task planner: tool não encontrada: ${step.tool}`);
          stepResults.push({
            step,
            result: { success: false, message: `Tool "${step.tool}" não reconhecida.` },
            success: false,
          });
          continue;
        }
        */
        try {
            const res = await ActionExecutor.execute(ctx.tenantId, step.tool, step.input, {
                userId: ctx.userId,
                userRole: ctx.userRole,
                vendedorId: ctx.vendedorId,
                guard: ctx.guard,
            });
            stepResults.push({ step, result: res, success: res.success });
            lastMessage = res.message;
            if (res.data !== undefined)
                outputs.push(res.data);
        }
        catch (err) {
            const msg = getErrorMessage(err);
            console.error(`Task planner: etapa falhou: ${msg}`, { step: step.tool });
            stepResults.push({
                step,
                result: { success: false, message: msg },
                success: false,
            });
        }
    }
    const allOk = stepResults.every((r) => r.success);
    const hasAnySuccess = stepResults.some((r) => r.success);
    return {
        success: hasAnySuccess,
        message: allOk ? lastMessage : "Algumas etapas falharam; resultado parcial consolidado.",
        steps: stepResults,
        data: outputs.length > 0 ? (outputs.length === 1 ? outputs[0] : outputs) : undefined,
    };
}
