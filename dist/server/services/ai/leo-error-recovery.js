/**
 * Auto recuperação — execução segura de tools com resposta padronizada em erro.
 * Nunca expõe erro interno ao usuário.
 */
import { ActionExecutor } from "./action-executor.js";
import { logger } from "../../utils/logger.js";
const SAFE_MESSAGE = "Não consegui completar essa ação agora.";
/**
 * Executa a tool com try/catch; em erro registra log e retorna resposta segura.
 */
export async function safeToolExecute(tenantId, tool, input, ctx) {
    try {
        return await ActionExecutor.execute(tenantId, tool, input, ctx);
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error({
            message: "LEO safeToolExecute falhou",
            tool,
            tenantId,
            error: errMsg,
        });
        return {
            success: false,
            message: SAFE_MESSAGE,
        };
    }
}
