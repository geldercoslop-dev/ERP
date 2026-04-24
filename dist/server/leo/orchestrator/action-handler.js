/**
 * Action Handler - Orquestrador central de ações do LEO
 *
 * Responsável por:
 * 1. Avaliar o risco da ação (LOW vs HIGH)
 * 2. Decidir se executa direto ou solicita confirmação
 * 3. Retornar o resultado padronizado
 *
 * NÃO executa ações - apenas decide o fluxo.
 */
import { requiresConfirmation } from "../guards/action-guard.js";
/**
 * Processa uma ação através do guarda de risco
 *
 * @param action - Nome da ação a ser processada
 * @param payload - Dados/payload da ação
 * @param preview - Descrição/preview para apresentar na confirmação
 * @returns ActionResult - EXECUTE (rodar direto) ou CONFIRM (pedir confirmação)
 */
export function handleAction(action, payload, preview) {
    if (requiresConfirmation(action)) {
        return {
            type: "CONFIRM",
            action,
            payload,
            preview,
            riskLevel: "HIGH",
        };
    }
    return {
        type: "EXECUTE",
        action,
        payload,
    };
}
/**
 * Processa uma ação com contexto adicional
 *
 * @param action - Nome da ação
 * @param payload - Dados da ação
 * @param preview - Descrição para confirmação
 * @param context - Contexto adicional (usuário, tenant, etc)
 * @returns ActionResult
 */
export function handleActionWithContext(action, payload, preview, context) {
    // Se veio de automação/planner, pode ter regras diferentes
    if (context.source === "leo_planner" || context.source === "leo_observer") {
        // TODO: Adicionar lógica específica para ações automáticas
    }
    return handleAction(action, payload, preview);
}
