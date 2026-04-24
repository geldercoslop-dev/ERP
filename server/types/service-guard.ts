/**
 * SISTEMA DE PROTEÇÃO GLOBAL DE SERVICES
 * Monitora, valida e blinda todos os retornos de service
 * 
 * Uso:
 * const produtos = await withServiceGuard(() => db.getAllProdutos(), 'produtos', 'getAllProdutos')
 */

import {
  ServiceList,
  ServiceSingle,
  ServiceCreateResponse,
  sanitizeList,
  sanitizeGet,
  sanitizeCreate,
  logSafetyViolation,
  isArraySafe,
  hasId,
} from './service-safety.js';

interface ServiceGuardConfig {
  serviceName: string;
  methodName: string;
  expectedType: 'list' | 'single' | 'create' | 'paginated' | 'other';
  logErrors?: boolean;
  throwOnError?: boolean;
  fallbackValue?: unknown;
}

/**
 * WRAPPER UNIVERSAL: Protege qualquer chamada de service
 * 
 * @example
 * // List
 * const produtos = await withServiceGuard(
 *   () => db.getAllProdutos(),
 *   { serviceName: 'Produtos', methodName: 'getAllProdutos', expectedType: 'list' }
 * );
 * 
 * // Single
 * const produto = await withServiceGuard(
 *   () => db.getProduto(id),
 *   { serviceName: 'Produtos', methodName: 'getProduto', expectedType: 'single' }
 * );
 * 
 * // Create
 * const { id } = await withServiceGuard(
 *   () => db.createProduto(data),
 *   { serviceName: 'Produtos', methodName: 'createProduto', expectedType: 'create' }
 * );
 */
export async function withServiceGuard<T = unknown>(
  fn: () => Promise<T> | T,
  config: ServiceGuardConfig
): Promise<T> {
  const {
    serviceName,
    methodName,
    expectedType,
    logErrors = true,
    throwOnError = false,
    fallbackValue = null,
  } = config;

  try {
    const result = await fn();
    
    // Validação por tipo esperado
    switch (expectedType) {
      case 'list': {
        if (!isArraySafe(result)) {
          const violation = {
            type: 'array-expected' as const,
            service: serviceName,
            method: methodName,
            expectedType: 'T[]',
            actualValue: typeof result === 'object' ? JSON.stringify(result).substring(0, 50) : String(result),
          };
          logSafetyViolation(violation);
          
          if (logErrors) {
            console.error(
              `[🔴 SERVICE GUARD] ${serviceName}.${methodName}: Esperava array, recebeu ${typeof result}`
            );
          }
          return (sanitizeList(result as unknown[] | null | undefined) || []) as T;
        }
        break;
      }

      case 'single': {
        if (result === undefined) {
          const violation = {
            type: 'undefined-returned' as const,
            service: serviceName,
            method: methodName,
            expectedType: 'T | null',
            actualValue: 'undefined',
          };
          logSafetyViolation(violation);
          
          if (logErrors) {
            console.warn(
              `[🟡 SERVICE GUARD] ${serviceName}.${methodName}: Retornou undefined, usando null`
            );
          }
          return fallbackValue as T;
        }
        break;
      }

      case 'create': {
        if (!hasId(result)) {
          const violation = {
            type: 'invalid-type' as const,
            service: serviceName,
            method: methodName,
            expectedType: '{ id: number }',
            actualValue: typeof result === 'object' ? JSON.stringify(result).substring(0, 50) : String(result),
          };
          logSafetyViolation(violation);
          
          if (logErrors) {
            console.error(
              `[🔴 SERVICE GUARD] ${serviceName}.${methodName}: Create deve retornar { id: number }`
            );
          }
          return fallbackValue as T;
        }
        break;
      }
    }

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (logErrors) {
      console.error(
        `[🔴 SERVICE GUARD] ${serviceName}.${methodName}: ${errorMsg}`
      );
    }

    if (throwOnError) {
      throw error;
    }

    // Retornar fallback seguro por tipo
    if (expectedType === 'list') {
      return (fallbackValue || []) as T;
    } else if (expectedType === 'create') {
      return (fallbackValue || { id: -1 }) as T;
    }
    
    return (fallbackValue || null) as T;
  }
}

