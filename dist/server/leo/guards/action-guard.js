/**
 * Action Guard - Controle de execução por nível de risco
 *
 * Avalia se uma ação pode executar diretamente ou precisa de confirmação.
 * Ações não mapeadas são tratadas como HIGH por segurança (fail-safe).
 */
import { actionRiskMap } from "./action-risk-map.js";
/**
 * Avalia o nível de risco de uma ação
 * @param action - Nome da ação a ser avaliada
 * @returns ActionRisk - "LOW" ou "HIGH"
 */
export function evaluateActionRisk(action) {
    return actionRiskMap[action] ?? "HIGH";
}
/**
 * Verifica se a ação requer confirmação antes da execução
 * @param action - Nome da ação a ser verificada
 * @returns boolean - true se precisa de confirmação
 */
export function requiresConfirmation(action) {
    return evaluateActionRisk(action) === "HIGH";
}
/**
 * Verifica se a ação pode executar diretamente (sem confirmação)
 * @param action - Nome da ação a ser verificada
 * @returns boolean - true se pode executar direto
 */
export function canExecuteDirectly(action) {
    return evaluateActionRisk(action) === "LOW";
}
