import { systemLogger } from "./logger";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold: number; // Número de falhas antes de abrir o circuito
  resetTimeoutMs: number; // Tempo em MS para tentar fechar o circuito novamente
  name: string; // Nome para identificação nos logs
}

/**
 * Utilitário de Circuit Breaker para proteção contra falhas em cascata
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  /**
   * Executa uma função protegida pelo Circuit Breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.updateState();

    if (this.state === "OPEN") {
      const remainingTime = Math.ceil((this.lastFailureTime + this.options.resetTimeoutMs - Date.now()) / 1000);
      throw new Error(`[CircuitBreaker: ${this.options.name}] Circuito aberto. Bloqueando requisição. Tente novamente em ${remainingTime}s.`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Retorna o estado atual do circuito
   */
  getState(): CircuitState {
    return this.state;
  }

  private updateState() {
    if (this.state === "OPEN" && Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
      this.state = "HALF_OPEN";
      systemLogger.info({ circuit: this.options.name }, `🔄 Circuit Breaker ${this.options.name} entrou em HALF_OPEN (tentando reconectar)`);
    }
  }

  private onSuccess() {
    if (this.state === "HALF_OPEN" || this.state === "OPEN") {
      systemLogger.info({ circuit: this.options.name }, `✅ Circuit Breaker ${this.options.name} FECHADO (sistema estabilizado)`);
    }
    this.state = "CLOSED";
    this.failureCount = 0;
  }

  private onFailure(error: any) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN" || this.failureCount >= this.options.failureThreshold) {
      if (this.state !== "OPEN") {
        systemLogger.error({ 
          circuit: this.options.name, 
          failureCount: this.failureCount,
          error: error instanceof Error ? error.message : String(error)
        }, `🚨 Circuit Breaker ${this.options.name} ABERTO (muitas falhas detectadas)`);
      }
      this.state = "OPEN";
    }
  }
}

/**
 * Registro global de Circuit Breakers
 */
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Obtém ou cria um Circuit Breaker
 */
export function getCircuitBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({
      name,
      failureThreshold: options?.failureThreshold || 5,
      resetTimeoutMs: options?.resetTimeoutMs || 30000, // 30 segundos padrão
    }));
  }
  return circuitBreakers.get(name)!;
}

/**
 * Retorna o status de todos os circuitos (para o monitor)
 */
export function getAllCircuitsStatus() {
  const status: Record<string, CircuitState> = {};
  circuitBreakers.forEach((cb, name) => {
    status[name] = cb.getState();
  });
  return status;
}
