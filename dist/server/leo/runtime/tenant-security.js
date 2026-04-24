/**
 * Middleware de segurança para LEO Agent
 * Extraído do core para isolamento semântico
 */
import { validateTenantOwnershipByUserId, } from '../../services/tenant-validation.service.js';
/**
 * Middleware de segurança para LEO Agent
 */
export async function securityMiddleware(userId, tenantId, userRole) {
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
        const tenantValidation = await validateTenantOwnershipByUserId(userId, tenantId);
        if (!tenantValidation.valid) {
            return {
                valid: false,
                reason: tenantValidation.reason
            };
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
        // Retornar contexto seguro (sem dados do input)
        return {
            valid: true,
            secureContext: {
                tenantId: tenantValidation.tenantId,
                userId: userId,
                role: userRole || 'user'
            }
        };
    }
    catch (error) {
        console.error('Erro na validação de tenant:', error);
        return {
            valid: false,
            reason: 'Erro interno na validação de tenant'
        };
    }
}
