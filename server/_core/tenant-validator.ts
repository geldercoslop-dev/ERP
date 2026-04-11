/**
 * VALIDADOR GLOBAL DE SEGURANÇA - TENANT ISOLATION
 * Garante que toda operação de banco exija tenantId
 */

import type { ServiceActor } from './service-actor.js';
import { assertServiceEntryIfEnabled } from './service-entry-guard.js';
import { InfrastructureError } from './errors/typed-errors.js';

export interface TenantValidation {
  tenantId: number;
  actor: ServiceActor;
}

/**
 * Validação obrigatória para qualquer operação de banco
 * @param tenantId ID do tenant (obrigatório)
 * @param actor Contexto do usuário (obrigatório)
 * @returns true se válido, lança erro se inválido
 */
export function validateTenantAccess(tenantId?: number, actor?: ServiceActor): TenantValidation {
  assertServiceEntryIfEnabled();
  // VALIDAÇÃO CRÍTICA - NÃO PERMITIR OPERAÇÕES SEM TENANT
  if (!tenantId || tenantId <= 0) {
    throw new InfrastructureError('TENANT_ID_REQUIRED: Operação de banco exige tenantId válido');
  }
  
  if (!actor) {
    throw new InfrastructureError('ACTOR_REQUIRED: Operação de banco exige contexto do usuário');
  }
  
  if (!actor.role || !['admin', 'vendedor'].includes(actor.role)) {
    throw new InfrastructureError('INVALID_ACTOR_ROLE: Role do usuário inválido');
  }
  
  if (actor.role === 'vendedor' && !actor.vendedorId) {
    throw new InfrastructureError('VENDEDOR_ID_REQUIRED: Vendedor exige vendedorId');
  }
  
  return { tenantId, actor };
}

/**
 * Verifica se uma query string contém validação de tenant
 * @param query Query SQL para validar
 * @returns true se contém tenantId, false se não contém
 */
export function validateQueryTenantIsolation(query: string): boolean {
  // Verificar se a query menciona tenantId em cláusulas WHERE
  const hasTenantFilter = 
    query.includes('tenantId') || 
    query.includes('tenant_id') ||
    query.includes('WHERE.*tenant') ||
    query.includes('tenant') && query.includes('WHERE');
  
  return hasTenantFilter;
}

/**
 * Validação de segurança para queries dinâmicas
 * @param query Query SQL
 * @param tenantId ID do tenant
 * @returns true se seguro, false se vulnerável
 */
export function validateSecureQuery(query: string, tenantId?: number): boolean {
  if (!tenantId || tenantId <= 0) {
    return false; // Sempre requer tenantId
  }
  
  // Verificar se query tem filtro de tenant
  const hasTenantClause = validateQueryTenantIsolation(query);
  
  // Verificar se não há SELECT sem WHERE (query completa)
  const hasWhereClause = query.includes('WHERE');
  const isSelectQuery = query.toUpperCase().includes('SELECT');
  
  if (isSelectQuery && !hasWhereClause) {
    return false; // SELECT sem WHERE é perigoso
  }
  
  return hasTenantClause || !isSelectQuery;
}

/**
 * Auditor de segurança de queries
 * Verifica se todas as queries no código base estão protegidas
 */
export class DatabaseSecurityAuditor {
  private violations: string[] = [];
  
  /**
   * Valida uma única query
   * @param query Query SQL
   * @param tenantId ID do tenant
   * @param context Contexto para debug
   * @returns true se seguro, false se vulnerável
   */
  validateQuery(query: string, tenantId?: number, context?: string): boolean {
    try {
      const isSecure = validateSecureQuery(query, tenantId);
      
      if (!isSecure) {
        this.violations.push(`Query insegura em ${context}: ${query.substring(0, 100)}...`);
      }
      
      return isSecure;
    } catch (error) {
      this.violations.push(`Erro na validação em ${context}: ${(error as Error).message}`);
      return false;
    }
  }
  
  /**
   * Retorna resultado da auditoria
   * @returns true se todas as queries são seguras
   */
  getAuditResult(): { secure: boolean; violations: string[] } {
    return {
      secure: this.violations.length === 0,
      violations: this.violations
    };
  }
  
  /**
   * Reseta o auditor para novo teste
   */
  reset(): void {
    this.violations = [];
  }
}

// Singleton global para auditoria
export const globalDbAuditor = new DatabaseSecurityAuditor();
