/**
 * TENANT SECURITY VALIDATION
 * Validação robusta de ownership de tenant para prevenir bypass
 */
import { validateTenantOwnershipByUserId, } from '../services/tenant-validation.service.js';
/**
 * Valida se o userId realmente pertence ao tenantId informado
 * Busca no banco para garantir que não é spoofing
 */
export async function validateTenantOwnership(userId, tenantId) {
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
        return await validateTenantOwnershipByUserId(userId, tenantId);
    }
    catch (error) {
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
export async function validateSecureContext(userId, tenantId, userRole) {
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
 * Middleware de segurança genérico
 */
export async function securityMiddleware(userId, tenantId, userRole) {
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
