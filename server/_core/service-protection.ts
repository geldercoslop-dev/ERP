/**
 * Proteção global para serviços
 * 
 * Este módulo fornece uma camada de proteção global para todos os serviços,
 * garantindo que nenhum serviço retorne valores inválidos como undefined.
 */
import { createSafeService } from './service-safety.js';
import { logInfo, logWarning, logError, logCritical, ErrorType } from './service-logger.js';
import { nanoid } from 'nanoid';
import { InfrastructureError } from './errors/typed-errors.js';

/**
 * Mapa de serviços protegidos para evitar dupla proteção
 */
const protectedServices = new WeakMap<object, boolean>();

/**
 * Contador global de retornos inválidos interceptados
 */
let invalidReturnCount = 0;

/**
 * Timestamp do último reset do contador
 */
let lastCounterReset = Date.now();

/**
 * Intervalo de tempo (em ms) para resetar o contador
 */
const COUNTER_RESET_INTERVAL = 60000; // 1 minuto

/**
 * Limite de retornos inválidos por minuto para considerar um problema crítico
 */
const INVALID_RETURN_THRESHOLD = 10;

/**
 * Incrementa o contador de retornos inválidos e verifica se atingiu o limite
 */
export function incrementInvalidReturnCount(): void {
  invalidReturnCount++;
  
  const now = Date.now();
  
  // Verificar se é hora de resetar o contador
  if (now - lastCounterReset > COUNTER_RESET_INTERVAL) {
    // Se o contador for alto antes de resetar, registrar um alerta crítico
    if (invalidReturnCount >= INVALID_RETURN_THRESHOLD) {
      logCritical(
        'CRITICAL_SYSTEM_ISSUE',
        `Detectados ${invalidReturnCount} retornos inválidos no último minuto`,
        { payload: { invalidReturnCount } }
      );
    }
    
    invalidReturnCount = 0;
    lastCounterReset = now;
  } else if (invalidReturnCount >= INVALID_RETURN_THRESHOLD) {
    // Se o contador atingir o limite antes do reset, registrar um alerta crítico
    logCritical(
      'CRITICAL_SYSTEM_ISSUE',
      `Detectados ${invalidReturnCount} retornos inválidos em menos de um minuto`,
      { payload: { invalidReturnCount } }
    );
  }
}

/**
 * Obtém o contador de retornos inválidos
 * @returns O contador de retornos inválidos
 */
export function getInvalidReturnCount(): number {
  return invalidReturnCount;
}

/**
 * Protege um serviço contra retornos inválidos
 * @param serviceName - O nome do serviço para fins de log
 * @param service - O serviço a ser protegido
 * @returns Uma versão protegida do serviço
 */
export function protectService<T extends Record<string, any>>(serviceName: string, service: T): T {
  // Verificar se o serviço já está protegido
  if (protectedServices.has(service)) {
    logInfo(`Serviço ${serviceName} já está protegido`, { service: serviceName });
    return service;
  }
  
  logInfo(`Aplicando proteção ao serviço ${serviceName}`, { service: serviceName });
  
  // Criar versão segura do serviço
  const safeService = createSafeService(service, serviceName);
  
  // Marcar o serviço como protegido
  protectedServices.set(safeService, true);
  
  return safeService;
}

/**
 * Protege todos os serviços exportados de um módulo
 * @param moduleName - O nome do módulo para fins de log
 * @param moduleExports - As exportações do módulo a serem protegidas
 * @returns Uma versão protegida das exportações do módulo
 */
export function protectServiceModule<T extends Record<string, any>>(moduleName: string, moduleExports: T): T {
  const protectedExports: any = { ...moduleExports };
  
  for (const key of Object.keys(moduleExports)) {
    const value = moduleExports[key];
    
    // Proteger apenas funções e objetos que parecem ser serviços
    if (typeof value === 'function' && 
        (key.startsWith('get') || key.startsWith('list') || key.startsWith('create') || 
         key.startsWith('update') || key.startsWith('delete') || key.includes('Service'))) {
      protectedExports[key] = function(...args: any[]) {
        const traceId = nanoid(10);
        
        try {
          const result = value.apply(this, args);
          
          // Se for uma Promise, garantir que o resultado seja seguro
          if (result instanceof Promise) {
            return result.then(
              (resolvedValue) => {
                // Verificar se o resultado é undefined
                if (resolvedValue === undefined) {
                  incrementInvalidReturnCount();
                  
                  logWarning(ErrorType.UNDEFINED_RETURN, `Método ${key} do módulo ${moduleName} retornou undefined`, {
                    service: moduleName,
                    method: key,
                    traceId
                  });
                  
                  // Retornar valor padrão seguro com base no nome do método
                  if (key.includes('list') || key.includes('All') || key.includes('By') || key.includes('get')) {
                    return [];
                  }
                  if (key.includes('create')) {
                    const errorMessage = `Método ${key} retornou undefined, esperava { id: number }`;
                    logCritical(ErrorType.CREATE_INVALID_RETURN, errorMessage, {
                      service: moduleName,
                      method: key,
                      traceId
                    });
                    throw new InfrastructureError(errorMessage);
                  }
                  if (key.includes('update') || key.includes('delete')) {
                    return { success: true };
                  }
                  return null;
                }
                return resolvedValue;
              },
              (error) => {
                logError(ErrorType.UNEXPECTED_ERROR, `Erro no método ${key} do módulo ${moduleName}`, {
                  service: moduleName,
                  method: key,
                  traceId,
                  error: error instanceof Error ? error : new Error(String(error))
                });
                throw error;
              }
            );
          }
          
          return result;
        } catch (error) {
          logError(ErrorType.UNEXPECTED_ERROR, `Erro ao executar ${key} do módulo ${moduleName}`, {
            service: moduleName,
            method: key,
            traceId,
            error: error instanceof Error ? error : new Error(String(error))
          });
          throw error;
        }
      };
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursivamente proteger objetos que podem ser serviços
      protectedExports[key] = protectService(`${moduleName}.${key}`, value);
    }
  }
  
  return protectedExports;
}

/**
 * Função para aplicar proteção a um módulo de serviço específico
 * @param serviceModule - O módulo de serviço a ser protegido
 * @param moduleName - O nome do módulo para fins de log
 */
export function applyServiceProtection(serviceModule: any, moduleName: string): void {
  if (typeof serviceModule !== 'object' || serviceModule === null) {
    logWarning(ErrorType.INVALID_OBJECT, `Não foi possível proteger o módulo ${moduleName}, formato inválido`, {
      service: moduleName
    });
    return;
  }
  
  // Substituir as exportações do módulo com versões protegidas
  const protectedModule = protectServiceModule(moduleName, serviceModule);

  // Copiar as exportações protegidas de volta para o módulo original.
  // Node 20+ (ESM): namespace de import * é read-only — atribuição falha.
  const keys = Object.keys(protectedModule);
  for (const key of keys) {
    try {
      serviceModule[key] = protectedModule[key];
    } catch {
      // Node ESM: namespace de `import *` é read-only — um aviso por boot (evita spam)
      if (!(globalThis as { __erpEsmProtectionWarned?: boolean }).__erpEsmProtectionWarned) {
        (globalThis as { __erpEsmProtectionWarned?: boolean }).__erpEsmProtectionWarned = true;
        logInfo(
          "Proteção in-place de serviços desativada (namespace ESM read-only). Esperado em Node ESM."
        );
      }
      return;
    }
  }

  logInfo(`Módulo ${moduleName} protegido com sucesso`, { service: moduleName });
}