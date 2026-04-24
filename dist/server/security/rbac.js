import { systemLogger } from '../_core/logger.js';
/**
 * Definição de permissões por role
 * Hierarquia: admin > operator > user
 */
export const ROLE_PERMISSIONS = {
    admin: [
        // Usuários e autenticação
        { resource: 'users', action: 'create' },
        { resource: 'users', action: 'read' },
        { resource: 'users', action: 'update' },
        { resource: 'users', action: 'delete' },
        { resource: 'users', action: 'manage_roles' },
        { resource: 'auth', action: 'impersonate' },
        // Sistema
        { resource: 'system', action: 'read' },
        { resource: 'system', action: 'configure' },
        { resource: 'system', action: 'monitor' },
        { resource: 'system', action: 'backup' },
        { resource: 'system', action: 'restore' },
        // Logs e auditoria
        { resource: 'logs', action: 'read' },
        { resource: 'logs', action: 'export' },
        { resource: 'audit', action: 'read' },
        // Todos os recursos de negócio
        { resource: 'clientes', action: 'create' },
        { resource: 'clientes', action: 'read' },
        { resource: 'clientes', action: 'update' },
        { resource: 'clientes', action: 'delete' },
        { resource: 'produtos', action: 'create' },
        { resource: 'produtos', action: 'read' },
        { resource: 'produtos', action: 'update' },
        { resource: 'produtos', action: 'delete' },
        { resource: 'pedidos', action: 'create' },
        { resource: 'pedidos', action: 'read' },
        { resource: 'pedidos', action: 'update' },
        { resource: 'pedidos', action: 'delete' },
        { resource: 'pedidos', action: 'cancel' },
        { resource: 'pedidos', action: 'approve' },
        { resource: 'financeiro', action: 'create' },
        { resource: 'financeiro', action: 'read' },
        { resource: 'financeiro', action: 'update' },
        { resource: 'financeiro', action: 'delete' },
        { resource: 'financeiro', action: 'approve' },
        { resource: 'logistica', action: 'create' },
        { resource: 'logistica', action: 'read' },
        { resource: 'logistica', action: 'update' },
        { resource: 'logistica', action: 'delete' },
        { resource: 'relatorios', action: 'read' },
        { resource: 'relatorios', action: 'export' },
        { resource: 'relatorios', action: 'create' }
    ],
    operator: [
        // Usuários (limitado)
        { resource: 'users', action: 'read' },
        { resource: 'users', action: 'update', conditions: ['self'] },
        // Sistema (limitado)
        { resource: 'system', action: 'read' },
        { resource: 'system', action: 'monitor' },
        // Logs (apenas leitura)
        { resource: 'logs', action: 'read' },
        { resource: 'audit', action: 'read' },
        // Recursos de negócio (sem delete)
        { resource: 'clientes', action: 'create' },
        { resource: 'clientes', action: 'read' },
        { resource: 'clientes', action: 'update' },
        { resource: 'produtos', action: 'create' },
        { resource: 'produtos', action: 'read' },
        { resource: 'produtos', action: 'update' },
        { resource: 'pedidos', action: 'create' },
        { resource: 'pedidos', action: 'read' },
        { resource: 'pedidos', action: 'update' },
        { resource: 'pedidos', action: 'cancel' },
        { resource: 'financeiro', action: 'create' },
        { resource: 'financeiro', action: 'read' },
        { resource: 'financeiro', action: 'update' },
        { resource: 'logistica', action: 'create' },
        { resource: 'logistica', action: 'read' },
        { resource: 'logistica', action: 'update' },
        { resource: 'relatorios', action: 'read' },
        { resource: 'relatorios', action: 'export' }
    ],
    user: [
        // Usuários (apenas próprio)
        { resource: 'users', action: 'read', conditions: ['self'] },
        { resource: 'users', action: 'update', conditions: ['self'] },
        // Recursos de negócio (limitado)
        { resource: 'clientes', action: 'read' },
        { resource: 'clientes', action: 'create', conditions: ['own_tenant'] },
        { resource: 'clientes', action: 'update', conditions: ['own_tenant'] },
        { resource: 'produtos', action: 'read' },
        { resource: 'pedidos', action: 'create', conditions: ['own_tenant'] },
        { resource: 'pedidos', action: 'read', conditions: ['own_tenant', 'own'] },
        { resource: 'pedidos', action: 'update', conditions: ['own_tenant', 'own'] },
        { resource: 'financeiro', action: 'read', conditions: ['own_tenant'] },
        { resource: 'logistica', action: 'read', conditions: ['own_tenant'] },
        { resource: 'relatorios', action: 'read', conditions: ['own_tenant'] }
    ]
};
/**
 * Hierarquia de roles para verificação de nível superior
 */
