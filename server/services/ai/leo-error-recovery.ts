/**
 * Auto recuperação — execução segura de tools com resposta padronizada em erro.
 * Nunca expõe erro interno ao usuário.
 */

import { ActionExecutor, type ActionResponse, type ActionParams } from "./action-executor";
import type { ActionExecutorContext } from "./action-executor";
import { logger } from "../../utils/logger";

const SAFE_MESSAGE = "Não consegui completar essa ação agora.";

/**
 * Executa a tool com try/catch; em erro registra log e retorna resposta segura.
 */
export async function safeToolExecute(
  tenantId: number,
  tool: string,
  input: ActionParams,
  ctx?: Partial<ActionExecutorContext>
): Promise<ActionResponse> {
  try {
    return await ActionExecutor.execute(tenantId, tool, input, ctx);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({
      message: "LEO safeToolExecute falhou",
      tool,
      tenantId,
      error: errMsg,
    } as Record<string, unknown>);
    return {
      success: false,
      message: SAFE_MESSAGE,
    };
  }
}
