/**
 * VALIDAÇÃO SEGURA DE TENANT CONTEXT
 * 
 * Função não-bloqueante para detectar vulnerabilidades
 * sem quebrar o funcionamento do sistema
 */

import type { TrpcContext } from './context.js';

export interface TenantValidationResult {
  valid: boolean;
  issues: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: {
    hasToken: boolean;
    hasUserId: boolean;
    hasTenantId: boolean;
    tokenFormat: string;
    tokenOrigin: string;
    isLegacyToken: boolean;
    inconsistencies: string[];
  };
}

/**
 * Valida contexto de tenant de forma segura (não bloqueante)
 * Detecta problemas mas não interrompe o fluxo
 */
export function validateTenantContextSafe(ctx: {
  user: any;
  vendedor: any;
  tenantId: any;
  isImpersonating: boolean;
  session: any;
}): TenantValidationResult {
  const issues: string[] = [];
  const inconsistencies: string[] = [];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // DETECÇÃO BÁSICA
  const hasToken = Boolean(ctx.session?.tokenPresent);
  const hasUserId = Boolean(ctx.user?.id);
  const hasTenantId = Boolean(ctx.tenantId);
  const tokenOrigin = ctx.session?.origin || 'none';
  
  // DETECTAR FORMATO DO TOKEN
  let tokenFormat = 'unknown';
  let isLegacyToken = false;
  
  if (ctx.session?.tokenKind === 'user') {
    tokenFormat = 'u:userId';
  } else if (ctx.session?.tokenKind === 'vendedor') {
    tokenFormat = 'v:tenantId:vendedorId';
    isLegacyToken = true;
  } else if (ctx.session?.tokenKind === 'admin-session') {
    tokenFormat = 'admin-session';
    isLegacyToken = true;
  } else if (ctx.session?.tokenKind === 'unknown') {
    tokenFormat = 'unknown';
    isLegacyToken = true;
  }

  // VALIDAÇÕES DE CONSISTÊNCIA
  if (!hasToken) {
    issues.push('No token present');
    severity = 'medium';
  }

  if (hasToken && !hasUserId) {
    issues.push('Token present but no userId');
    inconsistencies.push('Token without userId');
    severity = 'high';
  }

  if (hasToken && !hasTenantId) {
    issues.push('Token present but no tenantId');
    inconsistencies.push('Token without tenantId');
    severity = 'critical';
  }

  if (hasUserId && hasTenantId) {
    // Verificar tipos
    if (typeof ctx.user!.id !== 'number' || ctx.user!.id <= 0) {
      issues.push('Invalid userId type or value');
      inconsistencies.push('Invalid userId');
      severity = 'high';
    }

    if (typeof ctx.tenantId !== 'number' || ctx.tenantId <= 0) {
      issues.push('Invalid tenantId type or value');
      inconsistencies.push('Invalid tenantId');
      severity = 'critical';
    }

    // Verificar consistência user.tenantId vs tenantId
    if (ctx.user!.tenantId && ctx.user!.tenantId !== ctx.tenantId) {
      issues.push('User tenantId mismatch with context tenantId');
      inconsistencies.push('Tenant mismatch');
      severity = 'critical';
    }
  }

  // DETECTAR TOKENS LEGADOS
  if (isLegacyToken) {
    issues.push('Using legacy token format');
    severity = severity === 'critical' ? 'critical' : 'medium';
  }

  // DETECTAR ORIGENS SUSPEITAS
  if (tokenOrigin === 'header' || tokenOrigin === 'bearer') {
    issues.push(`Token from ${tokenOrigin} - HIGH RISK - potential spoofing`);
    severity = 'high'; // Headers são sempre HIGH RISK
  }

  return {
    valid: issues.length === 0,
    issues,
    severity,
    details: {
      hasToken,
      hasUserId,
      hasTenantId,
      tokenFormat,
      tokenOrigin,
      isLegacyToken,
      inconsistencies
    }
  };
}
