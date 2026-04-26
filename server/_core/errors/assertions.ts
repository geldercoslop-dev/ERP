// Assert helpers reutilizáveis para tenant e db
import { ValidationError, InfrastructureError } from './app-error.js';

/**
 * @official VALIDAÇÃO OFICIAL DE TENANT ID
 * 
 * ÚNICA função autorizada para validação de tenantId em todo o código.
 * 
 * @param tenantId - ID do tenant para validar
 * @param details - Contexto adicional para debug (opcional)
 * @throws ValidationError se tenantId for inválido
 * 
 * @example
 * assertTenantId(tenantId); // TypeScript sabe que tenantId é number após
 */
export function assertTenantId(tenantId: unknown, details?: Record<string, unknown>): asserts tenantId is number {
  if (typeof tenantId !== 'number' || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId ausente ou inválido', { ...details, tenantId });
  }
}

export function assertDbConnection(dbConn: unknown, details?: Record<string, unknown>): asserts dbConn {
  if (!dbConn) {
    throw new InfrastructureError('Conexão com banco ausente ou inválida', details);
  }
}
