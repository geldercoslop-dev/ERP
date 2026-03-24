/**
 * Circuit Breaker - Stub Implementation
 * 
 * Implementação mínima temporária sem dependência externa
 * TODO: Reimplementar com biblioteca nativa ou solução própria
 */

import { logError, logWarn, logInfo } from '../_core/logger';

export interface CircuitBreakerOptions {
  timeout?: number; // 5s padrão
  errorThreshold?: number; // 50% padrão
  resetTimeout?: number; // 30s padrão
  maxFailures?: number; // número máximo de falhas
  rollingCount?: number; // janela deslizante para cálculo
  fallback?: () => Promise<unknown>; // função fallback obrigatória
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  stats: {
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    failureRate: number;
    averageResponseTime: number;
  };
}

export interface CircuitBreakerConfig {
  service: string;
  options?: CircuitBreakerOptions;
  fallback?: () => Promise<unknown>;
  onOpen?: () => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
}

// Stub Circuit Breaker para compatibilidade
interface StubCircuitBreaker {
  fire: (fn: () => Promise<unknown>) => Promise<unknown>;
  opened: boolean;
  stats: Record<string, unknown>;
  lastFailureTime?: number;
  nextAttempt?: number;
  open: () => void;
  close: () => void;
  on: (event: string, handler: () => void) => void;
  fallback: (fn: () => Promise<unknown>) => void;
}

const createStubCircuitBreaker = (): StubCircuitBreaker => {
  const stats = { total: 0, failures: 0, faults: 0, mean: 0 };
  return {
    fire: async (fn) => {
      stats.total++;
      try {
        const result = await fn();
        return result;
      } catch (error) {
        stats.failures++;
        stats.faults++;
        throw error;
      }
    },
    opened: false,
    stats,
    on: () => {},
    fallback: () => {},
    open: () => {},
    close: () => {}
  };
};

/**
 * Gerenciador de Circuit Breaker
 */
export class CircuitBreakerManager {
  private static instances = new Map<string, StubCircuitBreaker>();
  private static defaultOptions: CircuitBreakerOptions = {
    timeout: 5000, // 5s
    errorThreshold: 50, // 50%
    resetTimeout: 30000, // 30s
    maxFailures: 5,
    rollingCount: 10,
  };

  /**
   * Cria ou obtém um circuit breaker para um serviço
   */
  static createCircuitBreaker(config: CircuitBreakerConfig): StubCircuitBreaker {
    const key = config.service;
    
    if (this.instances.has(key)) {
      const existing = this.instances.get(key)!;
      logInfo(`Circuit Breaker já existe para ${config.service}, reutilizando instância`);
      return existing;
    }

    const breaker = createStubCircuitBreaker();

    // Configura eventos do circuit breaker (stub - não faz nada)
    breaker.on('open', () => {
      logWarn(`Circuit Breaker ABERTO para ${config.service} - API temporariamente desativada`);
      config.onOpen?.();
    });

    this.instances.set(key, breaker);
    
    logInfo(`Circuit Breaker criado para ${config.service}`);

    return breaker;
  }

  /**
   * Executa uma função com proteção do circuit breaker
   */
  static async executeWithCircuitBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
    options?: CircuitBreakerOptions
  ): Promise<T> {
    const breaker = this.createCircuitBreaker({
      service: serviceName,
      options: options || {},
    });

    try {
      const result = await breaker.fire(operation);
      return result as T;
    } catch (error) {
      logError(`Erro na operação com Circuit Breaker para ${serviceName}`, error as Error);
      throw error;
    }
  }

  /**
   * Obtém estado atual de um circuit breaker
   */
  static getCircuitBreakerState(serviceName: string): CircuitBreakerState | null {
    const breaker = this.instances.get(serviceName);
    if (!breaker) return null;

    const stats = breaker.stats;
    const total = Number(stats.total ?? 0);
    const failures = Number(stats.failures ?? 0);
    const faults = Number(stats.faults ?? 0);
    const mean = Number(stats.mean ?? 0);

    return {
      isOpen: breaker.opened,
      failureCount: failures,
      lastFailureTime: breaker.lastFailureTime != null ? new Date(breaker.lastFailureTime) : undefined,
      nextAttemptTime: breaker.nextAttempt != null ? new Date(breaker.nextAttempt) : undefined,
      stats: {
        totalRequests: total,
        totalFailures: failures,
        totalSuccesses: total,
        failureRate: total > 0 ? (faults / total) * 100 : 0,
        averageResponseTime: mean,
      },
    };
  }

  /**
   * Reseta manualmente um circuit breaker
   */
  static resetCircuitBreaker(serviceName: string): void {
    const breaker = this.instances.get(serviceName);
    if (breaker) {
      breaker.open();
      setTimeout(() => breaker.close(), 100); // Força reset após 100ms
      logInfo(`Circuit Breaker para ${serviceName} resetado manualmente`);
    }
  }

  /**
   * Lista todos os circuit breakers ativos
   */
  static listCircuitBreakers(): Array<{ name: string; state: CircuitBreakerState }> {
    const result: Array<{ name: string; state: CircuitBreakerState }> = [];
    
    for (const [name, breaker] of Array.from(this.instances.entries())) {
      const state = this.getCircuitBreakerState(name);
      if (state) {
        result.push({ name, state });
      }
    }
    
    return result;
  }

  /**
   * Remove um circuit breaker
   */
  static removeCircuitBreaker(serviceName: string): void {
    const removed = this.instances.delete(serviceName);
    if (removed) {
      logInfo(`Circuit Breaker para ${serviceName} removido`);
    }
  }

  /**
   * Obtém opções padrão
   */
  static getDefaultOptions(): CircuitBreakerOptions {
    return { ...this.defaultOptions };
  }

  /**
   * Atualiza opções padrão
   */
  static setDefaultOptions(options: Partial<CircuitBreakerOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
    logInfo('Opções padrão do Circuit Breaker atualizadas', options);
  }
}

// Circuit Breakers específicos para APIs externas (stubs)
export const createFreteCircuitBreaker = (fallback?: () => Promise<unknown>) => 
  CircuitBreakerManager.createCircuitBreaker({
    service: 'frete-api',
    fallback,
    onOpen: () => logWarn('API de Frete indisponível - usando fallback'),
  });

export const createCepCircuitBreaker = (fallback?: () => Promise<unknown>) => 
  CircuitBreakerManager.createCircuitBreaker({
    service: 'cep-api',
    fallback,
    onOpen: () => logWarn('API de CEP indisponível - usando fallback'),
  });

export const createClimaCircuitBreaker = (fallback?: () => Promise<unknown>) => 
  CircuitBreakerManager.createCircuitBreaker({
    service: 'clima-api',
    fallback,
    onOpen: () => logWarn('API de Clima indisponível - usando fallback'),
  });

export const createRastreamentoCircuitBreaker = (fallback?: () => Promise<unknown>) => 
  CircuitBreakerManager.createCircuitBreaker({
    service: 'rastreamento-api',
    fallback,
    onOpen: () => logWarn('API de Rastreamento indisponível - usando fallback'),
  });

// Funções de conveniência para uso nas integrações
export const withCircuitBreaker = <T>(
  serviceName: string,
  operation: () => Promise<T>,
  fallback?: () => Promise<T>
) => CircuitBreakerManager.executeWithCircuitBreaker(serviceName, operation, { fallback });