export const ROLE_HIERARCHY = {
    admin: 3,
    operator: 2,
    user: 1
};
/**
 * Sistema de RBAC
 */
export class RBAC {
    /**
     * Verifica se uma role tem permissão para uma ação em um recurso
     */
    static hasPermission(role, resource, action, conditions) {
        const permissions = ROLE_PERMISSIONS[role] || [];
        // Procurar permissão exata
        const permission = permissions.find(p => p.resource === resource && p.action === action);
        if (!permission) {
            // Verificar permissão wildcard (*)
            const wildcardPermission = permissions.find(p => p.resource === resource && p.action === '*');
            if (!wildcardPermission) {
                // Verificar se role superior tem permissão
                return this.checkHigherRolePermission(role, resource, action, conditions);
            }
            return this.checkConditions(wildcardPermission.conditions, conditions);
        }
        return this.checkConditions(permission.conditions, conditions);
    }
    /**
     * Verifica se uma role superior tem a permissão
     */
    static checkHigherRolePermission(role, resource, action, conditions) {
        const currentLevel = ROLE_HIERARCHY[role];
        // Verificar roles superiores
        for (const [higherRole, level] of Object.entries(ROLE_HIERARCHY)) {
            if (level > currentLevel) {
                if (this.hasPermission(higherRole, resource, action, conditions)) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Verifica condições especiais da permissão
     */
    static checkConditions(requiredConditions, context) {
        if (!requiredConditions || requiredConditions.length === 0) {
            return true;
        }
        if (!context) {
            return false;
        }
        return requiredConditions.every(condition => {
            switch (condition) {
                case 'self':
                    return context.userId === context.targetUserId;
                case 'own_tenant':
                    return context.userTenantId === context.resourceTenantId;
                case 'own':
                    return context.userId === context.resourceOwnerId;
                default:
                    systemLogger.warn({
                        condition,
                        message: 'Unknown permission condition'
                    }, 'RBAC: Unknown condition');
                    return false;
            }
        });
    }
    /**
     * Obtém todas as permissões de uma role
     */
    static getPermissions(role) {
        return ROLE_PERMISSIONS[role] || [];
    }
    /**
     * Verifica se uma role pode gerenciar outra role
     */
    static canManageRole(managerRole, targetRole) {
        const managerLevel = ROLE_HIERARCHY[managerRole];
        const targetLevel = ROLE_HIERARCHY[targetRole];
        // Admin pode gerenciar todos
        if (managerRole === 'admin') {
            return true;
        }
        // Operator pode gerenciar user, mas não admin ou operator
        if (managerRole === 'operator') {
            return targetRole === 'user';
        }
        // User não pode gerenciar ninguém
        return false;
    }
    /**
     * Obtém a hierarquia de roles
     */
    static getRoleHierarchy() {
        return { ...ROLE_HIERARCHY };
    }
    /**
     * Valida se uma role é válida
     */
    static isValidRole(role) {
        return Object.keys(ROLE_HIERARCHY).includes(role);
    }
    /**
     * Obtém o nível de uma role
     */
    static getRoleLevel(role) {
        return ROLE_HIERARCHY[role];
    }
    /**
     * Compara duas roles (retorna 1 se role1 > role2, -1 se role1 < role2, 0 se iguais)
     */
    static compareRoles(role1, role2) {
        const level1 = ROLE_HIERARCHY[role1];
        const level2 = ROLE_HIERARCHY[role2];
        if (level1 > level2)
            return 1;
        if (level1 < level2)
            return -1;
        return 0;
    }
}
