import { toolExecutor } from './tool-executor.js';
import { toolRegistry } from './tool-registry.js';
import { modelRouter } from './model-router.js';
import { promptBuilder } from './prompt-builder.js';
import { leoLogManager } from '../utils/leo-log-manager.js';
import { agentPermissions } from '../security/agent-permissions.js';
import { LeoActionsLog } from '../utils/leo-actions-log.js';
import { buildLeoSessionKey, leoSessionGate } from '../runtime/leo-session-gate.js';
import { createSecureExecutionContext } from '../security/secure-context.js';
export class LeoAgentCore {
    /**
     * Main entry point for handling agent requests
     * COM VALIDAÇÃO DE SEGURANÇA OBRIGATÓRIA
     */
    async handleRequest(request) {
        // BLOQUEIO GLOBAL: Validar contexto seguro ANTES de tudo
        let secureContext;
        try {
            secureContext = await createSecureExecutionContext(request, {
                tenantId: request.tenantId,
                userId: request.userId,
                userRole: request.userRole,
                vendedorId: request.vendedorId
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro de segurança';
            return {
                response: `Acesso negado: ${errorMessage}`,
                success: false,
                error: errorMessage,
                executionTime: 0
            };
        }
        const ctxSid = secureContext.sessionId;
        const sessionKey = buildLeoSessionKey(secureContext.tenantId, secureContext.userId, ctxSid || undefined, "agent");
        return leoSessionGate.run(sessionKey, () => this.handleRequestSerialized(request, secureContext));
    }
    /** Execução real (uma por vez por sessão). */
    async handleRequestSerialized(request, secureContext) {
        const startTime = Date.now();
        try {
            // Log execution start
            await this.logExecution(request, 'START');
            // Build prompt with CONTEXTO SEGURO (ignorando input malicioso)
            const prompt = await this.buildPrompt(request, secureContext);
            // Get model response with CONTEXTO SEGURO
            const modelResponse = await this.callModelRouter(prompt, secureContext);
            // Plan and execute actions with CONTEXTO SEGURO
            const toolResults = await this.planActions(modelResponse, secureContext);
            // Build final response
            const finalResponse = await this.buildResponse(modelResponse, toolResults, request);
            const executionTime = Date.now() - startTime;
            // Log successful execution
            await this.logExecution(request, 'SUCCESS', {
                executionTime,
                toolCallsCount: toolResults.length,
                responseLength: finalResponse.length
            });
            return {
                response: finalResponse,
                toolCalls: toolResults,
                success: true,
                executionTime
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Log error
            await this.logExecution(request, 'ERROR', {
                executionTime,
                error: errorMessage
            });
            return {
                response: 'Desculpe, ocorreu um erro ao processar sua solicitação.',
                success: false,
                error: errorMessage,
                executionTime
            };
        }
    }
    /**
     * Plan actions based on model response with improved reasoning
     * USA CONTEXTO SEGURO - IGNORA INPUT MALICIOSO
     */
    async planActions(modelResponse, secureContext) {
        if (!modelResponse.toolCalls || modelResponse.toolCalls.length === 0) {
            return [];
        }
        const context = {
            tenantId: secureContext.tenantId,
            userId: secureContext.userId,
            role: secureContext.role,
            userRole: secureContext.userRole,
            vendedorId: secureContext.vendedorId,
        };
        // Enhanced reasoning loop: reason → decide → execute → observe → respond
        const results = [];
        for (const toolCall of modelResponse.toolCalls) {
            // Check permissions before execution with CONTEXTO SEGURO
            const permission = agentPermissions.hasPermission(toolCall.toolName, {
                tenantId: secureContext.tenantId,
                userRole: secureContext.userRole,
                userId: secureContext.userId,
                vendedorId: secureContext.vendedorId,
                role: secureContext.role,
                action: toolCall.toolName
            });
            if (!permission.allowed) {
                results.push({
                    toolName: toolCall.toolName,
                    success: false,
                    error: permission.reason || 'Permissão negada',
                    executionTime: 0,
                    data: undefined
                });
                continue;
            }
            // Log tool execution attempt with CONTEXTO SEGURO
            await LeoActionsLog.logAction({
                toolName: toolCall.toolName,
                executionTime: 0,
                result: 'partial',
                tenantId: secureContext.tenantId,
                userId: secureContext.userId,
                vendedorId: secureContext.vendedorId,
                input: toolCall.input,
                metadata: {
                    reasoning: 'permission_check',
                    allowed: permission.allowed,
                    requiresConfirmation: permission.requiresConfirmation
                },
                timestamp: new Date(),
            });
            // Execute tool with confirmation if required
            let toolResult;
            try {
                if (permission.requiresConfirmation) {
                    toolResult = await toolExecutor.executeTool(toolCall.toolName, toolCall.input, context);
                }
                else {
                    toolResult = await toolExecutor.executeTool(toolCall.toolName, toolCall.input, context);
                }
            }
            catch (execErr) {
                const errorMessage = execErr instanceof Error ? execErr.message : String(execErr);
                toolResult = {
                    toolName: toolCall.toolName,
                    success: false,
                    error: errorMessage,
                    executionTime: 0,
                };
            }
            // Log actual execution with CONTEXTO SEGURO
            await LeoActionsLog.logAction({
                timestamp: new Date(),
                toolName: toolCall.toolName,
                executionTime: toolResult.executionTime || 0,
                result: toolResult.success ? 'success' : 'error',
                errorMessage: toolResult.error,
                tenantId: secureContext.tenantId,
                userId: secureContext.userId,
                vendedorId: secureContext.vendedorId,
                input: toolCall.input,
                output: toolResult.data,
                metadata: {
                    reasoning: 'tool_executed',
                    dangerous: permission.dangerous
                }
            });
            results.push(toolResult);
        }
        return results;
    }
    /**
     * Execute a single tool
     */
    async executeTool(toolName, input, context) {
        try {
            return await toolExecutor.executeTool(toolName, input, context);
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return {
                toolName,
                success: false,
                error: errorMessage,
                executionTime: 0,
            };
        }
    }
    /**
     * Build prompt with CONTEXTO SEGURO and available tools
     */
    async buildPrompt(request, secureContext) {
        const availableTools = toolRegistry.getToolsSchema();
        return await promptBuilder.buildSystemPrompt({
            tenantId: secureContext.tenantId,
            userRole: secureContext.userRole,
            userId: secureContext.userId,
            vendedorId: secureContext.vendedorId,
            ...secureContext.safeContext,
        });
    }
    /**
     * Call model router for AI response with CONTEXTO SEGURO
     */
    async callModelRouter(prompt, secureContext) {
        const availableTools = toolRegistry.getToolsSchema();
        return await modelRouter.getResponse({
            prompt,
            tools: availableTools,
            context: {
                tenantId: secureContext.tenantId,
                userRole: secureContext.userRole,
                userId: secureContext.userId,
                vendedorId: secureContext.vendedorId,
            }
        });
    }
    /**
     * Build final response from model and tool results
     */
    async buildResponse(modelResponse, toolResults, request) {
        // If there are tool results, format them in the response
        if (toolResults.length > 0) {
            let response = modelResponse.content || '';
            // Add tool results
            for (const result of toolResults) {
                if (result.success) {
                    response += `\n\n✅ **${result.toolName} executado com sucesso**`;
                    if (result.data) {
                        response += `\n${JSON.stringify(result.data, null, 2)}`;
                    }
                }
                else {
                    response += `\n\n❌ **Erro ao executar ${result.toolName}**`;
                    if (result.error) {
                        response += `\n${result.error}`;
                    }
                }
            }
            return response;
        }
        return modelResponse.content || 'Processado com sucesso.';
    }
    /**
     * Log agent execution events
     */
    async logExecution(request, status, metadata) {
        await leoLogManager.writeLog({
            level: status === 'ERROR' ? 'ERROR' : status === 'SUCCESS' ? 'INFO' : 'DEBUG',
            module: 'LEO_AGENT_CORE',
            message: `Agent execution ${status}`,
            data: {
                tenantId: request.tenantId,
                userRole: request.userRole,
                userId: request.userId,
                vendedorId: request.vendedorId,
                message: request.message,
                ...metadata
            },
            timestamp: new Date()
        });
    }
}
// Export singleton
export const leoAgentCore = new LeoAgentCore();
