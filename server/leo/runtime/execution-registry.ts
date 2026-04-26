/**
 * ⚠️ CORE IMUTÁVEL - EXECUTION REGISTRY
 * 
 * Este arquivo é parte do CORE DE EXECUÇÃO DO LEO e é IMUTÁVEL.
 * Veja CORE_IMMUTABLE.md para detalhes.
 * 
 * PRINCÍPIO ABSOLUTO:
 * - TODA execução deve ser registrada
 * - Execução sem registro → BLOQUEIO
 * - Registro é obrigatório para rastreabilidade
 * 
 * ARQUITETURA:
 * ExecutionRegistry → registra toda execução → audit trail completo
 * 
 * ⚠️ AVISO: Alterações estruturais neste arquivo requerem justificativa de segurança.
 * Consulte CORE_IMMUTABLE.md antes de modificar.
 */

import { logInfo, logError } from '../../_core/logger.js';
import { ValidationError } from '../../_core/errors/typed-errors.js';
import type { ExecutionContext } from './execution-contract-layer.js';

/**
 * Registro de execução
 */
export interface ExecutionRecord {
  id: string;
  origin: string;
  actor: string;
  tenantId: number;
  entrypoint: string;
  timestamp: Date;
  traceId?: string;
  duration?: number;
  status: 'started' | 'completed' | 'failed' | 'blocked';
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Estado do registry
 */
class ExecutionRegistry {
  private static instance: ExecutionRegistry;
  private records = new Map<string, ExecutionRecord>();
  private enabled: boolean = true;

  private constructor() {
    // Singleton
  }

  public static getInstance(): ExecutionRegistry {
    if (!ExecutionRegistry.instance) {
      ExecutionRegistry.instance = new ExecutionRegistry();
    }
    return ExecutionRegistry.instance;
  }

  /**
   * Registra início de execução
   * OBRIGATÓRIO: toda execução deve chamar isso
   */
  registerStart(context: ExecutionContext): string {
    if (!this.enabled) {
      return this.generateId();
    }

    const record: ExecutionRecord = {
      id: this.generateId(),
      origin: context.origin,
      actor: context.actor,
      tenantId: context.tenantId,
      entrypoint: context.entrypoint,
      timestamp: context.timestamp,
      traceId: context.traceId,
      status: 'started',
    };

    this.records.set(record.id, record);

    logInfo(`[ExecutionRegistry] Execução iniciada: ${record.id}`, {
      extra: {
        entity: 'ExecutionRegistry',
        acao: 'registerStart',
        executionId: record.id,
        origin: context.origin,
        actor: context.actor,
        tenantId: context.tenantId,
        entrypoint: context.entrypoint,
      },
    });

    return record.id;
  }

  /**
   * Registra conclusão de execução
   */
  registerComplete(
    executionId: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.enabled) {
      return;
    }

    const record = this.records.get(executionId);
    if (!record) {
      logError(`[ExecutionRegistry] Registro não encontrado: ${executionId}`, {
        extra: {
          entity: 'ExecutionRegistry',
          acao: 'registerComplete',
          executionId,
        },
      });
      return;
    }

    record.status = 'completed';
    record.duration = duration;
    record.metadata = metadata;

    logInfo(`[ExecutionRegistry] Execução concluída: ${executionId}`, {
      extra: {
        entity: 'ExecutionRegistry',
        acao: 'registerComplete',
        executionId,
        duration,
      },
    });
  }

  /**
   * Registra falha de execução
   */
  registerFailure(
    executionId: string,
    error: string,
    duration?: number
  ): void {
    if (!this.enabled) {
      return;
    }

    const record = this.records.get(executionId);
    if (!record) {
      logError(`[ExecutionRegistry] Registro não encontrado: ${executionId}`, {
        extra: {
          entity: 'ExecutionRegistry',
          acao: 'registerFailure',
          executionId,
        },
      });
      return;
    }

    record.status = 'failed';
    record.error = error;
    record.duration = duration;

    logError(`[ExecutionRegistry] Execução falhou: ${executionId}`, {
      extra: {
        entity: 'ExecutionRegistry',
        acao: 'registerFailure',
        executionId,
        error,
        duration,
      },
    });
  }

  /**
   * Registra bloqueio de execução
   */
  registerBlock(
    executionId: string,
    reason: string,
    duration?: number
  ): void {
    if (!this.enabled) {
      return;
    }

    const record = this.records.get(executionId);
    if (!record) {
      logError(`[ExecutionRegistry] Registro não encontrado: ${executionId}`, {
        extra: {
          entity: 'ExecutionRegistry',
          acao: 'registerBlock',
          executionId,
        },
      });
      return;
    }

    record.status = 'blocked';
    record.error = reason;
    record.duration = duration;

    logInfo(`[ExecutionRegistry] Execução bloqueada: ${executionId}`, {
      extra: {
        entity: 'ExecutionRegistry',
        acao: 'registerBlock',
        executionId,
        reason,
        duration,
      },
    });
  }

  /**
   * Obtém registro por ID
   */
  getRecord(executionId: string): ExecutionRecord | undefined {
    return this.records.get(executionId);
  }

  /**
   * Obtém todos os registros
   */
  getAllRecords(): ExecutionRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Limpa registros antigos (manter últimos 1000)
   */
  cleanupOldRecords(): void {
    if (this.records.size <= 1000) {
      return;
    }

    const sorted = Array.from(this.records.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const toDelete = sorted.slice(0, sorted.length - 1000);
    
    for (const record of toDelete) {
      this.records.delete(record.id);
    }

    logInfo(`[ExecutionRegistry] Limpos ${toDelete.length} registros antigos`, {
      extra: {
        entity: 'ExecutionRegistry',
        acao: 'cleanupOldRecords',
        deletedCount: toDelete.length,
        remainingCount: this.records.size,
      },
    });
  }

  /**
   * Desabilita registry (apenas para testes)
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Habilita registry
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Gera ID único
   */
  private generateId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Instância singleton
 */
export const executionRegistry = ExecutionRegistry.getInstance();

/**
 * Wrapper para executar função com registro automático
 * Garante que execução seja registrada do início ao fim
 */
export async function withExecutionRegistry<T>(
  context: ExecutionContext,
  fn: () => Promise<T>
): Promise<T> {
  const executionId = executionRegistry.registerStart(context);
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    executionRegistry.registerComplete(executionId, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    executionRegistry.registerFailure(executionId, errorMessage, duration);
    throw error;
  }
}

/**
 * Wrapper síncrono para executar função com registro automático
 */
export function withExecutionRegistrySync<T>(
  context: ExecutionContext,
  fn: () => T
): T {
  const executionId = executionRegistry.registerStart(context);
  const startTime = Date.now();

  try {
    const result = fn();
    const duration = Date.now() - startTime;
    executionRegistry.registerComplete(executionId, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    executionRegistry.registerFailure(executionId, errorMessage, duration);
    throw error;
  }
}

/**
 * Verifica se execução está registrada
 * Lança erro se não estiver
 */
export function assertExecutionRegistered(executionId: string): void {
  const record = executionRegistry.getRecord(executionId);
  
  if (!record) {
    throw new ValidationError(
      `EXECUTION_NOT_REGISTERED: ID ${executionId} não encontrado no registry. ` +
      `Toda execução deve ser registrada via executionRegistry.registerStart().`
    );
  }
}
