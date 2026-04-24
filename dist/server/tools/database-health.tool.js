import { pingDatabase } from '../services/database-health.service.js';
import { ValidationError } from '../_core/errors/typed-errors.js';
function requireTenantId(tenantId) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError('tenantId obrigatório');
    }
    return tenantId;
}
async function readHealth(input) {
    const tenantId = requireTenantId(input.tenantId);
    const result = await pingDatabase();
    return {
        tenantId,
        ok: result.ok,
        latencyMs: result.latencyMs,
        threadsConnected: result.threadsConnected,
        checkedAt: new Date().toISOString(),
    };
}
export const databaseHealthTool = {
    async ping(input) {
        return readHealth(input);
    },
    async healthSnapshot(input) {
        return readHealth(input);
    },
    async pingSystem() {
        const result = await pingDatabase();
        return {
            ok: result.ok,
            latencyMs: result.latencyMs,
            threadsConnected: result.threadsConnected,
            checkedAt: new Date().toISOString(),
        };
    },
};
