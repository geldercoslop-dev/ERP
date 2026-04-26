/**
 * INFRASTRUCTURE GUARD
 * 
 * Guarda central para validações de infraestrutura context-aware.
 * 
 * PRINCÍPIO:
 * - Produção = rigor máximo (fail-hard)
 * - Desenvolvimento = flexível (fail-soft)
 * - CI/Pre-commit = híbrido inteligente
 * 
 * NÃO bloqueia DEV, BLOQUEIA PROD se falhar, ALERTA CI
 */

import { detectRuntimeContext, isDevelopment, isProduction, isCI } from './runtimeContext';

export type InfraService = 'redis' | 'mysql' | 'env';

export interface InfraRequirementResult {
  success: boolean;
  service: InfraService;
  context: ReturnType<typeof detectRuntimeContext>;
  message: string;
  shouldBlock: boolean;
}

/**
 * Valida requisito de infraestrutura de forma context-aware
 * 
 * @param service - Serviço a validar
 * @param checkFn - Função de verificação assíncrona
 * @returns Resultado da validação
 */
export async function assertInfraRequirement(
  service: InfraService,
  checkFn: () => Promise<boolean> | boolean
): Promise<InfraRequirementResult> {
  const context = detectRuntimeContext();

  try {
    const result = await checkFn();

    if (result) {
      return {
        success: true,
        service,
        context,
        message: `✅ ${service.toUpperCase()} validation passed`,
        shouldBlock: false,
      };
    }

    // Falha na validação - comportamento context-aware
    if (isDevelopment()) {
      return {
        success: false,
        service,
        context,
        message: `⚠️  ${service.toUpperCase()} validation failed - DEV mode (optional)`,
        shouldBlock: false,
      };
    }

    if (isCI()) {
      const ciRequired = process.env[`CI_${service.toUpperCase()}_REQUIRED`] === 'true';
      if (ciRequired) {
        return {
          success: false,
          service,
          context,
          message: `❌ ${service.toUpperCase()} validation failed - CI mode (required)`,
          shouldBlock: true,
        };
      }
      return {
        success: false,
        service,
        context,
        message: `⚠️  ${service.toUpperCase()} validation failed - CI mode (optional)`,
        shouldBlock: false,
      };
    }

    // Production: fail-hard
    return {
      success: false,
      service,
      context,
      message: `❌ ${service.toUpperCase()} validation failed - PRODUCTION mode (required)`,
      shouldBlock: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (isDevelopment()) {
      return {
        success: false,
        service,
        context,
        message: `⚠️  ${service.toUpperCase()} check error - DEV mode (optional): ${errorMessage}`,
        shouldBlock: false,
      };
    }

    if (isCI()) {
      const ciRequired = process.env[`CI_${service.toUpperCase()}_REQUIRED`] === 'true';
      if (ciRequired) {
        return {
          success: false,
          service,
          context,
          message: `❌ ${service.toUpperCase()} check error - CI mode (required): ${errorMessage}`,
          shouldBlock: true,
        };
      }
      return {
        success: false,
        service,
        context,
        message: `⚠️  ${service.toUpperCase()} check error - CI mode (optional): ${errorMessage}`,
        shouldBlock: false,
      };
    }

    // Production: fail-hard
    return {
      success: false,
      service,
      context,
      message: `❌ ${service.toUpperCase()} check error - PRODUCTION mode (required): ${errorMessage}`,
      shouldBlock: true,
    };
  }
}

/**
 * Valida múltiplos requisitos de infraestrutura
 * 
 * @param requirements - Mapa de serviço -> função de verificação
 * @returns Array de resultados
 */
export async function assertInfraRequirements(
  requirements: Record<InfraService, () => Promise<boolean> | boolean>
): Promise<InfraRequirementResult[]> {
  const results: InfraRequirementResult[] = [];

  for (const [service, checkFn] of Object.entries(requirements)) {
    const result = await assertInfraRequirement(service as InfraService, checkFn);
    results.push(result);
  }

  return results;
}

/**
 * Verifica se deve bloquear execução baseado nos resultados
 * 
 * @param results - Resultados das validações
 * @returns true se deve bloquear
 */
export function shouldBlockExecution(results: InfraRequirementResult[]): boolean {
  return results.some(r => r.shouldBlock);
}

/**
 * Obtém mensagem de erro consolidada
 * 
 * @param results - Resultados das validações
 * @returns Mensagem de erro
 */
export function getBlockErrorMessage(results: InfraRequirementResult[]): string {
  const blocking = results.filter(r => r.shouldBlock);
  return blocking.map(r => r.message).join('\n');
}

/**
 * Valida Redis de forma context-aware
 */
export async function assertRedis(): Promise<InfraRequirementResult> {
  return assertInfraRequirement('redis', async () => {
    const { getRedis } = await import('../../infra/redis.js');
    try {
      const client = getRedis().getClient();
      await client.ping();
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Valida MySQL de forma context-aware
 */
export async function assertMySQL(): Promise<InfraRequirementResult> {
  return assertInfraRequirement('mysql', async () => {
    try {
      const { getDatabaseUrl } = await import('../../config/env.js');
      const url = getDatabaseUrl({ DATABASE_URL: process.env.DATABASE_URL || '' } as any);
      return !!url;
    } catch {
      return false;
    }
  });
}

/**
 * Valida variáveis de ambiente de forma context-aware
 */
export async function assertEnv(): Promise<InfraRequirementResult> {
  return assertInfraRequirement('env', () => {
    const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'APP_SECRET'];
    return required.every(key => !!process.env[key]);
  });
}

/**
 * Valida toda infraestrutura crítica
 */
export async function assertCriticalInfra(): Promise<InfraRequirementResult[]> {
  return assertInfraRequirements({
    env: () => assertEnv().then(r => r.success),
    mysql: () => assertMySQL().then(r => r.success),
    redis: () => assertRedis().then(r => r.success),
  });
}
