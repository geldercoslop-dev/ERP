import { createLogger } from '../infra/structured-logger';

const logger = createLogger('retry-middleware');

/**
 * Configurações de retry
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: any) => boolean;
}

/**
 * Configurações padrão por tipo de operação
 */
export const RETRY_CONFIG: Record<string, RetryConfig> = {
  // Database
  DB_QUERY: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      // Retry em erros de conexão e timeout
      return error.code === 'ECONNRESET' || 
             error.code === 'ETIMEDOUT' ||
             error.code === 'ENOTFOUND' ||
             error.message?.includes('timeout');
    },
  },
  
  DB_CONNECTION: {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      // Retry em erros de conexão
      return error.code === 'ECONNREFUSED' ||
             error.code === 'ENOTFOUND' ||
             error.code === 'ETIMEDOUT';
    },
  },
  
  // External APIs
  EXTERNAL_API: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 8000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      // Retry em erros 5xx e network
      return error.status >= 500 ||
             error.code === 'ECONNRESET' ||
             error.code === 'ETIMEDOUT';
    },
  },
  
  PAYMENT_API: {
    maxAttempts: 2,
    baseDelay: 2000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: false,
    retryCondition: (error) => {
      // Retry apenas em erros de rede, não em erros de negócio
      return error.code === 'ECONNRESET' ||
             error.code === 'ETIMEDOUT';
    },
  },
  
  EMAIL_API: {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      // Retry em erros de conexão
      return error.code === 'ECONNRESET' ||
             error.code === 'ETIMEDOUT';
    },
  },
  
  // Cache
  CACHE_GET: {
    maxAttempts: 2,
    baseDelay: 100,
    maxDelay: 500,
    backoffMultiplier: 1.5,
    jitter: true,
  },
  
  CACHE_SET: {
    maxAttempts: 2,
    baseDelay: 100,
    maxDelay: 500,
    backoffMultiplier: 1.5,
    jitter: true,
  },
} as const;

/**
 * Calcula delay com backoff exponencial e jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, config.maxDelay);
  
  if (config.jitter) {
    // Adiciona jitter de ±25%
    const jitterAmount = delay * 0.25;
    delay += (Math.random() - 0.5) * jitterAmount;
  }
  
  return Math.floor(delay);
}

/**
 * Executa operação com retry
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 1) {
        logger.info('Operation succeeded after retry', {
          metadata: {
            operation: operationName,
            attempt,
            maxAttempts: config.maxAttempts,
          },
        });
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      // Verificar se deve retry
      if (attempt === config.maxAttempts) {
        logger.error('Operation failed after all retries', `Operation ${operationName} failed after all retries`, {
          metadata: {
            operation: operationName,
            attempt,
            maxAttempts: config.maxAttempts,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        throw error;
      }
      
      if (config.retryCondition && !config.retryCondition(error)) {
        logger.error('Operation failed - retry condition not met', `Operation ${operationName} failed - retry condition not met`, {
          metadata: {
            operation: operationName,
            attempt,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        throw error;
      }
      
      const delay = calculateDelay(attempt, config);
      
      logger.warn('Operation failed, retrying', {
        metadata: {
          operation: operationName,
          attempt,
          maxAttempts: config.maxAttempts,
          delay,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      
      // Aguardar antes do retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Decorator para retry em métodos
 */
export function retry(configKey: keyof typeof RETRY_CONFIG) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const config = RETRY_CONFIG[configKey];
    
    descriptor.value = async function (...args: any[]) {
      return withRetry(
        () => originalMethod.apply(this, args),
        config,
        `${target.constructor.name}.${propertyKey}`
      );
    };
    
    return descriptor;
  };
}

/**
 * Retry específico para database
 */
export async function retryDatabase<T>(
  operation: () => Promise<T>,
  operationName: string = 'database_operation'
): Promise<T> {
  return withRetry(operation, RETRY_CONFIG.DB_QUERY, operationName);
}

/**
 * Retry específico para APIs externas
 */
export async function retryExternalApi<T>(
  operation: () => Promise<T>,
  operationName: string = 'external_api'
): Promise<T> {
  return withRetry(operation, RETRY_CONFIG.EXTERNAL_API, operationName);
}

/**
 * Retry com circuit breaker integrado
 */
export async function retryWithCircuitBreaker<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  circuitBreaker: any,
  operationName: string = 'operation'
): Promise<T> {
  return withRetry(
    async () => {
      if (circuitBreaker.isOpen()) {
        throw new Error('Circuit breaker is open');
      }
      
      try {
        const result = await operation();
        circuitBreaker.recordSuccess();
        return result;
      } catch (error) {
        circuitBreaker.recordFailure();
        throw error;
      }
    },
    config,
    operationName
  );
}
