import { systemLogger } from "./logger.js";
import { InfrastructureError } from './errors/typed-errors.js';
/**
 * Utilitário de Circuit Breaker para proteção contra falhas em cascata
 */
export class CircuitBreaker {
    state = "CLOSED";
    failureCount = 0;
    lastFailureTime = 0;
    options;
    constructor(options) {
        this.options = options;
    }
    /**
     * Executa uma função protegida pelo Circuit Breaker
     */
    async execute(fn) {
        this.updateState();
        if (this.state === "OPEN") {
            const remainingTime = Math.ceil((this.lastFailureTime + this.options.resetTimeoutMs - Date.now()) / 1000);
            throw new InfrastructureError(`[CircuitBreaker: ${this.options.name}] Circuito aberto. Bloqueando requisição. Tente novamente em ${remainingTime}s.`);
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure(error);
            throw error;
        }
    }
    /**
     * Retorna o estado atual do circuito
     */
    getState() {
        return this.state;
    }
    updateState() {
        if (this.state === "OPEN" && Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
            this.state = "HALF_OPEN";
            systemLogger.info({ circuit: this.options.name }, `🔄 Circuit Breaker ${this.options.name} entrou em HALF_OPEN (tentando reconectar)`);
        }
    }
    onSuccess() {
        if (this.state === "HALF_OPEN" || this.state === "OPEN") {
            systemLogger.info({ circuit: this.options.name }, `✅ Circuit Breaker ${this.options.name} FECHADO (sistema estabilizado)`);
        }
        this.state = "CLOSED";
        this.failureCount = 0;
    }
    onFailure(error) {
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
const circuitBreakers = new Map();
/**
 * Obtém ou cria um Circuit Breaker
 */
export function getCircuitBreaker(name, options) {
    if (!circuitBreakers.has(name)) {
        circuitBreakers.set(name, new CircuitBreaker({
            name,
            failureThreshold: options?.failureThreshold || 5,
            resetTimeoutMs: options?.resetTimeoutMs || 30000, // 30 segundos padrão
        }));
    }
    return circuitBreakers.get(name);
}
/**
 * Retorna o status de todos os circuitos (para o monitor)
 */
export function getAllCircuitsStatus() {
    const status = {};
    circuitBreakers.forEach((cb, name) => {
        status[name] = cb.getState();
    });
    return status;
}
