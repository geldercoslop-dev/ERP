/**
 * SISTEMA DE PROTEÇÃO GLOBAL DE SERVICES
 * Monitora, valida e blinda todos os retornos de service
 *
 * Uso:
 * const produtos = await withServiceGuard(() => db.getAllProdutos(), 'produtos', 'getAllProdutos')
 */
import { sanitizeList, sanitizeGet, sanitizeCreate, logSafetyViolation, isArraySafe, hasId, } from './service-safety.js';
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
export async function withServiceGuard(fn, config) {
    const { serviceName, methodName, expectedType, logErrors = true, throwOnError = false, fallbackValue = null, } = config;
    try {
        const result = await fn();
        // Validação por tipo esperado
        switch (expectedType) {
            case 'list': {
                if (!isArraySafe(result)) {
                    const violation = {
                        type: 'array-expected',
                        service: serviceName,
                        method: methodName,
                        expectedType: 'T[]',
                        actualValue: typeof result === 'object' ? JSON.stringify(result).substring(0, 50) : String(result),
                    };
                    logSafetyViolation(violation);
                    if (logErrors) {
                        console.error(`[🔴 SERVICE GUARD] ${serviceName}.${methodName}: Esperava array, recebeu ${typeof result}`);
                    }
                    return (sanitizeList(result) || []);
                }
                break;
            }
            case 'single': {
                if (result === undefined) {
                    const violation = {
                        type: 'undefined-returned',
                        service: serviceName,
                        method: methodName,
                        expectedType: 'T | null',
                        actualValue: 'undefined',
                    };
                    logSafetyViolation(violation);
                    if (logErrors) {
                        console.warn(`[🟡 SERVICE GUARD] ${serviceName}.${methodName}: Retornou undefined, usando null`);
                    }
                    return sanitizeGet(result);
                }
                break;
            }
            case 'create': {
                if (!hasId(result)) {
                    const violation = {
                        type: 'invalid-type',
                        service: serviceName,
                        method: methodName,
                        expectedType: '{ id: number }',
                        actualValue: typeof result === 'object' ? JSON.stringify(result).substring(0, 50) : String(result),
                    };
                    logSafetyViolation(violation);
                    if (logErrors) {
                        console.error(`[🔴 SERVICE GUARD] ${serviceName}.${methodName}: Create deve retornar { id: number }`);
                    }
                    return sanitizeCreate(result, -1);
                }
                break;
            }
        }
        return result;
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (logErrors) {
            console.error(`[🔴 SERVICE GUARD] ${serviceName}.${methodName}: ${errorMsg}`);
        }
        if (throwOnError) {
            throw error;
        }
        // Retornar fallback seguro por tipo
        if (expectedType === 'list') {
            return (fallbackValue || []);
        }
        else if (expectedType === 'create') {
            return (fallbackValue || { id: -1 });
        }
        return (fallbackValue || null);
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
export function ServiceGuardDecorator(expectedType) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            return await withServiceGuard(() => originalMethod.apply(this, args), {
                serviceName: target.constructor.name,
                methodName: propertyKey,
                expectedType,
                logErrors: true,
            });
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
export function createGuardedProxy(target, serviceName, typeGuess = {}) {
    return new Proxy(target, {
        get(obj, prop) {
            const value = Reflect.get(obj, prop);
            // Se não for função, retornar como está
            if (typeof value !== 'function') {
                return value;
            }
            // Tentar adivinhar tipo baseado em nome de método
            let expectedType = 'other';
            if (prop in typeGuess) {
                expectedType = typeGuess[prop];
            }
            else if (prop.toString().toLowerCase().includes('list') || prop.toString().toLowerCase().includes('all')) {
                expectedType = 'list';
            }
            else if (prop.toString().toLowerCase().includes('get') || prop.toString().toLowerCase().includes('find')) {
                expectedType = 'single';
            }
            else if (prop.toString().toLowerCase().includes('create') || prop.toString().toLowerCase().includes('insert')) {
                expectedType = 'create';
            }
            // Retornar função envolvida com guard
            return async function (...args) {
                const r = await withServiceGuard(async () => {
                    const fn = value;
                    const out = fn.apply(obj, args);
                    return out instanceof Promise ? await out : out;
                }, {
                    serviceName,
                    methodName: prop.toString(),
                    expectedType,
                    logErrors: true,
                });
                return r;
            };
        },
    });
}
/**
 * Valida se função segue contrato correto
 */
export async function checkServiceIntegrity(fn, config) {
    const issues = [];
    let isSafe = true;
    try {
        const result = await fn();
        switch (config.expectedType) {
            case 'list': {
                if (!Array.isArray(result)) {
                    issues.push(`Esperava array, recebeu ${typeof result}`);
                    isSafe = false;
                }
                else if (result === undefined) {
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
                if (!result || !('id' in result) || typeof result.id !== 'number') {
                    issues.push(`Retornou ${JSON.stringify(result)} em vez de { id: number }`);
                    isSafe = false;
                }
                break;
            }
        }
    }
    catch (error) {
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
