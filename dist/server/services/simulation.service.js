/**
 * Serviço de Simulação Operacional
 *
 * Status: DESABILITADO
 * Motivo: O fluxo de simulação depende de APIs que não são compatíveis com a arquitetura atual.
 *
 * A arquitetura atual é: LEO → TOOLS → SERVICES → DB
 * Não é permitido acesso direto ao DB fora de services.
 */
const traceId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export async function runSimulation() {
    throw new Error("Simulation desabilitada: depende de APIs não compatíveis com a arquitetura atual");
}
