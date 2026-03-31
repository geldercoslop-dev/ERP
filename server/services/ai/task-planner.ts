/**
 * Task Planner — execução de múltiplas ações do LEO em sequência.
 * Máximo 5 etapas, execução sequencial, sem workflow complexo.
 */

import { ActionExecutor, type ActionResponse, type ActionParams } from "./action-executor.js";
import { toolRegistry } from "../../leo/agent/tool-registry.js";
import { logger } from "../../utils/logger.js";
import type { ExecutionGuard } from "./leo-execution-guard.js";

const MAX_STEPS = 5;

export type PlanStep = {
  tool: string;
  input: Record<string, unknown>;
};

export type TaskPlan = {
  steps: PlanStep[];
};

export type PlanContext = {
  tenantId: number;
  userId?: number;
  userRole?: string;
  vendedorId?: number;
  guard?: ExecutionGuard;
};

export type StepResult = {
  step: PlanStep;
  result: ActionResponse;
  success: boolean;
};

export type ExecutePlanResult = {
  success: boolean;
  message: string;
  steps: StepResult[];
  data?: unknown;
};

/**
 * Gera um plano de até MAX_STEPS etapas a partir da mensagem e interpretação.
 * Retorna steps vazios se não houver tools reconhecidas.
 */
export function planTasks(
  userMessage: string,
  interpretation: { intent?: string; toolCall?: { tool: string; input: Record<string, unknown> }; entities?: Record<string, unknown> }
): TaskPlan {
  const steps: PlanStep[] = [];

  // Se já existe um toolCall único, usar como única etapa
  if (interpretation.toolCall && toolRegistry.getTool(interpretation.toolCall.tool)) {
    steps.push({ tool: interpretation.toolCall.tool, input: interpretation.toolCall.input ?? {} });
    return { steps };
  }

  // Heurística simples: frases que sugerem múltiplas ações
  const msg = userMessage.toLowerCase();
  const hasRelatorio = /relatório|relatorio|vendas de hoje|hoje/.test(msg);
  const hasTopClientes = /top|mais compraram|maiores clientes|5 clientes/.test(msg);
  const hasPedidos = /pedidos|vendas/.test(msg);

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

  // Limitar a MAX_STEPS
  const trimmed = steps.slice(0, MAX_STEPS);
  return { steps: trimmed };
}

/**
 * Executa o plano sequencialmente. Se uma etapa falhar, registra e continua quando possível.
 */
export async function executePlan(plan: TaskPlan, ctx: PlanContext): Promise<ExecutePlanResult> {
  if (!plan.steps.length) {
    return {
      success: false,
      message: "Nenhuma etapa no plano.",
      steps: [],
    };
  }

  const stepResults: StepResult[] = [];
  const outputs: unknown[] = [];
  let lastMessage = "";

  for (const step of plan.steps) {
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

    try {
      const res = await ActionExecutor.execute(ctx.tenantId, step.tool, step.input as ActionParams, {
        userId: ctx.userId,
        userRole: ctx.userRole,
        vendedorId: ctx.vendedorId,
        guard: ctx.guard,
      });
      stepResults.push({ step, result: res, success: res.success });
      lastMessage = res.message;
      if (res.data !== undefined) outputs.push(res.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Task planner: etapa falhou: ${msg}`, { step: step.tool });
      stepResults.push({
        step,
        result: { success: false, message: msg },
        success: false,
      });
    }
  }

  const allOk = stepResults.every((r) => r.success);
  const anyOk: boolean = stepResults.some((r) => r.success);

  return {
    success: anyOk,
    message: allOk ? lastMessage : "Algumas etapas falharam; resultado parcial consolidado.",
    steps: stepResults,
    data: outputs.length > 0 ? (outputs.length === 1 ? outputs[0] : outputs) : undefined,
  };
}
