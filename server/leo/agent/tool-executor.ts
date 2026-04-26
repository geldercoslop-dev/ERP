import type { Payload } from '../../../shared/types/index.js';
import type { SecureToolContext, ToolExecutionPayload } from '../../_core/secure-context.js';
import { permissionUserRoleFromSecure } from '../../_core/secure-context.js';
import type { ServiceInvocationStore } from '../../_core/service-entry-guard.js';
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from '../../_core/service-entry-guard.js';
import {
  reconstructLeoToolExecutionIdentity,
  stripForbiddenKeysFromToolInput,
  toSecureToolContext,
} from '../../_core/tenant-ownership.js';
import { ValidationError, InfrastructureError } from '../../_core/errors/typed-errors.js';
import { toolRegistry, ToolDefinition } from './tool-registry.js';
import { leoLogManager } from '../utils/leo-log-manager.js';

/** Alias do contexto seguro de execução (handlers e executor). */
export type ToolExecutionContext = SecureToolContext;

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
  toolName: string;
}

/** Sanitiza input desconhecido para Record<string, unknown> para uso seguro em handlers. */
function sanitizeToolInput(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) {
    return { empty: true, sanitized: null };
  }
  if (typeof input === 'object' && !Array.isArray(input) && Object.getPrototypeOf(input) === Object.prototype) {
    return input as Record<string, unknown>;
  }
  return { value: input };
}

export class ToolExecutor {
  // HARDENING: ENV só configura parâmetros, não decide fluxo de execução
  // Comportamento sempre definido em código
  private static readonly TOOL_TIMEOUT_MS: number = 15000; // 15 segundos fixo
  private static readonly MAX_RETRIES: number = 2; // 2 retries fixo

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout de ${timeoutMs}ms excedido na tool '${toolName}'`));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private async executeToolWithRetry(
    toolName: string,
    payload: Payload,
    context: ToolExecutionContext
  ): Promise<{ result?: unknown; error?: string }> {
    let lastError = '';

    for (let attempt = 1; attempt <= ToolExecutor.MAX_RETRIES + 1; attempt += 1) {
      try {
        const tool = toolRegistry.getTool(toolName);
        if (!tool) {
          return { error: `Tool '${toolName}' não encontrada` };
        }

        const result = await this.executeWithTimeout(
          tool.handler(payload, context),
          ToolExecutor.TOOL_TIMEOUT_MS,
          toolName
        );

        return { result };
      } catch (error) {
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
  async executeToolWithPayload(payload: ToolExecutionPayload): Promise<ToolExecutionResult> {
    const ctx: ToolExecutionContext = {
      ...payload.context,
      userRole: permissionUserRoleFromSecure(payload.context),
      __fromTool: true,
    };
    return this.executeTool(payload.toolName, payload.input, ctx);
  }

  async executeTool(
    toolName: string,
    input: unknown,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const identity = await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () =>
      reconstructLeoToolExecutionIdentity(context)
    );
    const invocationCtx: ServiceInvocationStore = {
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
          .map((e: { path?: unknown[]; message?: string }) => `${(e.path ?? []).map(String).join('.')}: ${e.message ?? 'erro'}`)
          .join(', ');
        throw new ValidationError(`Input inválido: ${errorMessages}`);
      }

      // Log antes da execução
      await this.logToolExecution(toolName, sanitizedInput, invocationCtx, 'START');

      // Executar handler (payload tipado como Record<string, unknown>)
      const payload: Payload = (validationResult.data != null && typeof validationResult.data === 'object')
        ? (validationResult.data as Payload)
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

    } catch (error) {
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

  async executeMultipleTools(
    toolCalls: Array<{ toolName: string; input: unknown }>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const call of toolCalls) {
      try {
        const result = await this.executeTool(call.toolName, call.input, context);
        results.push(result);
        if (!result.success) {
          console.warn(`Tool ${call.toolName} falhou, continuando com próximas...`);
        }
      } catch (err) {
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

  private async logToolExecution(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    status: 'START' | 'SUCCESS' | 'ERROR',
    metadata?: Record<string, unknown>
  ) {
    try {
      const logEntry = {
        timestamp: new Date(),
        level: status === 'ERROR' ? 'ERROR' as const : 'INFO' as const,
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
    } catch (logError) {
      console.error('Erro ao logar execução de tool:', logError);
    }
  }

  private sanitizeInputForLog(input: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...input };
    const sensitiveFields = ['senha', 'password', 'token', 'apiKey', 'secret'];
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***MASKED***';
      }
    }
    return sanitized;
  }

  private summarizeResult(result: unknown): string {
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
  private async validateToolPermissions(
    toolName: string,
    context: ToolExecutionContext
  ): Promise<boolean> {
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
  async getAvailableTools(context: ToolExecutionContext): Promise<ToolDefinition[]> {
    const { agentPermissions } = await import('../security/agent-permissions.js');
    const allTools = toolRegistry.getAllTools();
    const availableTools: ToolDefinition[] = [];

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
