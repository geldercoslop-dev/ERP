/**
 * ⚠️ CORE IMUTÁVEL - EXECUTION CONTRACT LAYER
 * 
 * Este arquivo é parte do CORE DE EXECUÇÃO DO LEO e é IMUTÁVEL.
 * Veja CORE_IMMUTABLE.md para detalhes.
 * 
 * PRINCÍPIO ABSOLUTO:
 * - TODA execução deve ter origem validada
 * - Se origem não for ExecutionGate → BLOQUEIO IMEDIATO
 * - NÃO existe bypass desta validação
 * 
 * ARQUITETURA:
 * ExecutionContractLayer → valida origem → permite execução
 * 
 * ⚠️ AVISO: Alterações estruturais neste arquivo requerem justificativa de segurança.
 * Consulte CORE_IMMUTABLE.md antes de modificar.
 */

import { ValidationError } from '../../_core/errors/typed-errors.js';
import { logError } from '../../_core/logger.js';

/**
 * Origens de execução permitidas
 */
export type ExecutionOrigin = 
  | 'execution-gate'      // ÚNICA origem válida para execução
  | 'bootstrap'          // Inicialização do sistema
  | 'test'               // Testes automatizados
  | 'migration'          // Migrations de banco de dados
  | 'health-check'       // Health checks do sistema
  | 'internal-worker'    // Workers internos do sistema
  | 'scheduler-trigger'; // Scheduler apenas como trigger (não executa lógica)

/**
 * Contexto de execução
 */
export interface ExecutionContext {
  origin: ExecutionOrigin;
  actor: string;
  tenantId: number;
  entrypoint: string;
  timestamp: Date;
  traceId?: string;
}

/**
 * Estado global de execução
 */
declare global {
  var __EXECUTION_CONTEXT__: ExecutionContext | null;
  var __EXECUTION_ORIGIN_STACK__: ExecutionOrigin[];
}

// Inicializar estado global
if (typeof globalThis.__EXECUTION_CONTEXT__ === 'undefined') {
  globalThis.__EXECUTION_CONTEXT__ = null;
  globalThis.__EXECUTION_ORIGIN_STACK__ = [];
}

/**
 * VALIDAÇÃO DE ORIGEM DE EXECUÇÃO
 * 
 * Esta função deve ser chamada em TODOS os pontos críticos do sistema
 * Se origem não for válida → BLOQUEIO IMEDIATO
 */
export function assertExecutionOrigin(
  allowedOrigins: ExecutionOrigin[],
  caller: string
): void {
  const currentOrigin = globalThis.__EXECUTION_ORIGIN_STACK__.at(-1);
  
  if (!currentOrigin) {
    const error = new ValidationError(
      `EXECUTION_ORIGIN_MISSING: ${caller} - Nenhuma origem de execução definida. ` +
      `Toda execução deve passar por ExecutionContractLayer.markExecutionOrigin().`
    );
    logError(`[ExecutionContractLayer] ${error.message}`, {
      extra: {
        entity: 'ExecutionContractLayer',
        acao: 'assertExecutionOrigin',
        caller,
        allowedOrigins,
      },
    });
    throw error;
  }
  
  if (!allowedOrigins.includes(currentOrigin)) {
    const error = new ValidationError(
      `EXECUTION_ORIGIN_INVALID: ${caller} - Origem '${currentOrigin}' não permitida. ` +
      `Origens permitidas: ${allowedOrigins.join(', ')}. ` +
      `VIOLAÇÃO CRÍTICA: Execução fora do ExecutionGate.`
    );
    logError(`[ExecutionContractLayer] ${error.message}`, {
      extra: {
        entity: 'ExecutionContractLayer',
        acao: 'assertExecutionOrigin',
        caller,
        currentOrigin,
        allowedOrigins,
      },
    });
    throw error;
  }
}

/**
 * Marca início de execução com origem específica
 * 
 * Deve ser chamado no início de qualquer fluxo de execução
 */
export function markExecutionOrigin(origin: ExecutionOrigin, context: Partial<ExecutionContext>): void {
  const executionContext: ExecutionContext = {
    origin,
    actor: context.actor || 'unknown',
    tenantId: context.tenantId || 0,
    entrypoint: context.entrypoint || 'unknown',
    timestamp: new Date(),
    traceId: context.traceId,
  };
  
  globalThis.__EXECUTION_CONTEXT__ = executionContext;
  globalThis.__EXECUTION_ORIGIN_STACK__.push(origin);
}

/**
 * Limpa origem de execução (deve ser chamado ao final do fluxo)
 */
export function clearExecutionOrigin(): void {
  globalThis.__EXECUTION_ORIGIN_STACK__.pop();
  if (globalThis.__EXECUTION_ORIGIN_STACK__.length === 0) {
    globalThis.__EXECUTION_CONTEXT__ = null;
  }
}

/**
 * Obtém contexto de execução atual
 */
export function getExecutionContext(): ExecutionContext | null {
  return globalThis.__EXECUTION_CONTEXT__;
}

/**
 * Verifica se está executando via ExecutionGate
 */
export function isExecutionGateOrigin(): boolean {
  return globalThis.__EXECUTION_ORIGIN_STACK__.at(-1) === 'execution-gate';
}

/**
 * Verifica se está executando via scheduler trigger
 */
export function isSchedulerTriggerOrigin(): boolean {
  return globalThis.__EXECUTION_ORIGIN_STACK__.at(-1) === 'scheduler-trigger';
}

/**
 * Wrapper para executar função com origem marcada
 * Garante que clearExecutionOrigin seja chamado mesmo em caso de erro
 */
export async function withExecutionOrigin<T>(
  origin: ExecutionOrigin,
  context: Partial<ExecutionContext>,
  fn: () => Promise<T>
): Promise<T> {
  markExecutionOrigin(origin, context);
  try {
    return await fn();
  } finally {
    clearExecutionOrigin();
  }
}

/**
 * Wrapper síncrono para executar função com origem marcada
 */
export function withExecutionOriginSync<T>(
  origin: ExecutionOrigin,
  context: Partial<ExecutionContext>,
  fn: () => T
): T {
  markExecutionOrigin(origin, context);
  try {
    return fn();
  } finally {
    clearExecutionOrigin();
  }
}
