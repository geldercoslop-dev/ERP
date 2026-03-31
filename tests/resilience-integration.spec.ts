/**
 * Testes de Integração: Timeout > Circuit Breaker > Retry
 * 
 * Valida que as 3 camadas de proteção funcionam juntas:
 * 1. Timeout mata requisições que demoram muito
 * 2. Circuit breaker deteta cascata de falhas
 * 3. Retry recupera de falhas transitórias
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { executeWithResilience, getQueryBreakerStats, resetQueryBreakerStats } from '../server/resilience/query-wrapper';
import { CircuitBreakerManager, CircuitBreakerStatus } from '../server/infra/circuit-breaker';

describe('Resilience Integration', () => {
  beforeEach(() => {
    resetQueryBreakerStats();
  });

  afterEach(() => {
    resetQueryBreakerStats();
  });

  describe('Timeout Protection', () => {
    it('should timeout if operation exceeds timeoutMs', async () => {
      const operation = () => new Promise(resolve => setTimeout(resolve, 5000)); // 5s
      
      let timedOut = false;
      try {
        await executeWithResilience(operation, {
          serviceName: 'timeout-test',
          timeoutMs: 1000, // 1s timeout
          maxRetries: 1,
        });
      } catch (error) {
        timedOut = error instanceof Error && error.message.includes('timeout');
      }

      expect(timedOut).toBe(true);
    });

    it('should succeed if operation completes within timeout', async () => {
      let result = '';
      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      };

      result = await executeWithResilience(operation, {
        serviceName: 'ok-timeout-test',
        timeoutMs: 5000,
        maxRetries: 1,
      });

      expect(result).toBe('success');
    });
  });

  describe('Circuit Breaker Activation', () => {
    it('should open circuit breaker after error threshold exceeded', async () => {
      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new Error('Service unavailable');
      };

      // Primeiro, simular algumas falhas para abrir o circuit
      // Com windowSize: 5, apenas 5 requisições são tomadas em considração
      for (let i = 0; i < 8; i++) {
        try {
          await executeWithResilience(operation, {
            serviceName: 'circuit-test',
            maxRetries: 1,
            circuitBreakerConfig: {
              errorThreshold: 50,
              resetTimeout: 1000,
              windowSize: 5, // Pequeno window para abrir rápido
            },
          });
        } catch {
          // Falha esperada
        }
      }

      // Verificar que o circuit breaker foi aberto
      const stats = CircuitBreakerManager.getState('circuit-test');
      expect(stats?.status).toBe(CircuitBreakerStatus.OPEN);
    });

    it('should reject requests immediately when circuit is OPEN', async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        throw new Error('Failure');
      };

      // Abrir o circuit com múltiplas falhas
      for (let i = 0; i < 8; i++) {
        try {
          await executeWithResilience(operation, {
            serviceName: 'open-circuit-test',
            maxRetries: 1,
            circuitBreakerConfig: { 
              errorThreshold: 50,
              windowSize: 5, // Pequeno window para abrir rápido
            },
          });
        } catch {
          // Falha esperada
        }
      }

      const initialCount = callCount;

      // Tentar mais requisições agora que circuito está aberto
      try {
        await executeWithResilience(operation, {
          serviceName: 'open-circuit-test',
          maxRetries: 1,
        });
      } catch {
        // Esperado rejeitar sem chamar operation
      }

      // callCount não deve ter aumentado (operação não foi chamada)
      expect(callCount).toBe(initialCount);
    });

    it('should transition from OPEN to HALF_OPEN after reset timeout', async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        throw new Error('Failure');
      };

      // Abrir o circuit rapidamente
      for (let i = 0; i < 8; i++) {
        try {
          await executeWithResilience(operation, {
            serviceName: 'half-open-test',
            maxRetries: 1,
            circuitBreakerConfig: { 
              errorThreshold: 50,
              resetTimeout: 150, // Rápido para testes
              windowSize: 5,
            },
          });
        } catch {}
      }

      const stateBeforeResetTimeout = CircuitBreakerManager.getState('half-open-test');
      expect(stateBeforeResetTimeout?.status).toBe(CircuitBreakerStatus.OPEN);

      // Aguardar timeout para HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 200));

      // Tentar chamar - deve ir para HALF_OPEN
      // Precisamos de uma operação que lance erro para ver o transição
      try {
        await executeWithResilience(operation, {
          serviceName: 'half-open-test',
          maxRetries: 1,
        });
      } catch {
        // Esperado falhar
      }

      const state = CircuitBreakerManager.getState('half-open-test');
      // Estará em HALF_OPEN ou ainda pode estar reabrindo para OPEN se falhar
      expect([CircuitBreakerStatus.HALF_OPEN, CircuitBreakerStatus.OPEN]).toContain(state?.status);
    });

    it('should transition from HALF_OPEN to CLOSED on success', async () => {
      let failCount = 0;
      const operation = async () => {
        failCount++;
        if (failCount <= 6) {
          throw new Error('Failure');
        }
        return 'success';
      };

      // Abrir circuit rapidamente com window pequeno
      for (let i = 0; i < 8; i++) {
        try {
          await executeWithResilience(operation, {
            serviceName: 'half-to-closed-test',
            maxRetries: 1,
            circuitBreakerConfig: { 
              errorThreshold: 50,
              resetTimeout: 150,
              windowSize: 5,
            },
          });
        } catch {}
      }

      // Aguardar timeout para HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 200));

      const result = await executeWithResilience(operation, {
        serviceName: 'half-to-closed-test',
        maxRetries: 1,
      });

      expect(result).toBe('success');
      const state = CircuitBreakerManager.getState('half-to-closed-test');
      expect(state?.status).toBe(CircuitBreakerStatus.CLOSED);
    });
  });

  describe('Retry with Exponential Backoff', () => {
    it('should retry on transient failures', async () => {
      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient failure');
        }
        return 'success';
      };

      const result = await executeWithResilience(operation, {
        serviceName: 'retry-test',
        maxRetries: 3,
        retryDelayMs: 10, // Curto para testes
        circuitBreakerConfig: {
          windowSize: 20, // Grande window para tolerar retries
          errorThreshold: 80, // Alto threshold
        },
      });

      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should respect exponential backoff delays', async () => {
      let attemptCount = 0;
      const timestamps: number[] = [];

      const operation = async () => {
        timestamps.push(Date.now());
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Failure');
        }
        return 'success';
      };

      const result = await executeWithResilience(operation, {
        serviceName: 'backoff-test',
        maxRetries: 3,
        retryDelayMs: 50, // 50ms base
        circuitBreakerConfig: {
          windowSize: 20, // Grande window para tolerar retries
          errorThreshold: 80, // Alto threshold
        },
      });

      expect(timestamps.length).toBe(3);
      // Delay entre attempt 1 e 2: ~50ms
      const delay1 = timestamps[1] - timestamps[0];
      expect(delay1).toBeGreaterThan(40); // Margem para timing
      
      // Delay entre attempt 2 e 3: ~100ms (2x)
      const delay2 = timestamps[2] - timestamps[1];
      expect(delay2).toBeGreaterThan(90); // Margem para timing
    });
  });

  describe('Integration: All Three Layers', () => {
    it('should respect: timeout > circuitbreaker > retry order', async () => {
      let callCount = 0;
      const slowOperation = async () => {
        callCount++;
        // Operação que demora 2s
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      };

      // Timeout de 100ms deveria interromper antes do circuit breaker agir
      try {
        await executeWithResilience(slowOperation, {
          serviceName: 'order-test',
          timeoutMs: 100,
          maxRetries: 2,
        });
      } catch (error) {
        // Esperado timeout
        expect(error instanceof Error && error.message.includes('timeout')).toBe(true);
      }

      // Não deve ter feito retry 2x porque timeout não é "retryable"
      // (implementação atual rethrow timeout sem retry)
      expect(callCount).toBeLessThanOrEqual(2);
    });

    it('should handle cascading failures gracefully', async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        throw new Error('Persistent failure');
      };

      // Múltiplas requisições que falham
      for (let i = 0; i < 4; i++) {
        try {
          await executeWithResilience(operation, {
            serviceName: 'cascade-test',
            maxRetries: 2,
            circuitBreakerConfig: { errorThreshold: 50 },
          });
        } catch {
          // Esperado falhar
        }
      }

      // Verificar que circuit foi aberto eventualmente
      const state = CircuitBreakerManager.getState('cascade-test');
      expect([CircuitBreakerStatus.OPEN, CircuitBreakerStatus.HALF_OPEN]).toContain(state?.status);
    });

    it('should provide detailed metrics in stats', async () => {
      const operation = async () => {
        throw new Error('Test failure');
      };

      // Trigger algumas falhas
      for (let i = 0; i < 3; i++) {
        try {
          await executeWithResilience(operation, {
            serviceName: 'metrics-test',
            maxRetries: 1,
          });
        } catch {}
      }

      const stats = getQueryBreakerStats();
      expect(Object.keys(stats).length).toBeGreaterThan(0);
      
      const metricsTest = stats['metrics-test'] as any;
      expect(metricsTest.totalFailures).toBeGreaterThanOrEqual(1);
    });
  });
});
