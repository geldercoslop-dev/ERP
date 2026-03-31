/**
 * Circuit Breaker - Real Implementation
 * 
 * Estados: CLOSED (normal) → OPEN (falhas) → HALF_OPEN (testa recuperação)
 * Padrão: Detecta cascata de falhas, interrompe calls, retoma gradualmente
 */

import { logError, logWarn, logInfo } from '../_core/logger.js';

export enum CircuitBreakerStatus {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  timeout?: number; // 5s padrão
  errorThreshold?: number; // 50% padrão (5 falhas em 10 tentativas)
  resetTimeout?: number; // 30s padrão para retry
  windowSize?: number; // número de requisições a rastrear (padrão 10)
  fallback?: () => Promise<unknown>; // função fallback quando OPEN
}

export interface CircuitBreakerState {
  status: CircuitBreakerStatus;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failureRate: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
  averageResponseTime: number;
}

interface RequestRecord {
  success: boolean;
  responseTime: number;
  timestamp: number;
  error?: string;
}

/**
 * Implementação real do Circuit Breaker
 */
export class CircuitBreaker {
  private status: CircuitBreakerStatus = CircuitBreakerStatus.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private requestWindow: RequestRecord[] = [];
  private lastFailureTime?: number;
  private lastStateChangeTime = Date.now();
  private nextAttemptTime?: number;
  
  private readonly serviceName: string;
  private readonly timeoutMs: number;
  private readonly errorThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly windowSize: number;
  private readonly fallbackFn?: () => Promise<unknown>;

  constructor(serviceName: string, options: CircuitBreakerOptions = {}) {
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
  async fire<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Se está OPEN, verifica se é hora de tentar HALF_OPEN
    if (this.status === CircuitBreakerStatus.OPEN) {
      if (this.nextAttemptTime && now < this.nextAttemptTime) {
        // Ainda no período de espera
        logWarn(`[CB:${this.serviceName}] Circuit OPEN, rejeitando request (próxima tentativa em ${Math.round((this.nextAttemptTime - now) / 1000)}s)`);
        if (this.fallbackFn) {
          return this.fallbackFn() as Promise<T>;
        }
        throw new Error(`Circuit breaker OPEN para ${this.serviceName}`);
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
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Circuit breaker timeout (${this.timeoutMs}ms)`)),
            this.timeoutMs
          )
        ),
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
    } catch (error) {
      // Falha
      this.recordFailure(error as Error);

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
  private recordSuccess(responseTime: number): void {
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
  private recordFailure(error: Error): void {
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
      logWarn(
        `[CB:${this.serviceName}] Taxa de falha ${failureRate}% >= limiar ${this.errorThreshold}%, abrindo circuit`
      );
      this.openCircuit();
    }
  }

  /**
   * Abre o circuit e agenda próxima tentativa
   */
  private openCircuit(): void {
    this.status = CircuitBreakerStatus.OPEN;
    this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
    this.lastStateChangeTime = Date.now();
    logError(
      `[CB:${this.serviceName}] Circuit ABERTO! Próxima tentativa em ${Math.round(this.resetTimeoutMs / 1000)}s`
    );
  }

  /**
   * Adiciona requisição à janela deslizante
   */
  private addToWindow(record: RequestRecord): void {
    this.requestWindow.push(record);
    // Mantém apenas últimas windowSize requisições
    if (this.requestWindow.length > this.windowSize) {
      this.requestWindow.shift();
    }
  }

  /**
   * Calcula taxa de falha na janela atual
   */
  private calculateFailureRate(): number {
    if (this.requestWindow.length === 0) return 0;
    const failures = this.requestWindow.filter(r => !r.success).length;
    return Math.round((failures / this.requestWindow.length) * 100);
  }

  /**
   * Obtém estado atual
   */
  getState(): CircuitBreakerState {
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
  reset(): void {
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
  private static instances = new Map<string, CircuitBreaker>();

  /**
   * Cria ou obtém um circuit breaker para um serviço
   */
  static createCircuitBreaker(serviceName: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (this.instances.has(serviceName)) {
      return this.instances.get(serviceName)!;
    }

    const breaker = new CircuitBreaker(serviceName, options);
    this.instances.set(serviceName, breaker);
    logInfo(`[CB] Circuit breaker criado para ${serviceName}`);
    return breaker;
  }

  /**
   * Executa operação com proteção de circuit breaker
   */
  static async executeWithBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
    options?: CircuitBreakerOptions
  ): Promise<T> {
    const breaker = this.createCircuitBreaker(serviceName, options);
    return breaker.fire(operation);
  }

  /**
   * Obtém estado de um circuit breaker
   */
  static getState(serviceName: string): CircuitBreakerState | null {
    return this.instances.get(serviceName)?.getState() ?? null;
  }

  /**
   * Lista todos os circuit breakers e seus estados
   */
  static listCircuitBreakers(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, breaker] of this.instances.entries()) {
      result[name] = breaker.getStats();
    }
    return result;
  }

  /**
   * Reseta um circuit breaker
   */
  static resetCircuitBreaker(serviceName: string): void {
    this.instances.get(serviceName)?.reset();
  }

  /**
   * Limpa todos os circuit breakers
   */
  static resetAll(): void {
    for (const breaker of this.instances.values()) {
      breaker.reset();
    }
  }
}

/**
 * Para compatibilidade com código existente que espera interface "fire"
 */
export async function executeWithCircuitBreaker<T>(
  serviceName: string,
  operation: () => Promise<T>,
  options?: CircuitBreakerOptions
): Promise<T> {
  return CircuitBreakerManager.executeWithBreaker(serviceName, operation, options);
}
