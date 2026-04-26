/**
 * ⚠️ CORE IMUTÁVEL - LEO EXECUTION GATE
 * 
 * Este arquivo é parte do CORE DE EXECUÇÃO DO LEO e é IMUTÁVEL.
 * Veja CORE_IMMUTABLE.md para detalhes.
 * 
 * SINGLE POINT OF EXECUTION
 * 
 * PRINCÍPIO ABSOLUTO:
 * - TODA execução do sistema DEVE passar por este gate
 * - NÃO existe execução fora deste gate
 * - NÃO existe bypass de approval
 * - NÃO existe bypass de tenant validation
 * - NÃO existe acesso direto a services
 * 
 * ARQUITETURA OBRIGATÓRIA:
 * LEO → EXECUTION GATE → TOOLS → SERVICES → DB
 * 
 * VIOLAÇÃO DETECTADA = CRITICAL FAIL
 * 
 * ⚠️ AVISO: Alterações estruturais neste arquivo requerem justificativa de segurança.
 * Consulte CORE_IMMUTABLE.md antes de modificar.
 */

import { ValidationError } from '../../_core/errors/typed-errors.js';
import { logInfo, logError } from '../../_core/logger.js';
import { toolExecutor, type ToolExecutionContext, type ToolExecutionResult } from '../agent/tool-executor.js';
import { agentPermissions } from '../security/agent-permissions.js';
import { LeoActionsLog } from '../utils/leo-actions-log.js';
import type { SecureRole } from '../../_core/secure-context.js';
import { 
  markExecutionOrigin, 
  clearExecutionOrigin, 
  withExecutionOrigin,
  type ExecutionContext 
} from './execution-contract-layer.js';
import { 
  withExecutionRegistry,
  executionRegistry 
} from './execution-registry.js';

/**
 * Action request que passa pelo Execution Gate
 */
export interface ExecutionGateRequest {
  action: string;
  toolName: string;
  parameters?: Record<string, unknown>;
  context: {
    tenantId: number;
    userId: number;
    userRole?: string;
    vendedorId?: number;
    role?: SecureRole;
    sessionId?: string;
  };
  requiresConfirmation?: boolean;
  source?: 'agent' | 'scheduler' | 'operator' | 'automation' | 'user';
}

/**
 * Resultado da execução pelo gate
 */
export interface ExecutionGateResult {
  success: boolean;
  message: string;
  data?: unknown;
  executionTime: number;
  blocked?: boolean;
  blockedReason?: string;
  requiresApproval?: boolean;
  approvalId?: string;
}

/**
 * SINGLE EXECUTION GATE - ÚNICO PONTO DE EXECUÇÃO
 * 
 * Esta é a ÚNICA função que pode executar ações no sistema LEO.
 * Qualquer execução fora deste gate é uma VIOLAÇÃO CRÍTICA.
 * 
 * HARDENING: Integra com ExecutionContractLayer e ExecutionRegistry
 */
