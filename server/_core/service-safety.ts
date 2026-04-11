/**
 * Utilitários de segurança para serviços
 * 
 * Este módulo fornece funções para garantir que os retornos dos serviços
 * sejam sempre consistentes e seguros, evitando erros como undefined ou
 * tipos incorretos.
 */
import { ServiceList, ServiceObject, ServiceCreatedResult, ServiceUpdateResult, ServiceDeleteResult } from './service-types.js';
import { logWarning, logError, logCritical, ErrorType } from './service-logger.js';
import { nanoid } from 'nanoid';
import { InfrastructureError } from './errors/typed-errors.js';

/**
 * Verifica se um valor é um array de forma segura
 * @param value - O valor a ser verificado
 * @returns true se o valor for um array, false caso contrário
 */
export function isArraySafe(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Verifica se um valor é um objeto não-nulo de forma segura
 * @param value - O valor a ser verificado
 * @returns true se o valor for um objeto não-nulo, false caso contrário
 */
export function isObjectSafe(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Verifica se um valor tem a propriedade id de forma segura
 * @param value - O valor a ser verificado
 * @returns true se o valor tiver uma propriedade id numérica, false caso contrário
 */
export function hasValidId(value: unknown): value is { id: number } {
  return isObjectSafe(value) && 'id' in value && typeof (value as { id: unknown }).id === 'number';
}

/**
 * Extrai informações de contexto da pilha de chamadas
 * @returns Informações de contexto
 */
function getCallerContext(): { service?: string; method?: string } {
  try {
    const stackLines = new Error().stack?.split('\n') || [];
    // Pular as primeiras linhas que correspondem a esta função e à função chamadora
    const callerLine = stackLines[3] || '';
    
    // Extrair informações do serviço e método
    const match = callerLine.match(/at\s+(?:async\s+)?(?:(\w+)\.)?(\w+)/);
    if (match) {
      const service = match[1];
      const method = match[2];
      return { service, method };
    }
  } catch (e) {
    // Ignorar erros ao obter contexto
  }
  
  return {};
}

/**
 * Garante que o retorno seja sempre um array, mesmo quando vazio ou nulo
 * @param result - O resultado a ser normalizado
 * @param context - Contexto adicional para o log
 * @returns Um array garantido, nunca undefined ou null
 */
export function ensureArray<T>(
  result: T[] | null | undefined,
  context?: { service?: string; method?: string; traceId?: string }
): ServiceList<T> {
  const callerContext = getCallerContext();
  const service = context?.service || callerContext.service;
  const method = context?.method || callerContext.method;
  const traceId = context?.traceId || nanoid(10);
  
  if (!isArraySafe(result)) {
    if (result === undefined) {
      logError(ErrorType.UNDEFINED_RETURN, 'Valor undefined detectado, retornando array vazio', {
        service,
        method,
        traceId,
        payload: { expectedType: 'array', actualType: 'undefined' }
      });
    } else if (result === null) {
      logWarning(ErrorType.NULL_RETURN, 'Valor null detectado, retornando array vazio', {
        service,
        method,
        traceId,
        payload: { expectedType: 'array', actualType: 'null' }
      });
    } else {
      logError(ErrorType.INVALID_ARRAY, 'Valor não-array detectado, retornando array vazio', {
        service,
        method,
        traceId,
        payload: { expectedType: 'array', actualType: typeof result, value: result }
      });
    }
    return [];
  }
  return result;
}

/**
 * Garante que o retorno seja sempre um objeto, mesmo quando vazio ou nulo
 * @param result - O resultado a ser normalizado
 * @param context - Contexto adicional para o log
 * @returns Um objeto garantido ou null, nunca undefined
 */
export function ensureObject<T extends Record<string, unknown>>(
  result: T | null | undefined,
  context?: { service?: string; method?: string; traceId?: string }
): ServiceObject<T> {
  const callerContext = getCallerContext();
  const service = context?.service || callerContext.service;
  const method = context?.method || callerContext.method;
  const traceId = context?.traceId || nanoid(10);
  
  if (result === undefined) {
    logError(ErrorType.UNDEFINED_RETURN, 'Valor undefined detectado, retornando null', {
      service,
      method,
      traceId,
      payload: { expectedType: 'object', actualType: 'undefined' }
    });
    return null;
  }
  
  if (result !== null && !isObjectSafe(result)) {
    logError(ErrorType.INVALID_OBJECT, 'Valor não-objeto detectado, retornando null', {
      service,
      method,
      traceId,
      payload: { expectedType: 'object', actualType: typeof result, value: result }
    });
    return null;
  }
  
  return result;
}

/**
 * Garante que o retorno de uma operação de criação sempre tenha um ID
 * @param result - O resultado da operação de criação
 * @param context - Contexto adicional para o log
 * @returns Um objeto com pelo menos a propriedade id
 */
export function ensureCreatedResult(
  result: unknown,
  context?: { service?: string; method?: string; traceId?: string }
): ServiceCreatedResult {
  const callerContext = getCallerContext();
  const service = context?.service || callerContext.service;
  const method = context?.method || callerContext.method;
  const traceId = context?.traceId || nanoid(10);
  
  if (!result) {
    const errorMessage = "Falha na operação de criação: resultado indefinido";
    logCritical(ErrorType.CREATE_INVALID_RETURN, errorMessage, {
      service,
      method,
      traceId,
      payload: { expectedType: 'object with id', actualType: result === null ? 'null' : 'undefined' }
    });
    throw new InfrastructureError(errorMessage);
  }
  
  // Se já tiver um ID, retorna como está
  if (hasValidId(result)) {
    return { id: result.id };
  }
  
  // Se for um número direto, assume que é o ID
  if (typeof result === 'number') {
    return { id: result };
  }
  
  const errorMessage = "Falha na operação de criação: ID não encontrado";
  logCritical(ErrorType.CREATE_INVALID_RETURN, errorMessage, {
    service,
    method,
    traceId,
    payload: { expectedType: 'object with id', actualType: typeof result, value: result }
  });
  throw new InfrastructureError(errorMessage);
}

/**
 * Garante que o retorno de uma operação de atualização seja consistente
 * @param result - O resultado da operação de atualização
 * @param context - Contexto adicional para o log
 * @returns Um objeto indicando sucesso
 */
export function ensureUpdateResult(
  result?: unknown,
  context?: { service?: string; method?: string; traceId?: string }
): ServiceUpdateResult {
  const callerContext = getCallerContext();
  const service = context?.service || callerContext.service;
  const method = context?.method || callerContext.method;
  const traceId = context?.traceId || nanoid(10);
  
  if (result === undefined) {
    logWarning(ErrorType.UPDATE_INVALID_RETURN, 'Resultado de atualização indefinido, retornando success: true', {
      service,
      method,
      traceId
    });
  }
  
  return { success: true };
}

/**
 * Garante que o retorno de uma operação de exclusão seja consistente
 * @param result - O resultado da operação de exclusão
 * @param context - Contexto adicional para o log
 * @returns Um objeto indicando sucesso
 */
export function ensureDeleteResult(
  result?: unknown,
  context?: { service?: string; method?: string; traceId?: string }
): ServiceDeleteResult {
  const callerContext = getCallerContext();
  const service = context?.service || callerContext.service;
  const method = context?.method || callerContext.method;
  const traceId = context?.traceId || nanoid(10);
  
  if (result === undefined) {
    logWarning(ErrorType.DELETE_INVALID_RETURN, 'Resultado de exclusão indefinido, retornando success: true', {
      service,
      method,
      traceId
    });
  }
  
  return { success: true };
}

/**
 * Garante que o retorno de uma operação paginada seja consistente
 * @param items - Os itens da página atual
 * @param total - O total de itens
 * @param page - O número da página atual
 * @param pageSize - O tamanho da página
 * @param context - Contexto adicional para o log
 * @returns Um objeto com items como array e informações de paginação
 */
export function ensurePaginatedResult<T>(
  items: T[] | null | undefined,
  total: number,
  page: number,
  pageSize: number,
  context?: { service?: string; method?: string; traceId?: string }
): { items: T[]; total: number; page: number; pageSize: number } {
  return {
    items: ensureArray(items, context),
    total,
    page,
    pageSize
  };
}

/**
 * Decorator para garantir que o retorno de um método seja sempre um array
 * @param context - Contexto adicional para o log
 * @returns Um decorator que envolve o método original com uma verificação de tipo
 */
export function EnsureArrayReturn<T extends Record<string, Function>, K extends keyof T>(
  context?: { service?: string }
) {
  return function(
    _target: T,
    propertyKey: K,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function<TArgs extends unknown[]>(...args: TArgs) {
      const method = String(propertyKey);
      const traceId = nanoid(10);
      
      try {
        const result = await originalMethod.apply(this, args);
        return ensureArray(result, { service: context?.service, method, traceId });
      } catch (error) {
        logError(ErrorType.UNEXPECTED_ERROR, 'Erro ao executar método com EnsureArrayReturn', {
          service: context?.service,
          method,
          traceId,
          error: error instanceof Error ? error : new Error(String(error))
        });
        throw error; // Lança o erro em vez de retornar um array vazio
      }
    };
    
    return descriptor;
  };
}

/**
 * Decorator para garantir que o retorno de um método tenha um ID
 * @param context - Contexto adicional para o log
 * @returns Um decorator que envolve o método original com uma verificação de tipo
 */
export function EnsureCreatedResult<T extends Record<string, Function>, K extends keyof T>(
  context?: { service?: string }
) {
  return function(
    _target: T,
    propertyKey: K,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function<TArgs extends unknown[]>(...args: TArgs) {
      const method = String(propertyKey);
      const traceId = nanoid(10);
      
      try {
        const result = await originalMethod.apply(this, args);
        return ensureCreatedResult(result, { service: context?.service, method, traceId });
      } catch (error) {
        logError(ErrorType.UNEXPECTED_ERROR, 'Erro ao executar método com EnsureCreatedResult', {
          service: context?.service,
          method,
          traceId,
          error: error instanceof Error ? error : new Error(String(error))
        });
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Função para envolver qualquer serviço com verificações de segurança
 * @param service - O serviço a ser protegido
 * @param serviceName - O nome do serviço para fins de log
 * @returns Uma versão protegida do serviço
 */
export function createSafeService<T extends Record<string, Function>>(
  service: T,
  serviceName: string
): T {
  const safeService: Partial<T> = {};
  
  for (const key of Object.keys(service) as Array<keyof T>) {
    const originalMethod = service[key];
    const methodName = String(key);
    
    if (typeof originalMethod === 'function') {
      // Determinar o tipo de método com base no nome
      if (methodName.startsWith('get') || methodName.startsWith('list') || methodName.startsWith('find')) {
        // Métodos de busca/listagem
        safeService[key] = async function<TArgs extends unknown[]>(...args: TArgs) {
          const traceId = nanoid(10);
          
          try {
            const result = await originalMethod.apply(service, args);
            
            // Se o nome sugere que deve retornar uma lista
            if (methodName.includes('list') || methodName.includes('All') || methodName.includes('By')) {
              return ensureArray(result, { service: serviceName, method: methodName, traceId });
            }
            
            // Caso contrário, garantir que seja um objeto ou null
            return ensureObject(result, { service: serviceName, method: methodName, traceId });
          } catch (error) {
            logError(ErrorType.UNEXPECTED_ERROR, `Erro ao executar ${methodName}`, {
              service: serviceName,
              method: methodName,
              traceId,
              error: error instanceof Error ? error : new Error(String(error))
            });
            
            // Retornar valor padrão seguro com base no nome do método
            if (methodName.includes('list') || methodName.includes('All') || methodName.includes('By')) {
              return [];
            }
            return null;
          }
        } as unknown as T[keyof T];
      } else if (methodName.startsWith('create') || methodName.includes('add')) {
        // Métodos de criação
        safeService[key] = async function<TArgs extends unknown[]>(...args: TArgs) {
          const traceId = nanoid(10);
          
          try {
            const result = await originalMethod.apply(service, args);
            
            // Para métodos de criação, se retornar undefined ou não tiver ID, é um erro crítico
            if (result === undefined) {
              const errorMessage = `Método ${methodName} retornou undefined, esperava { id: number }`;
              logCritical(ErrorType.CREATE_INVALID_RETURN, errorMessage, {
                service: serviceName,
                method: methodName,
                traceId
              });
              throw new InfrastructureError(errorMessage);
            }
            
            return ensureCreatedResult(result, { service: serviceName, method: methodName, traceId });
          } catch (error) {
            logError(ErrorType.UNEXPECTED_ERROR, `Erro ao executar ${methodName}`, {
              service: serviceName,
              method: methodName,
              traceId,
              error: error instanceof Error ? error : new Error(String(error))
            });
            throw error;
          }
        } as unknown as T[keyof T];
      } else if (methodName.startsWith('update') || methodName.includes('edit')) {
        // Métodos de atualização
        safeService[key] = async function<TArgs extends unknown[]>(...args: TArgs) {
          const traceId = nanoid(10);
          
          try {
            const result = await originalMethod.apply(service, args);
            return ensureUpdateResult(result, { service: serviceName, method: methodName, traceId });
          } catch (error) {
            logError(ErrorType.UNEXPECTED_ERROR, `Erro ao executar ${methodName}`, {
              service: serviceName,
              method: methodName,
              traceId,
              error: error instanceof Error ? error : new Error(String(error))
            });
            throw error;
          }
        } as unknown as T[keyof T];
      } else if (methodName.startsWith('delete') || methodName.includes('remove')) {
        // Métodos de exclusão
        safeService[key] = async function<TArgs extends unknown[]>(...args: TArgs) {
          const traceId = nanoid(10);
          
          try {
            const result = await originalMethod.apply(service, args);
            return ensureDeleteResult(result, { service: serviceName, method: methodName, traceId });
          } catch (error) {
            logError(ErrorType.UNEXPECTED_ERROR, `Erro ao executar ${methodName}`, {
              service: serviceName,
              method: methodName,
              traceId,
              error: error instanceof Error ? error : new Error(String(error))
            });
            throw error;
          }
        } as unknown as T[keyof T];
      } else {
        // Outros métodos
        safeService[key] = originalMethod.bind(service);
      }
    } else {
      safeService[key] = originalMethod;
    }
  }
  
  return Object.assign({}, service, safeService) as T;
}