/**
 * DECORADOR: Para usar com métodos de classe
 * 
 * @example
 * class ProductService {
 *   @ServiceGuardDecorator('list')
 *   async getAllProducts(): Promise<Product[]> {
 *     return await db.products();
 *   }
 * }
 */
export function ServiceGuardDecorator(expectedType: ServiceGuardConfig['expectedType']) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return await withServiceGuard(
        () => originalMethod.apply(this, args),
        {
          serviceName: (target as { constructor: { name: string } }).constructor.name,
          methodName: propertyKey,
          expectedType,
          logErrors: true,
        }
      );
    };

    return descriptor;
  };
}

/**
 * PROXY: Protege automaticamente TODAS as funções de um objeto
 * 
 * @example
 * const db = createGuardedProxy(originalDb, 'Database');
 * const produtos = await db.getAllProdutos(); // Automaticamente protegido
 */
export function createGuardedProxy<T extends Record<string, any>>(
  target: T,
  serviceName: string,
  typeGuess: Record<string, ServiceGuardConfig['expectedType']> = {}
): T {
  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      const value = Reflect.get(obj, prop);

      // Se não for função, retornar como está
      if (typeof value !== 'function') {
        return value;
      }

      // Tentar adivinhar tipo baseado em nome de método
      let expectedType: ServiceGuardConfig['expectedType'] = 'other';
      if (prop in typeGuess) {
        expectedType = typeGuess[prop as string];
      } else if (prop.toString().toLowerCase().includes('list') || prop.toString().toLowerCase().includes('all')) {
        expectedType = 'list';
      } else if (prop.toString().toLowerCase().includes('get') || prop.toString().toLowerCase().includes('find')) {
        expectedType = 'single';
      } else if (prop.toString().toLowerCase().includes('create') || prop.toString().toLowerCase().includes('insert')) {
        expectedType = 'create';
      }

      // Retornar função envolvida com guard
      return async function (this: unknown, ...args: unknown[]) {
        const r = await withServiceGuard(
          async () => {
            const fn = value as (...a: unknown[]) => unknown;
            const out = fn.apply(obj, args);
            return out instanceof Promise ? await out : out;
          },
          {
            serviceName,
            methodName: prop.toString(),
            expectedType,
            logErrors: true,
          }
        );
        return r as unknown;
      };
    },
  });
}

/**
 * VERIFICADOR DE INTEGRIDADE: Testa se service obedece o contrato
 */
export interface ServiceIntegrityCheck {
  serviceName: string;
  methodName: string;
  exposedType: string;
  isSafe: boolean;
  issues: string[];
}

/**
 * Valida se função segue contrato correto
 */
export async function checkServiceIntegrity(
  fn: () => Promise<unknown>,
  config: ServiceGuardConfig
): Promise<ServiceIntegrityCheck> {
  const issues: string[] = [];
  let isSafe = true;

  try {
    const result = await fn();

    switch (config.expectedType) {
      case 'list': {
        if (!Array.isArray(result)) {
          issues.push(`Esperava array, recebeu ${typeof result}`);
          isSafe = false;
        } else if (result === undefined) {
          issues.push('Retornou undefined');
          isSafe = false;
        }
        break;
      }

      case 'single': {
        if (result === undefined) {
          issues.push('Retornou undefined (esperava T | null)');
          isSafe = false;
        }
        break;
      }

      case 'create': {
        if (!result || typeof result !== 'object' || !('id' in result) || typeof (result as { id: unknown }).id !== 'number') {
          issues.push(`Retornou ${JSON.stringify(result)} em vez de { id: number }`);
          isSafe = false;
        }
        break;
      }
    }
  } catch (error) {
    issues.push(`Erro ao executar: ${error instanceof Error ? error.message : String(error)}`);
    isSafe = false;
  }

  return {
    serviceName: config.serviceName,
    methodName: config.methodName,
    exposedType: config.expectedType,
    isSafe,
    issues,
  };
}
