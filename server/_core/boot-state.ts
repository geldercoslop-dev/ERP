/**
 * Boot State Manager
 * Gerencia estado determinístico do boot do sistema
 * Impede que health check retorne falso positivo durante boot
 */

export type BootState = "booting" | "ready" | "degraded" | "error";

let currentState: BootState = "booting";
let stateTransitionTime: number = Date.now();
let stateReason: string = "Sistema iniciando";

/**
 * Obtém estado atual do boot
 */
export function getBootState(): BootState {
  return currentState;
}

/**
 * Obtém metadados do estado atual
 */
export function getBootStateInfo(): {
  state: BootState;
  since: number;
  reason: string;
} {
  return {
    state: currentState,
    since: stateTransitionTime,
    reason: stateReason,
  };
}

/**
 * Transiciona para novo estado
 */
export function setBootState(newState: BootState, reason: string): void {
  const oldState = currentState;
  currentState = newState;
  stateTransitionTime = Date.now();
  stateReason = reason;
  
  console.log(`[BootState] ${oldState} -> ${newState}: ${reason}`);
}

/**
 * Marca sistema como ready (após boot completo)
 */
export function markReady(reason: string = "Boot completo"): void {
  setBootState("ready", reason);
}

/**
 * Marca sistema como degraded (funcional mas com problemas)
 */
export function markDegraded(reason: string): void {
  setBootState("degraded", reason);
}

/**
 * Marca sistema como error (falha crítica)
 */
export function markError(reason: string): void {
  setBootState("error", reason);
}

/**
 * Verifica se sistema está pronto para receber tráfego
 */
export function isReady(): boolean {
  return currentState === "ready" || currentState === "degraded";
}

/**
 * Verifica se sistema está em boot
 */
export function isBooting(): boolean {
  return currentState === "booting";
}
