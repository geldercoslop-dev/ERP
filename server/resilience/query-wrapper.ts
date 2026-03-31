/**
 * Query Wrapper: Integra Timeout > Circuit Breaker > Retry
 * 
 * Camadas de proteção para operações de banco de dados:
 * 1. TIMEOUT - Mata requests que demoram demais (global 10s)
 * 2. CIRCUIT BREAKER - Deteta cascata de falhas e abre circuito
 * 3. RETRY - Retentar com exponential backoff (máx 3 tentativas)
 */

import { CircuitBreakerManager } from '../infra/circuit-breaker.js';
import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('query-wrapper');

export interface QueryWrapperOptions {
  serviceName?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  circuitBreakerConfig?: {
    errorThreshold?: number;
    resetTimeout?: number;
    windowSize?: number;
  };
}

const DEFAULT_TIMEOUT_MS = 10_000; // 10 segundos
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Wraps uma query com timeout + circuit breaker + retry
 * 
 * Comportamento:
 * 1. Se circuit breaker abrir, rejeita imediatamente
 * 2. Se retry falhar, permanece registrado no circuit breaker
 * 3. Timeout pode ser interrompido no meio do retry
 */
export async function executeWithResilience<T>(
  operation: () => Promise<T>,
  options: QueryWrapperOptions = {}
): Promise<T> {
  const serviceName = options.serviceName ?? 'default-query';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  // Cria circuit breaker para este serviço com window maior (espera mais falhas antes de abrir)
  const circuitBreaker = CircuitBreakerManager.createCircuitBreaker(
    serviceName,
    {
      ...options.circuitBreakerConfig,
      windowSize: options.circuitBreakerConfig?.windowSize ?? 20, // Maior window = mais tolerante
    }
  );

  let lastError: Error | null = null;

  // Loop de retry
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Executa com proteção de circuit breaker + timeout
      const result = await circuitBreaker.fire(async () => {
        return Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Query timeout (${timeoutMs}ms)`)),
              timeoutMs
            )
          ),
        ]);
      });

      logger.debug(`Query succeeded (attempt ${attempt}/${maxRetries})`, {
        metadata: {
          serviceName,
          attempt,
          circuitBreakerStatus: circuitBreaker.getState().status,
        },
      });

      return result;
    } catch (error) {
      lastError = error as Error;
      const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);

      // Se é timeout, não tenta retryer
      if (errorMsg.includes('timeout')) {
        logger.warn(`Query timeout (${timeoutMs}ms)`, {
          metadata: {
            serviceName,
            attempt,
            error: errorMsg,
          },
        });
        throw lastError;
      }

      // Se é erro do circuit breaker aberto, não tenta retryer
      if (errorMsg.includes('Circuit breaker') && errorMsg.includes('OPEN')) {
        logger.warn(`Circuit breaker aberto para ${serviceName}`, {
          metadata: {
            serviceName,
            attempt,
            state: JSON.stringify(circuitBreaker.getState()),
          },
        });
        throw lastError;
      }

      // Se não é a última tentativa, tenta retry
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, ...
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        logger.warn(`Query failed, retrying in ${delay}ms`, {
          metadata: {
            serviceName,
            attempt,
            maxRetries,
            error: errorMsg,
          },
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error(`Query failed after ${maxRetries} attempts`, {
          metadata: {
            serviceName,
            maxRetries,
            error: errorMsg,
            circuitBreakerStatus: circuitBreaker.getState().status,
          },
        });
      }
    }
  }

  // Falha depois de todos os retries
  throw new Error(
    `Query failed after ${maxRetries} attempts: ${lastError?.message ?? 'Unknown error'}`
  );
}

/**
 * Convenience: Executa query com wrapper padrão (para uso em services/controllers)
 */
export async function queryWithResilience<T>(
  operation: () => Promise<T>,
  serviceName = 'database-query'
): Promise<T> {
  return executeWithResilience(operation, {
    serviceName,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  });
}

/**
 * Convenience: Wrapper específico para pool health checks
 */
export async function healthCheckWithResilience(
  operation: () => Promise<boolean>,
  serviceName = 'db-health-check'
): Promise<boolean> {
  return executeWithResilience(operation, {
    serviceName,
    timeoutMs: 8000, // 8s para health check (mais curto que query normal)
    maxRetries: 1, // Sem retry para health check (fast-fail)
    circuitBreakerConfig: {
      errorThreshold: 30, // Abre com 30% de falha (mais agressivo)
      resetTimeout: 10000, // Tenta recuperar mais rápido
    },
  });
}

/**
 * Obtém status de todos os breakers de query
 */
export function getQueryBreakerStats() {
  return CircuitBreakerManager.listCircuitBreakers();
}

/**
 * Limpa metricas de um query breaker (para testes)
 */
export function resetQueryBreakerStats(serviceName?: string) {
  if (serviceName) {
    CircuitBreakerManager.resetCircuitBreaker(serviceName);
  } else {
    CircuitBreakerManager.resetAll();
  }
}
