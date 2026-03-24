/**
 * TENANT SECURITY VALIDATION
 * Validação robusta de ownership de tenant para prevenir bypass
 */

import { getDb } from '../db/core';
import { users } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from './service-entry-guard';

export interface TenantValidationResult {
  valid: boolean;
  tenantId?: number;
  reason?: string;
}

/**
 * Valida se o userId realmente pertence ao tenantId informado
 * Busca no banco para garantir que não é spoofing
 */
export async function validateTenantOwnership(
  userId: number | undefined,
  tenantId: number | undefined
): Promise<TenantValidationResult> {
  // 1. Validações básicas
  if (!userId || !tenantId) {
    return {
      valid: false,
      reason: 'userId e tenantId são obrigatórios para validação'
    };
  }

  if (userId <= 0 || tenantId <= 0) {
    return {
      valid: false,
      reason: 'userId e tenantId devem ser positivos'
    };
  }

  try {
    // 2. Buscar usuário no banco com seu tenant
    return await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
      const db = await getDb();
      const userRecord = await db
      .select({
        userId: users.id,
        userTenantId: users.tenantId,
        userName: users.name,
        userRole: users.role
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord || userRecord.length === 0) {
      return {
        valid: false,
        reason: `Usuário ${userId} não encontrado no banco`
      };
    }

    const user = userRecord[0];

    // 3. Verificar se tenant do usuário bate com o informado
    if (user.userTenantId !== tenantId) {
      return {
        valid: false,
        reason: `Tenant mismatch: Usuário ${userId} pertence ao tenant ${user.userTenantId}, mas informado ${tenantId}`
      };
    }

    // 4. Verificar se o tenant existe e está ativo
    // Como não temos tabela tenants separada, verificamos se existe algum usuário com este tenantId
    const tenantCheckRecord = await db
      .select({ count: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(1);

    if (!tenantCheckRecord || tenantCheckRecord.length === 0) {
      return {
        valid: false,
        reason: `Tenant ${tenantId} não encontrado no banco`
      };
    }

    // 5. Validação bem-sucedida
      return {
        valid: true,
        tenantId: tenantId
      };
    });
  } catch (error) {
    console.error('Erro na validação de tenant:', error);
    return {
      valid: false,
      reason: 'Erro interno na validação de tenant'
    };
  }
}

/**
 * Função auxiliar para validar contexto completo
 */
export async function validateSecureContext(
  userId: number | undefined,
  tenantId: number | undefined,
  userRole?: string
): Promise<TenantValidationResult & { role?: string }> {
  // 1. Validar tenant ownership
  const tenantValidation = await validateTenantOwnership(userId, tenantId);
  if (!tenantValidation.valid) {
    return tenantValidation;
  }

  // 2. Validar role (se fornecido)
  if (userRole) {
    const validRoles = ['admin', 'user', 'vendedor', 'system'];
    if (!validRoles.includes(userRole)) {
      return {
        valid: false,
        reason: `Role inválido: ${userRole}. Roles permitidas: ${validRoles.join(', ')}`
      };
    }
  }

  return {
    ...tenantValidation,
    role: userRole
  };
}

/**
 * Middleware de segurança para LEO Agent
 */
export async function securityMiddleware(
  userId: number | undefined,
  tenantId: number | undefined,
  userRole?: string
): Promise<{ valid: boolean; reason?: string; secureContext?: any }> {
  // Validação completa
  const validation = await validateSecureContext(userId, tenantId, userRole);
  
  if (!validation.valid) {
    return {
      valid: false,
      reason: validation.reason
    };
  }

  // Retornar contexto seguro (sem dados do input)
  return {
    valid: true,
    secureContext: {
      tenantId: validation.tenantId,
      userId: userId,
      role: validation.role || 'user'
    }
  };
}