export async function executeLeoActionGate(request: ExecutionGateRequest): Promise<ExecutionGateResult> {
  const startTime = Date.now();
  
  // EXECUTION CONTRACT LAYER: Marcar origem como execution-gate
  const executionContext: ExecutionContext = {
    origin: 'execution-gate',
    actor: request.source || 'unknown',
    tenantId: request.context.tenantId,
    entrypoint: 'executeLeoActionGate',
    timestamp: new Date(),
    traceId: `gate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };
  
  return await withExecutionOrigin('execution-gate', executionContext, async () => {
    return await withExecutionRegistry(executionContext, async () => {
      try {
        // STEP 1: VALIDATE TENANT (OBRIGATÓRIO)
        await validateTenantContext(request.context);
        
        // STEP 2: CHECK PERMISSIONS
        const permission = await checkActionPermission(request);
        
        if (!permission.allowed) {
          const blockedResult: ExecutionGateResult = {
            success: false,
            message: permission.reason || 'Permissão negada',
            executionTime: Date.now() - startTime,
            blocked: true,
            blockedReason: 'permission_denied',
          };
          
          await logExecutionAttempt(request, blockedResult, 'permission_denied');
          return blockedResult;
        }
        
        // STEP 3: CHECK APPROVAL (BLOQUEIO REAL)
        if (permission.requiresConfirmation || request.requiresConfirmation) {
          const approvalResult = await handleApprovalRequired(request);
          
          await logExecutionAttempt(request, approvalResult, 'approval_required');
          return approvalResult;
        }
        
        // STEP 4: EXECUTE VIA TOOL (ÚNICA INTERFACE)
        const toolResult = await executeViaTool(request);
        
        const finalResult: ExecutionGateResult = {
          success: toolResult.success,
          message: toolResult.success ? 'Ação executada com sucesso' : toolResult.error || 'Erro na execução',
          data: toolResult.data,
          executionTime: Date.now() - startTime,
        };
        
        await logExecutionAttempt(request, finalResult, 'executed');
        return finalResult;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        const errorResult: ExecutionGateResult = {
          success: false,
          message: errorMessage,
          executionTime: Date.now() - startTime,
          blocked: true,
          blockedReason: 'execution_error',
        };
        
        await logExecutionAttempt(request, errorResult, 'error');
        return errorResult;
      }
    });
  });
}

/**
 * VALIDAÇÃO OBRIGATÓRIA DE TENANT
 * 
 * Se falhar → BLOQUEIO IMEDIATO
 */
async function validateTenantContext(context: ExecutionGateRequest['context']): Promise<void> {
  const { tenantId, userId } = context;
  
  // TenantId é obrigatório
  if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
    throw new ValidationError('tenantId obrigatório e deve ser um inteiro positivo');
  }
  
  // UserId é obrigatório
  if (!userId || !Number.isInteger(userId) || userId <= 0) {
    throw new ValidationError('userId obrigatório e deve ser um inteiro positivo');
  }
  
  // Validar consistência de tenant com contexto (se disponível)
  // TODO: Implementar validação adicional de contexto de sessão
}

/**
 * VERIFICAÇÃO DE PERMISSÕES
 */
async function checkActionPermission(request: ExecutionGateRequest): Promise<{
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
  dangerous: boolean;
}> {
  const { toolName, context } = request;
  
  const permission = agentPermissions.hasPermission(toolName, {
    tenantId: context.tenantId,
    userRole: context.userRole,
    userId: context.userId,
    vendedorId: context.vendedorId,
    role: context.role,
    action: toolName,
  });
  
  return permission;
}

/**
 * HANDLING DE APPROVAL (BLOQUEIO REAL)
 * 
 * Se approval é necessário → EXECUÇÃO É BLOQUEADA
 * NÃO existe execução parcial ou fallback
 */
async function handleApprovalRequired(request: ExecutionGateRequest): Promise<ExecutionGateResult> {
  const { createPendingApproval } = await import('../../services/leo-approval.service.js');
  
  const approvalResult = await createPendingApproval({
    tenantId: request.context.tenantId,
    action: request.action,
    entity: 'leo_execution_gate',
    description: `LEO action ${request.action} via ${request.toolName} requires user approval`,
    riskLevel: 'high',
    payload: request.parameters || {},
    requestedBy: request.source || 'leo',
  });
  
  return {
    success: false,
    message: 'Action requires approval - execution blocked',
    executionTime: 0,
    blocked: true,
    blockedReason: 'approval_required',
    requiresApproval: true,
    approvalId: approvalResult.approval?.actionId,
  };
}

/**
 * EXECUÇÃO VIA TOOL (ÚNICA INTERFACE)
 * 
 * NÃO existe acesso direto a services
 * NÃO existe acesso direto a DB
 */
async function executeViaTool(request: ExecutionGateRequest): Promise<ToolExecutionResult> {
  const { toolName, parameters, context } = request;
  
  const toolContext: ToolExecutionContext = {
    tenantId: context.tenantId,
    userId: context.userId,
    role: context.role || 'user' as SecureRole,
    userRole: context.userRole,
    vendedorId: context.vendedorId,
  };
  
  return await toolExecutor.executeTool(toolName, parameters || {}, toolContext);
}

/**
 * LOG DE TENTATIVA DE EXECUÇÃO
 */
async function logExecutionAttempt(
  request: ExecutionGateRequest,
  result: ExecutionGateResult,
  status: string
): Promise<void> {
  await LeoActionsLog.logAction({
    timestamp: new Date(),
    toolName: request.toolName,
    executionTime: result.executionTime,
    result: result.success ? 'success' : 'error',
    errorMessage: result.message,
    tenantId: request.context.tenantId,
    userId: request.context.userId,
    vendedorId: request.context.vendedorId,
    input: request.parameters,
    output: result.data as Record<string, unknown> | undefined,
    metadata: {
      source: request.source,
      action: request.action,
      status,
      blocked: result.blocked,
      blockedReason: result.blockedReason,
      requiresApproval: result.requiresApproval,
      approvalId: result.approvalId,
    },
  });
  
  logInfo(`[ExecutionGate] ${status}: ${request.action} via ${request.toolName}`, {
    extra: {
      entity: 'ExecutionGate',
      acao: 'executeLeoActionGate',
      action: request.action,
      toolName: request.toolName,
      source: request.source,
      tenantId: request.context.tenantId,
      userId: request.context.userId,
      success: result.success,
      blocked: result.blocked,
      executionTime: result.executionTime,
    },
  });
}

/**
 * DETECTOR DE BYPASS EM RUNTIME
 * 
 * Verifica se a execução está acontecendo fora do gate
 */
export class ExecutionBypassDetector {
  private static executionGateStack = new Error('Execution Gate Stack Trace');
  
  /**
   * Verifica se a execução está acontecendo fora do gate
   * Deve ser chamado em pontos críticos do sistema
   */
  static detectBypass(caller: string): void {
    const stack = new Error().stack || '';
    
    // Se a stack não contém executeLeoActionGate, é um bypass
    if (!stack.includes('executeLeoActionGate') && !stack.includes('execution-gate.ts')) {
      logError(`[ExecutionBypassDetector] BYPASS DETECTED: ${caller}`, {
        extra: {
          entity: 'ExecutionBypassDetector',
          acao: 'detectBypass',
          caller,
          stack,
        },
      });
      
      throw new ValidationError(
        `CRITICAL: Execution bypass detected in ${caller}. All executions must go through executeLeoActionGate.`
      );
    }
  }
  
  /**
   * Marca início de execução via gate
   */
  static markGateExecution(): void {
    // Marca que estamos executando via gate
    this.executionGateStack = new Error('Execution Gate Stack Trace');
  }
}

/**
 * Export singleton para uso no sistema
 */
export const executionGate = {
  execute: executeLeoActionGate,
  detectBypass: () => ExecutionBypassDetector.detectBypass('unknown'),
};
