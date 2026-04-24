import { permissionUserRoleFromSecure } from '../../_core/secure-context.js';
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../../runtime/service-invocation.js";
import { reconstructLeoToolExecutionIdentity, stripForbiddenKeysFromInput as stripForbiddenKeysFromToolInput, toSecureToolContext, } from '../runtime/tenant-ownership.js';
import { ValidationError, InfrastructureError } from '../../_core/errors/typed-errors.js';
import { toolRegistry } from './tool-registry.js';
import { leoLogManager } from '../utils/leo-log-manager.js';
/** Sanitiza input desconhecido para Record<string, unknown> para uso seguro em handlers. */
function sanitizeToolInput(input) {
    if (input === null || input === undefined) {
        return { empty: true, sanitized: null };
    }
    if (typeof input === 'object' && !Array.isArray(input) && Object.getPrototypeOf(input) === Object.prototype) {
        return input;
    }
    return { value: input };
}
export class ToolExecutor {
    static TOOL_TIMEOUT_MS = 15000;
    static MAX_RETRIES = 2;
    async executeWithTimeout(promise, timeoutMs, toolName) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout de ${timeoutMs}ms excedido na tool '${toolName}'`));
            }, timeoutMs);
            promise
                .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
                .catch((error) => {
                clearTimeout(timer);
                reject(error instanceof Error ? error : new Error(String(error)));
            });
        });
    }
    async executeToolWithRetry(toolName, payload, context) {
        let lastError = '';
        for (let attempt = 1; attempt <= ToolExecutor.MAX_RETRIES + 1; attempt += 1) {
            try {
                const tool = toolRegistry.getTool(toolName);
                if (!tool) {
                    return { error: `Tool '${toolName}' não encontrada` };
                }
                const result = await this.executeWithTimeout(tool.handler(payload, context), ToolExecutor.TOOL_TIMEOUT_MS, toolName);
                return { result };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                lastError = errorMessage;
                await this.logToolExecution(toolName, payload, context, 'ERROR', {
                    attempt,
                    maxAttempts: ToolExecutor.MAX_RETRIES + 1,
                    error: errorMessage,
                    isRetry: attempt <= ToolExecutor.MAX_RETRIES,
                });
                if (attempt > ToolExecutor.MAX_RETRIES) {
                    break;
                }
            }
        }
        return { error: `Falha na tool '${toolName}' após retry automático: ${lastError}` };
    }
    /** Execução tipada com payload único (recomendado para novos call sites). */
    async executeToolWithPayload(payload) {
        const ctx = {
            ...payload.context,
            userRole: permissionUserRoleFromSecure(payload.context),
            __fromTool: true,
        };
        return this.executeTool(payload.toolName, payload.input, ctx);
    }
    async executeTool(toolName, input, context) {
        const identity = await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => reconstructLeoToolExecutionIdentity(context));
        const invocationCtx = {
            ...toSecureToolContext(identity),
            userRole: identity.userRole,
            __fromTool: true,
        };
        return runWithServiceInvocationAsync(invocationCtx, async () => {
            const startTime = Date.now();
            const sanitizedInput = stripForbiddenKeysFromToolInput(sanitizeToolInput(input));
            try {
                // 0. Validar contexto obrigatório antes de tudo
                const { agentPermissions } = await import('../security/agent-permissions.js');
                const permissionContext = {
                    tenantId: invocationCtx.tenantId,
                    userId: invocationCtx.userId,
                    userRole: invocationCtx.userRole ?? permissionUserRoleFromSecure(invocationCtx),
                    role: invocationCtx.role,
                    vendedorId: invocationCtx.vendedorId,
                    action: 'execute'
                };
                const contextValidation = agentPermissions.validateRequiredContext(permissionContext);
                if (!contextValidation.valid) {
                    throw new ValidationError(`Contexto inválido: ${contextValidation.reason}`);
                }
                // 1. Validar permissões antes de buscar tool
                const permissionCheck = agentPermissions.hasPermission(toolName, permissionContext);
                if (!permissionCheck.allowed) {
                    throw new ValidationError(`Permissão negada: ${permissionCheck.reason}`);
                }
                // Validar tool existe
                const tool = toolRegistry.getTool(toolName);
                if (!tool) {
                    throw new ValidationError(`Tool '${toolName}' não encontrada`);
                }
                // Validar input com Zod
                const validationResult = tool.inputSchema.safeParse(sanitizedInput);
                if (!validationResult.success) {
                    const errorMessages = validationResult.error.issues
                        .map((e) => `${(e.path ?? []).map(String).join('.')}: ${e.message ?? 'erro'}`)
                        .join(', ');
                    throw new ValidationError(`Input inválido: ${errorMessages}`);
                }
                // Log antes da execução
                await this.logToolExecution(toolName, sanitizedInput, invocationCtx, 'START');
                // Executar handler (payload tipado como Record<string, unknown>)
                const payload = (validationResult.data != null && typeof validationResult.data === 'object')
                    ? validationResult.data
                    : {};
                const execution = await this.executeToolWithRetry(toolName, payload, invocationCtx);
                if (execution.error) {
                    throw new InfrastructureError(execution.error);
                }
                const result = execution.result;
                const executionTime = Date.now() - startTime;
                // Log sucesso
                await this.logToolExecution(toolName, sanitizedInput, invocationCtx, 'SUCCESS', {
                    executionTime,
                    resultSummary: this.summarizeResult(result)
                });
                return {
                    success: true,
                    data: result,
                    executionTime,
                    toolName
                };
            }
            catch (error) {
                const executionTime = Date.now() - startTime;
                const errorMessage = error instanceof Error ? error.message : String(error);
                // Log erro (sempre visível; não engolir falhas de segurança)
                await this.logToolExecution(toolName, sanitizedInput, invocationCtx, 'ERROR', {
                    executionTime,
                    error: errorMessage
                });
                return {
                    success: false,
                    error: `Fallback de erro acionado: ${errorMessage}`,
                    executionTime,
                    toolName,
                };
            }
        });
    }
    async executeMultipleTools(toolCalls, context) {
        const results = [];
        for (const call of toolCalls) {
            try {
                const result = await this.executeTool(call.toolName, call.input, context);
                results.push(result);
                if (!result.success) {
                    console.warn(`Tool ${call.toolName} falhou, continuando com próximas...`);
                }
            }
            catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                results.push({
                    toolName: call.toolName,
                    success: false,
                    error: errorMessage,
                    executionTime: 0,
                });
                console.warn(`Tool ${call.toolName} erro: ${errorMessage}`);
            }
        }
        return results;
    }
    async logToolExecution(toolName, input, context, status, metadata) {
        try {
            const logEntry = {
                timestamp: new Date(),
                level: status === 'ERROR' ? 'ERROR' : 'INFO',
                module: 'TOOL_EXECUTION',
                message: `Tool ${toolName} - ${status}`,
                data: {
                    toolName,
                    input: this.sanitizeInputForLog(input),
                    context: {
                        tenantId: context.tenantId,
                        userRole: context.userRole,
                        userId: context.userId,
                        role: context.role,
                        vendedorId: context.vendedorId
                    },
                    status,
                    metadata,
                    timestamp: new Date().toISOString()
                }
            };
            leoLogManager.writeLog(logEntry);
        }
        catch (logError) {
            console.error('Erro ao logar execução de tool:', logError);
        }
    }
    sanitizeInputForLog(input) {
        const sanitized = { ...input };
        const sensitiveFields = ['senha', 'password', 'token', 'apiKey', 'secret'];
        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '***MASKED***';
            }
        }
        return sanitized;
    }
    summarizeResult(result) {
        if (result === null || result === undefined) {
            return 'null/undefined';
        }
        if (typeof result === 'string') {
            return result.length > 100 ? result.substring(0, 100) + '...' : result;
        }
        if (Array.isArray(result)) {
            return `Array[${result.length}]`;
        }
        if (typeof result === 'object') {
            const keys = Object.keys(result);
            return `Object{${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}}`;
        }
        return String(result);
    }
    // Validação de permissões baseada no papel do usuário
    async validateToolPermissions(toolName, context) {
        const { agentPermissions } = await import('../security/agent-permissions.js');
        const permissionContext = {
            tenantId: context.tenantId,
            userId: context.userId,
            userRole: context.userRole ?? permissionUserRoleFromSecure(context),
            role: context.role,
            vendedorId: context.vendedorId,
            action: 'execute'
        };
        const permissionCheck = agentPermissions.hasPermission(toolName, permissionContext);
        return permissionCheck.allowed;
    }
    // Lista todas as tools disponíveis para o contexto atual
    async getAvailableTools(context) {
        const { agentPermissions } = await import('../security/agent-permissions.js');
        const allTools = toolRegistry.getAllTools();
        const availableTools = [];
        for (const tool of allTools) {
            const permissionContext = {
                tenantId: context.tenantId,
                userId: context.userId,
                userRole: context.userRole ?? permissionUserRoleFromSecure(context),
                role: context.role,
                vendedorId: context.vendedorId,
                action: 'list'
            };
            const permissionCheck = agentPermissions.hasPermission(tool.name, permissionContext);
            if (permissionCheck.allowed) {
                availableTools.push(tool);
            }
        }
        return availableTools;
    }
}
// Export singleton
export const toolExecutor = new ToolExecutor();
