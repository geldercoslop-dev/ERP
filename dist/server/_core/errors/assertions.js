// Assert helpers reutilizáveis para tenant e db
import { ValidationError, InfrastructureError } from './app-error.js';
export function assertTenantId(tenantId, details) {
    if (typeof tenantId !== 'number' || !Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError('tenantId ausente ou inválido', { ...details, tenantId });
    }
}
export function assertDbConnection(dbConn, details) {
    if (!dbConn) {
        throw new InfrastructureError('Conexão com banco ausente ou inválida', details);
    }
}
