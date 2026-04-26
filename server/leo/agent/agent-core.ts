import { toolRegistry } from './tool-registry.js';
import { modelRouter } from './model-router.js';
import { promptBuilder } from './prompt-builder.js';
import { leoLogManager } from '../utils/leo-log-manager.js';
import { agentPermissions } from '../security/agent-permissions.js';
import { LeoActionsLog } from '../utils/leo-actions-log.js';
import { buildLeoSessionKey, leoSessionGate } from '../runtime/leo-session-gate.js';
import { createSecureExecutionContext, SecureAgentContext } from '../security/secure-context.js';
import { executeLeoActionGate, type ExecutionGateRequest } from '../runtime/execution-gate.js';
import type { ToolExecutionResult } from './tool-executor.js';

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
   * EXECUTION GATE: TODA execução passa pelo gate centralizado
   */
  async planActions(modelResponse: ModelResponse, secureContext: SecureAgentContext): Promise<ToolExecutionResult[]> {
    if (!modelResponse.toolCalls || modelResponse.toolCalls.length === 0) {
      return [];
    }

    // Enhanced reasoning loop: reason → decide → execute → observe → respond
    const results: ToolExecutionResult[] = [];
    
    for (const toolCall of modelResponse.toolCalls) {
      // EXECUTION GATE: Passar toda execução pelo gate
      const gateRequest: ExecutionGateRequest = {
        action: toolCall.toolName,
        toolName: toolCall.toolName,
        parameters: toolCall.input as Record<string, unknown>,
        context: {
          tenantId: secureContext.tenantId,
          userId: secureContext.userId,
          role: secureContext.role,
          userRole: secureContext.userRole,
          vendedorId: secureContext.vendedorId,
          sessionId: secureContext.sessionId,
        },
        source: 'agent',
      };

      const gateResult = await executeLeoActionGate(gateRequest);
      
      // Converter resultado do gate para ToolExecutionResult
      const toolResult: ToolExecutionResult = {
        toolName: toolCall.toolName,
        success: gateResult.success,
        error: gateResult.message,
        executionTime: gateResult.executionTime,
        data: gateResult.data,
      };

      results.push(toolResult);
    }
    
    return results;
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
