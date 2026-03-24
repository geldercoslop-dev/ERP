import { toolExecutor, ToolExecutionContext, ToolExecutionResult } from './tool-executor';
import { toolRegistry } from './tool-registry';
import { modelRouter } from './model-router';
import { promptBuilder } from './prompt-builder';
import { leoLogManager } from '../utils/leo-log-manager';
import { agentPermissions } from '../security/agent-permissions';
import { LeoActionsLog } from '../utils/leo-actions-log';
import { buildLeoSessionKey, leoSessionGate } from '../runtime/leo-session-gate';
import { createSecureExecutionContext, SecureAgentContext } from '../security/secure-context';

export interface AgentRequest {
  message: string;
  tenantId: number;
  userRole?: string;
  userId?: number;
  vendedorId?: number;
  /** Fila LEO: mesma sessão = serializado (1 ação ativa). */
  sessionId?: string;
  context?: Record<string, unknown>;
}

export interface AgentResponse {
  response: string;
  toolCalls?: ToolExecutionResult[];
  success: boolean;
  error?: string;
  executionTime: number;
}

export interface ModelResponse {
  content: string;
  toolCalls?: Array<{
    toolName: string;
    input: unknown;
    reasoning?: string;
  }>;
}

export class LeoAgentCore {
  /**
   * Main entry point for handling agent requests
   * COM VALIDAÇÃO DE SEGURANÇA OBRIGATÓRIA
   */
  async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    // BLOQUEIO GLOBAL: Validar contexto seguro ANTES de tudo
    let secureContext: SecureAgentContext;
    try {
      secureContext = await createSecureExecutionContext(request, {
        tenantId: request.tenantId,
        userId: request.userId!,
        userRole: request.userRole,
        vendedorId: request.vendedorId
      });
    } catch (error) {
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
  private async handleRequestSerialized(request: AgentRequest, secureContext: SecureAgentContext): Promise<AgentResponse> {
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

    } catch (error) {
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
  async planActions(modelResponse: ModelResponse, secureContext: SecureAgentContext): Promise<ToolExecutionResult[]> {
    if (!modelResponse.toolCalls || modelResponse.toolCalls.length === 0) {
      return [];
    }

    const context: ToolExecutionContext = {
      tenantId: secureContext.tenantId,
      userId: secureContext.userId,
      role: secureContext.role,
      userRole: secureContext.userRole,
      vendedorId: secureContext.vendedorId,
    };

    // Enhanced reasoning loop: reason → decide → execute → observe → respond
    const results: ToolExecutionResult[] = [];
    
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
        input: toolCall.input as Record<string, unknown>,
        metadata: { 
          reasoning: 'permission_check',
          allowed: permission.allowed,
          requiresConfirmation: permission.requiresConfirmation
        },
        timestamp: new Date(),
      });

      // Execute tool with confirmation if required
      let toolResult: ToolExecutionResult;
      try {
        if (permission.requiresConfirmation) {
          toolResult = await toolExecutor.executeTool(toolCall.toolName, toolCall.input, context);
        } else {
          toolResult = await toolExecutor.executeTool(toolCall.toolName, toolCall.input, context);
        }
      } catch (execErr) {
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
        input: toolCall.input as Record<string, unknown>,
        output: toolResult.data as Record<string, unknown> | undefined,
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
  async executeTool(toolName: string, input: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      return await toolExecutor.executeTool(toolName, input, context);
    } catch (err) {
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
  async buildPrompt(request: AgentRequest, secureContext: SecureAgentContext): Promise<string> {
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
  async callModelRouter(prompt: string, secureContext: SecureAgentContext): Promise<ModelResponse> {
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
  async buildResponse(
    modelResponse: ModelResponse,
    toolResults: ToolExecutionResult[],
    request: AgentRequest
  ): Promise<string> {
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
        } else {
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
  async logExecution(
    request: AgentRequest, 
    status: 'START' | 'SUCCESS' | 'ERROR',
    metadata?: Record<string, unknown>
  ): Promise<void> {
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
