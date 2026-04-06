/**
 * Core Tenant Service
 * Validações de tenant e ownership
 */
import {
  type TenantValidationResult,
  validateTenantOwnershipByUserId,
} from './tenant-validation.service.js';

/**
 * Valida se o userId realmente pertence ao tenantId informado
 * Busca no banco para garantir que não é spoofing
 */
export async function validateCoreTenantOwnership(
  userId: number | undefined,
  tenantId: number | undefined
): Promise<TenantValidationResult> {
  // Validações básicas
  if (!userId || !tenantId) {
    return {
      valid: false,
      reason: 'userId e tenantId são obrigatórios para validação',
    };
  }

  if (userId <= 0 || tenantId <= 0) {
    return {
      valid: false,
      reason: 'userId e tenantId devem ser positivos',
    };
  }

  try {
    return await validateTenantOwnershipByUserId(userId, tenantId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno na validação de tenant';
    return {
      valid: false,
      reason: message,
    };
  }
}

/**
 * Valida contexto completo de tenant
 */
export async function validateCoreSecureContext(
  userId: number | undefined,
  tenantId: number | undefined,
  userRole?: string
): Promise<TenantValidationResult & { role?: string }> {
  // Validar tenant ownership
  const tenantValidation = await validateCoreTenantOwnership(userId, tenantId);
  if (!tenantValidation.valid) {
    return tenantValidation;
  }

  // Validar role (se fornecido)
  if (userRole) {
    const validRoles = ['admin', 'user', 'vendedor', 'system'];
    if (!validRoles.includes(userRole)) {
      return {
        valid: false,
        reason: `Role inválido: ${userRole}. Roles permitidas: ${validRoles.join(', ')}`,
      };
    }
  }

  return {
    ...tenantValidation,
    role: userRole,
  };
}
