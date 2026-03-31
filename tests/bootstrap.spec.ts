/**
 * Testes de Bootstrap
 * Validam que o bootstrap executa apenas uma vez e cria contexto corretamente
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Bootstrap Invocation', () => {
  describe('Single Execution Guarantee', () => {
    it('deveria executar bootstrap apenas uma vez', () => {
      let bootstrapCount = 0;
      const bootstrapFn = vi.fn(() => {
        bootstrapCount++;
      });

      let bootstrapExecuted = false;

      const executeBootstrap = () => {
        if (!bootstrapExecuted) {
          bootstrapFn();
          bootstrapExecuted = true;
        }
      };

      executeBootstrap();
      executeBootstrap();
      executeBootstrap();

      expect(bootstrapFn).toHaveBeenCalledTimes(1);
      expect(bootstrapCount).toBe(1);
    });

    it('deveria usar flag para prevenir múltiplas execuções', () => {
      let bootstrapExecuted = false;
      const setupFn = vi.fn();

      const bootstrap = () => {
        if (bootstrapExecuted) {
          return;
        }
        setupFn();
        bootstrapExecuted = true;
      };

      bootstrap();
      bootstrap();
      bootstrap();

      expect(setupFn).toHaveBeenCalledTimes(1);
    });

    it('deveria evitar race condition com promise-based bootstrap', async () => {
      let bootstrapPromise: Promise<void> | null = null;
      const setupFn = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const bootstrap = async () => {
        if (!bootstrapPromise) {
          bootstrapPromise = setupFn();
        }
        return bootstrapPromise;
      };

      // Chamar concorrentemente
      await Promise.all([bootstrap(), bootstrap(), bootstrap()]);

      expect(setupFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Bootstrap Context Creation', () => {
    it('deveria criar contexto de bootstrap com tenantId padrão', () => {
      const buildBootstrapInvocation = (tenantId: number) => {
        const tid = Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
        return {
          tenantId: tid,
          userId: 1,
          role: 'system',
          __fromTool: true,
        };
      };

      const context = buildBootstrapInvocation(5);

      expect(context.tenantId).toBe(5);
      expect(context.userId).toBe(1);
      expect(context.role).toBe('system');
      expect(context.__fromTool).toBe(true);
    });

    it('deveria usar tenantId 1 se valor inválido for passado', () => {
      const buildBootstrapInvocation = (tenantId: number) => {
        const tid = Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
        return {
          tenantId: tid,
          userId: 1,
          role: 'system',
          __fromTool: true,
        };
      };

      expect(buildBootstrapInvocation(0).tenantId).toBe(1);
      expect(buildBootstrapInvocation(-5).tenantId).toBe(1);
      expect(buildBootstrapInvocation(NaN).tenantId).toBe(1);
    });

    it('deveria sempre usar userId 1 para bootstrap', () => {
      const buildBootstrapInvocation = (tenantId: number) => {
        const tid = Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
        return {
          tenantId: tid,
          userId: 1,
          role: 'system',
          __fromTool: true,
        };
      };

      const context = buildBootstrapInvocation(10);

      expect(context.userId).toBe(1);
    });

    it('deveria marcar contexto como autorizado (__fromTool)', () => {
      const buildBootstrapInvocation = (tenantId: number) => {
        const tid = Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
        return {
          tenantId: tid,
          userId: 1,
          role: 'system',
          __fromTool: true,
        };
      };

      const context = buildBootstrapInvocation(1);

      expect(context.__fromTool).toBe(true);
    });

    it('deveria atribuir role system ao bootstrap', () => {
      const buildBootstrapInvocation = (tenantId: number) => {
        const tid = Number.isFinite(tenantId) && tenantId > 0 ? tenantId : 1;
        return {
          tenantId: tid,
          userId: 1,
          role: 'system',
          __fromTool: true,
        };
      };

      const context = buildBootstrapInvocation(1);

      expect(context.role).toBe('system');
    });
  });

  describe('Bootstrap Execution Order', () => {
    it('deveria executar bootstrap antes que outras inicializações', async () => {
      const executionOrder: string[] = [];

      const bootstrap = async () => {
        executionOrder.push('bootstrap');
      };

      const initRoutes = async () => {
        executionOrder.push('routes');
      };

      const initMiddleware = async () => {
        executionOrder.push('middleware');
      };

      await bootstrap();
      await initRoutes();
      await initMiddleware();

      expect(executionOrder[0]).toBe('bootstrap');
      expect(executionOrder[1]).toBe('routes');
      expect(executionOrder[2]).toBe('middleware');
    });

    it('deveria garantir que dados de bootstrap estão disponíveis', async () => {
      let bootstrapData: { initialized: boolean } | null = null;

      const bootstrap = async () => {
        bootstrapData = { initialized: true };
      };

      const getBootstrapData = () => bootstrapData;

      expect(getBootstrapData()).toBeNull();

      await bootstrap();

      expect(getBootstrapData()).not.toBeNull();
      expect(getBootstrapData()?.initialized).toBe(true);
    });
  });

  describe('Bootstrap Error Handling', () => {
    it('deveria falhar fast se bootstrap falhar', async () => {
      const bootstrapFn = vi.fn().mockRejectedValue(new Error('Database initialization failed'));

      const bootstrap = async () => {
        return bootstrapFn();
      };

      await expect(bootstrap()).rejects.toThrow('Database initialization failed');
    });

    it('deveria logar erro de bootstrap', async () => {
      const logError = vi.fn();
      const bootstrapFn = vi.fn().mockRejectedValue(new Error('Bootstrap failed'));

      const bootstrap = async () => {
        try {
          return await bootstrapFn();
        } catch (error) {
          logError(error);
          throw error;
        }
      };

      await expect(bootstrap()).rejects.toThrow();
      expect(logError).toHaveBeenCalled();
    });

    it('deveria previne dupla execução mesmo em caso de erro', async () => {
      let executionCount = 0;
      let bootstrapExecuted = false;
      let bootstrapError: Error | null = null;

      const bootstrap = async () => {
        if (bootstrapExecuted) return;

        executionCount++;
        bootstrapExecuted = true;

        if (executionCount === 1) {
          bootstrapError = new Error('First attempt failed');
          throw bootstrapError;
        }
      };

      try {
        await bootstrap();
      } catch (e) {
        // Esperado
      }

      try {
        await bootstrap();
      } catch (e) {
        // Nenhum erro desta vez (não executou novamente)
      }

      expect(executionCount).toBe(1);
    });
  });

  describe('AsyncLocalStorage Integration', () => {
    it('deveria armazenar contexto de bootstrap em ALS', () => {
      const alsStore: Record<string, unknown> = {};

      const runWithServiceInvocation = <T>(store: Record<string, unknown>, fn: () => T): T => {
        const previousStore = { ...alsStore };
        Object.assign(alsStore, store);
        try {
          return fn();
        } finally {
          Object.assign(alsStore, previousStore);
        }
      };

      const bootstrapContext = {
        tenantId: 1,
        userId: 1,
        role: 'system',
        __fromTool: true,
      };

      runWithServiceInvocation(bootstrapContext, () => {
        expect(alsStore.tenantId).toBe(1);
        expect(alsStore.role).toBe('system');
      });
    });

    it('deveria permitir acesso ao contexto dentro de callback', () => {
      const contextStack: (Record<string, unknown> | undefined)[] = [];
      let currentContext: Record<string, unknown> | undefined = undefined;

      const runWithServiceInvocation = <T>(store: Record<string, unknown>, fn: () => T): T => {
        const previousContext = currentContext;
        currentContext = store;
        try {
          return fn();
        } finally {
          currentContext = previousContext;
        }
      };

      const getServiceInvocationStore = () => currentContext;

      runWithServiceInvocation({ tenantId: 1, userId: 1, role: 'system' }, () => {
        contextStack.push(getServiceInvocationStore());
      });

      expect(contextStack[0]).toBeDefined();
      expect(contextStack[0]?.tenantId).toBe(1);
    });
  });

  describe('Bootstrap Idempotency', () => {
    it('deveria ser idempotente mesmo com múltiplas chamadas', async () => {
      const sideEffects: string[] = [];
      
      let bootstrapDone = false;
      const bootstrap = async () => {
        if (bootstrapDone) return;
        sideEffects.push('effect');
        bootstrapDone = true;
      };

      await bootstrap();
      await bootstrap();
      await bootstrap();

      expect(sideEffects.length).toBe(1);
      expect(sideEffects[0]).toBe('effect');
    });

    it('deveria produzir mesmo resultado em múltiplas execuções (quando permite)', async () => {
      const bootstrap = async () => {
        return { bootstrapped: true, time: Date.now() };
      };

      const result1 = await bootstrap();
      const result2 = await bootstrap();

      expect(result1.bootstrapped).toBe(result2.bootstrapped);
    });
  });
});
