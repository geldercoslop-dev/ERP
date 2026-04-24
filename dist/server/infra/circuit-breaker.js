/**
 * Circuit Breaker - Real Implementation
 *
 * Estados: CLOSED (normal) → OPEN (falhas) → HALF_OPEN (testa recuperação)
 * Padrão: Detecta cascata de falhas, interrompe calls, retoma gradualmente
 */
import { logError, logWarn, logInfo } from '../_core/logger.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';
export var CircuitBreakerStatus;
(function (CircuitBreakerStatus) {
    CircuitBreakerStatus["CLOSED"] = "CLOSED";
    CircuitBreakerStatus["OPEN"] = "OPEN";
    CircuitBreakerStatus["HALF_OPEN"] = "HALF_OPEN";
})(CircuitBreakerStatus || (CircuitBreakerStatus = {}));
/**
 * Implementação real do Circuit Breaker
 */
export class CircuitBreaker {
    status = CircuitBreakerStatus.CLOSED;
    failureCount = 0;
    successCount = 0;
    requestWindow = [];
    lastFailureTime;
    lastStateChangeTime = Date.now();
    nextAttemptTime;
    serviceName;
    timeoutMs;
    errorThreshold;
    resetTimeoutMs;
    windowSize;
    fallbackFn;
    constructor(serviceName, options = {}) {
        this.serviceName = serviceName;
        this.timeoutMs = options.timeout ?? 5000;
        this.errorThreshold = options.errorThreshold ?? 50;
        this.resetTimeoutMs = options.resetTimeout ?? 30000;
        this.windowSize = options.windowSize ?? 10;
        this.fallbackFn = options.fallback;
    }
    /**
     * Executa operação com proteção do circuit breaker
     */
    async fire(operation) {
        const now = Date.now();
        // Se está OPEN, verifica se é hora de tentar HALF_OPEN
        if (this.status === CircuitBreakerStatus.OPEN) {
            if (this.nextAttemptTime && now < this.nextAttemptTime) {
                // Ainda no período de espera
                logWarn(`[CB:${this.serviceName}] Circuit OPEN, rejeitando request (próxima tentativa em ${Math.round((this.nextAttemptTime - now) / 1000)}s)`);
                if (this.fallbackFn) {
                    return this.fallbackFn();
                }
                throw new InfrastructureError(`Circuit breaker OPEN para ${this.serviceName}`);
            }
            // Transição para HALF_OPEN
            this.status = CircuitBreakerStatus.HALF_OPEN;
            logInfo(`[CB:${this.serviceName}] Transitando para HALF_OPEN (testando recuperação)`);
            this.lastStateChangeTime = now;
        }
        // Executar operação com timeout
        const startTime = Date.now();
        try {
            const result = await Promise.race([
                operation(),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Circuit breaker timeout (${this.timeoutMs}ms)`)), this.timeoutMs)),
            ]);
            // Sucesso
            const responseTime = Date.now() - startTime;
            this.recordSuccess(responseTime);
            // Se estava em HALF_OPEN, volta para CLOSED
            if (this.status === CircuitBreakerStatus.HALF_OPEN) {
                this.status = CircuitBreakerStatus.CLOSED;
                this.failureCount = 0;
                this.successCount = 0;
                this.requestWindow = [];
                logInfo(`[CB:${this.serviceName}] Recuperado! Voltando para CLOSED`);
            }
            return result;
        }
        catch (error) {
            // Falha
            this.recordFailure(error);
            // Se está em HALF_OPEN, abre novamente
            if (this.status === CircuitBreakerStatus.HALF_OPEN) {
                this.openCircuit();
                logWarn(`[CB:${this.serviceName}] Falha em HALF_OPEN, reabrindo circuit`);
            }
            throw error;
        }
    }
    /**
     * Registra sucesso
     */
    recordSuccess(responseTime) {
        this.successCount++;
        this.addToWindow({
            success: true,
            responseTime,
            timestamp: Date.now(),
        });
        // Se estava em HALF_OPEN e temos sucesso, não precisa fazer mais nada
        // (a lógica de transição está em fire())
    }
    /**
     * Registra falha e verifica se precisa abrir o circuit
     */
    recordFailure(error) {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        this.addToWindow({
            success: false,
            responseTime: 0,
            timestamp: this.lastFailureTime,
            error: error.message,
        });
        // Calcula taxa de falha na janela deslizante
        const failureRate = this.calculateFailureRate();
        // Se taxa de falha ultrapassar limiar, abre circuit
        if (failureRate >= this.errorThreshold && this.status === CircuitBreakerStatus.CLOSED) {
            logWarn(`[CB:${this.serviceName}] Taxa de falha ${failureRate}% >= limiar ${this.errorThreshold}%, abrindo circuit`);
            this.openCircuit();
        }
    }
    /**
     * Abre o circuit e agenda próxima tentativa
     */
    openCircuit() {
        this.status = CircuitBreakerStatus.OPEN;
        this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
        this.lastStateChangeTime = Date.now();
        logError(`[CB:${this.serviceName}] Circuit ABERTO! Próxima tentativa em ${Math.round(this.resetTimeoutMs / 1000)}s`);
    }
    /**
     * Adiciona requisição à janela deslizante
     */
    addToWindow(record) {
        this.requestWindow.push(record);
        // Mantém apenas últimas windowSize requisições
        if (this.requestWindow.length > this.windowSize) {
            this.requestWindow.shift();
        }
    }
    /**
     * Calcula taxa de falha na janela atual
     */
    calculateFailureRate() {
        if (this.requestWindow.length === 0)
            return 0;
        const failures = this.requestWindow.filter(r => !r.success).length;
        return Math.round((failures / this.requestWindow.length) * 100);
    }
    /**
     * Obtém estado atual
     */
    getState() {
        const totalRequests = this.requestWindow.length;
        const failures = this.requestWindow.filter(r => !r.success).length;
        const totalResponseTime = this.requestWindow.reduce((sum, r) => sum + r.responseTime, 0);
        const averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
        return {
            status: this.status,
            failureCount: failures,
            successCount: totalRequests - failures,
            totalRequests,
            failureRate: this.calculateFailureRate(),
            lastFailureTime: this.lastFailureTime,
            nextAttemptTime: this.nextAttemptTime,
            averageResponseTime: Math.round(averageResponseTime),
        };
    }
    /**
     * Retorna stats para observabilidade
     */
    getStats() {
        const state = this.getState();
        return {
            service: this.serviceName,
            status: this.status,
            totalRequests: state.totalRequests,
            totalFailures: state.failureCount,
            totalSuccesses: state.successCount,
            failureRate: state.failureRate,
            averageResponseTime: state.averageResponseTime,
            lastFailureTime: state.lastFailureTime,
            nextAttemptTime: state.nextAttemptTime,
        };
    }
    /**
     * Reset manual do circuit breaker
     */
    reset() {
        this.status = CircuitBreakerStatus.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.requestWindow = [];
        this.lastFailureTime = undefined;
        this.nextAttemptTime = undefined;
        logInfo(`[CB:${this.serviceName}] Circuit breaker resetado manualmente`);
    }
}
/**
 * Gerenciador global de Circuit Breakers
 */
export class CircuitBreakerManager {
    static instances = new Map();
    /**
     * Cria ou obtém um circuit breaker para um serviço
     */
    static createCircuitBreaker(serviceName, options) {
        if (this.instances.has(serviceName)) {
            return this.instances.get(serviceName);
        }
        const breaker = new CircuitBreaker(serviceName, options);
        this.instances.set(serviceName, breaker);
        logInfo(`[CB] Circuit breaker criado para ${serviceName}`);
        return breaker;
    }
    /**
     * Executa operação com proteção de circuit breaker
     */
    static async executeWithBreaker(serviceName, operation, options) {
        const breaker = this.createCircuitBreaker(serviceName, options);
        return breaker.fire(operation);
    }
    /**
     * Obtém estado de um circuit breaker
     */
    static getState(serviceName) {
        return this.instances.get(serviceName)?.getState() ?? null;
    }
    /**
     * Lista todos os circuit breakers e seus estados
     */
    static listCircuitBreakers() {
        const result = {};
        for (const [name, breaker] of this.instances.entries()) {
            result[name] = breaker.getStats();
        }
        return result;
    }
    /**
     * Reseta um circuit breaker
     */
    static resetCircuitBreaker(serviceName) {
        this.instances.get(serviceName)?.reset();
    }
    /**
     * Limpa todos os circuit breakers
     */
    static resetAll() {
        for (const breaker of this.instances.values()) {
            breaker.reset();
        }
    }
}
/**
 * Para compatibilidade com código existente que espera interface "fire"
 */
export async function executeWithCircuitBreaker(serviceName, operation, options) {
    return CircuitBreakerManager.executeWithBreaker(serviceName, operation, options);
}
