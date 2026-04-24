import { insertLeoLegacyActionLog } from '../../../services/leo-action-log.service.js';
import { logAction } from '../../../services/ai/leo-action-logger.js';
import { ValidationError } from '../../../_core/errors/typed-errors.js';
function requireTenantId(tenantId) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new ValidationError('tenantId obrigatório');
    }
    return tenantId;
}
function serializeAuditData(value) {
    if (value == null) {
        return null;
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function buildLegacyUsuario(tenantId, usuario) {
    const tenantToken = `tenant:${tenantId}`;
    if (!usuario) {
        return tenantToken;
    }
    return usuario.includes('tenant:') ? usuario : `${tenantToken}:${usuario}`;
}
async function logToolExecution(input) {
    const tenantId = requireTenantId(input.tenantId);
    await logAction({
        tool: input.tool,
        input: input.input,
        result: input.result,
        success: input.success,
        executionTime: input.executionTime,
        ctx: {
            tenantId,
            userId: input.userId,
        },
    });
    return { success: true };
}
export const leoAuditTool = {
    async logLegacy(input) {
        const tenantId = requireTenantId(input.tenantId);
        await insertLeoLegacyActionLog({
            usuario: buildLegacyUsuario(tenantId, input.usuario),
            acao: input.acao,
            entidade: input.entidade,
            dados: serializeAuditData(input.dados),
            resultado: input.resultado,
        });
        return { success: true };
    },
    async logExecution(input) {
        return logToolExecution(input);
    },
    async logToolResult(input) {
        return logToolExecution(input);
    },
};
