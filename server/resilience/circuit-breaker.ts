import { createLogger } from '../infra/structured-logger';

const logger = createLogger('circuit-breaker');

/**
 * Estados do Circuit Breaker
 */
export enum CircuitState {
  CLOSED = 'CLOSED',   // Funcionando normalmente
  OPEN = 'OPEN',       // Bloqueado
  HALF_OPEN = 'HALF_OPEN', // Testando recuperação
}

/**
 * Configurações do Circuit Breaker
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;    // Falhas para abrir
  recoveryTimeout: number;     // Tempo para tentar recuperação (ms)
  successThreshold: number;    // Sucessos para fechar (half-open)
  monitoringPeriod: number;    // Período de monitoramento (ms)
  resetTimeout: number;        // Timeout para reset completo (ms)
}

/**
 * Implementação do Circuit Breaker
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private operationCounts: Map<string, number> = new Map();
  
  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}
  
  /**
   * Verifica se o circuit breaker está aberto
   */
  isOpen(): boolean {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (now >= this.nextAttemptTime) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN', {
          metadata: {
            name: this.name,
            state: this.state,
            lastFailureTime: this.lastFailureTime,
            nextAttemptTime: this.nextAttemptTime,
          },
        });
        return false;
      }
      return true;
    }
    return false;
  }
  
  /**
   * Registra sucesso da operação
   */
  recordSuccess(): void {
    const now = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        
        logger.info('Circuit breaker CLOSED after recovery', {
          metadata: {
            name: this.name,
            state: this.state,
            successCount: this.successCount,
          },
        });
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset contadores se passou muito tempo
      if (now - this.lastFailureTime > this.config.resetTimeout) {
        this.failureCount = 0;
      }
    }
  }
  
  /**
   * Registra falha da operação
   */
  recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.failureCount++;
    
    if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = now + this.config.recoveryTimeout;
        
        logger.error('Circuit breaker OPENED', {
          name: this.name,
          state: this.state,
          failureCount: this.failureCount,
          threshold: this.config.failureThreshold,
          nextAttemptTime: this.nextAttemptTime,
        });
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = now + this.config.recoveryTimeout;
      
      logger.error('Circuit breaker OPENED from HALF_OPEN', {
          name: this.name,
          state: this.state,
          nextAttemptTime: this.nextAttemptTime,
        });
    }
  }
  
  /**
   * Executa operação com circuit breaker
   */
  async execute<T>(operation: () => Promise<T>, operationName: string = 'operation'): Promise<T> {
    if (this.isOpen()) {
      const error = new Error(`Circuit breaker is OPEN for ${this.name}`);
      logger.warn('Circuit breaker blocked operation', {
        name: this.name,
        operation: operationName,
        state: this.state,
        nextAttemptTime: this.nextAttemptTime,
      });
      throw error;
    }
    
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      this.recordSuccess();
      
      // Registrar métricas
      this.recordOperationMetrics(operationName, 'success', duration);
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.recordFailure();
      
      // Registrar métricas
      this.recordOperationMetrics(operationName, 'failure', duration);
      
      logger.error('Circuit breaker operation failed', {
        name: this.name,
        operation: operationName,
        state: this.state,
        failureCount: this.failureCount,
        duration,
        metadata: {
          failureError: error instanceof Error ? error.message : "Unknown error",
        },
      });
      
      throw error;
    }
  }
  
  /**
   * Registra métricas de operação
   */
  private recordOperationMetrics(operation: string, status: string, duration: number): void {
    const key = `${operation}_${status}`;
    this.operationCounts.set(key, (this.operationCounts.get(key) || 0) + 1);
  }
  
  /**
   * Obtém status atual
   */
  getStatus(): {
    name: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
    operationCounts: Record<string, number>;
  } {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      operationCounts: Object.fromEntries(this.operationCounts),
    };
  }
  
  /**
   * Reset manual
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.operationCounts.clear();
    
    logger.info('Circuit breaker manually reset', {
      metadata: {
        name: this.name,
        state: this.state,
      },
    });
  }
}

/**
 * Configurações padrão por tipo de serviço
 */
export const CIRCUIT_BREAKER_CONFIG: Record<string, CircuitBreakerConfig> = {
  // Database
  DATABASE: {
    failureThreshold: 5,
    recoveryTimeout: 30000,    // 30s
    successThreshold: 3,
    monitoringPeriod: 60000,   // 1min
    resetTimeout: 300000,      // 5min
  },
  
  // External APIs
  EXTERNAL_API: {
    failureThreshold: 3,
    recoveryTimeout: 60000,     // 1min
    successThreshold: 2,
    monitoringPeriod: 120000,  // 2min
    resetTimeout: 600000,      // 10min
  },
  
  PAYMENT_API: {
    failureThreshold: 2,
    recoveryTimeout: 120000,    // 2min
    successThreshold: 2,
    monitoringPeriod: 180000,  // 3min
    resetTimeout: 900000,      // 15min
  },
  
  EMAIL_API: {
    failureThreshold: 4,
    recoveryTimeout: 60000,    // 1min
    successThreshold: 3,
    monitoringPeriod: 120000,  // 2min
    resetTimeout: 300000,      // 5min
  },
  
  // Cache
  CACHE: {
    failureThreshold: 10,
    recoveryTimeout: 10000,    // 10s
    successThreshold: 5,
    monitoringPeriod: 30000,   // 30s
    resetTimeout: 120000,      // 2min
  },
} as const;

/**
 * Registry de circuit breakers
 */
class CircuitBreakerRegistry {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  
  get(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const breakerConfig = config || CIRCUIT_BREAKER_CONFIG[name];
      if (!breakerConfig) {
        throw new Error(`No circuit breaker config found for ${name}`);
      }
      
      this.circuitBreakers.set(name, new CircuitBreaker(name, breakerConfig));
    }
    
    return this.circuitBreakers.get(name)!;
  }
  
  getAllStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [name, breaker] of this.circuitBreakers) {
      status[name] = breaker.getStatus();
    }
    
    return status;
  }
  
  reset(name?: string): void {
    if (name) {
      const breaker = this.circuitBreakers.get(name);
      if (breaker) {
        breaker.reset();
      }
    } else {
      for (const breaker of this.circuitBreakers.values()) {
        breaker.reset();
      }
    }
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Decorator para circuit breaker
 */
export function circuitBreaker(serviceName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const breaker = circuitBreakerRegistry.get(serviceName);
    
    descriptor.value = async function (...args: any[]) {
      return breaker.execute(
        () => originalMethod.apply(this, args),
        `${target.constructor.name}.${propertyKey}`
      );
    };
    
    return descriptor;
  };
}
