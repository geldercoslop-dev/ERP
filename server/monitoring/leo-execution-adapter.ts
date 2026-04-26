/**
 * Adapter de Observabilidade do LEO
 *
 * Responsabilidades:
 * - Consumir executionRegistry.getAllRecords()
 * - Transformar dados para UI
 * - NÃO modificar dados
 * - NÃO persistir nada
 *
 * Este é um ADAPTER de leitura apenas para observabilidade.
 * Não altera o ExecutionRegistry nem sua estrutura.
 */

import { executionRegistry } from '../leo/runtime/execution-registry.js';
import type { ExecutionRecord } from '../leo/runtime/execution-registry.js';

/**
 * Interface de filtro para consulta de execuções
 */
export interface ExecutionFilter {
  limit?: number;
  status?: 'started' | 'completed' | 'failed' | 'blocked';
  tenantId?: number;
  origin?: string;
  actor?: string;
}

/**
 * Interface de resposta formatada para UI
 */
export interface ExecutionRecordsResponse {
  records: ExecutionRecord[];
  total: number;
  filtered: number;
  summary: {
    started: number;
    completed: number;
    failed: number;
    blocked: number;
  };
}

/**
 * Adapter de Observabilidade do LEO
 *
 * Fornece uma camada de abstração entre o ExecutionRegistry (CORE IMUTÁVEL)
 * e a UI, permitindo transformação de dados sem modificar o core.
 */
export class LeoExecutionAdapter {
  /**
   * Obtém registros de execução com filtros opcionais
   *
   * @param filter - Filtros opcionais para consulta
   * @returns Registros formatados para UI
   */
  getExecutionRecords(filter: ExecutionFilter = {}): ExecutionRecordsResponse {
    const allRecords = executionRegistry.getAllRecords();
    let filtered = allRecords;

    // Aplicar filtros
    if (filter.status) {
      filtered = filtered.filter(r => r.status === filter.status);
    }

    if (filter.tenantId) {
      filtered = filtered.filter(r => r.tenantId === filter.tenantId);
    }

    if (filter.origin) {
      filtered = filtered.filter(r => r.origin === filter.origin);
    }

    if (filter.actor) {
      filtered = filtered.filter(r => r.actor === filter.actor);
    }

    // Aplicar limite (últimos N registros)
    const limit = filter.limit || 50;
    const limited = filtered.slice(-limit);

    // Calcular resumo
    const summary = {
      started: allRecords.filter(r => r.status === 'started').length,
      completed: allRecords.filter(r => r.status === 'completed').length,
      failed: allRecords.filter(r => r.status === 'failed').length,
      blocked: allRecords.filter(r => r.status === 'blocked').length,
    };

    return {
      records: limited,
      total: allRecords.length,
      filtered: filtered.length,
      summary,
    };
  }

  /**
   * Obtém estatísticas agregadas de execuções
   *
   * @returns Estatísticas agregadas
   */
  getExecutionStats() {
    const allRecords = executionRegistry.getAllRecords();

    const byStatus = {
      started: allRecords.filter(r => r.status === 'started').length,
      completed: allRecords.filter(r => r.status === 'completed').length,
      failed: allRecords.filter(r => r.status === 'failed').length,
      blocked: allRecords.filter(r => r.status === 'blocked').length,
    };

    const byOrigin = allRecords.reduce((acc, record) => {
      acc[record.origin] = (acc[record.origin] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byActor = allRecords.reduce((acc, record) => {
      acc[record.actor] = (acc[record.actor] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byTenant = allRecords.reduce((acc, record) => {
      acc[record.tenantId] = (acc[record.tenantId] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Calcular duração média (apenas para execuções completadas)
    const completedRecords = allRecords.filter(r => r.status === 'completed' && r.duration);
    const avgDuration = completedRecords.length > 0
      ? completedRecords.reduce((sum, r) => sum + (r.duration || 0), 0) / completedRecords.length
      : 0;

    return {
      total: allRecords.length,
      byStatus,
      byOrigin,
      byActor,
      byTenant,
      avgDuration: Math.round(avgDuration),
    };
  }

  /**
   * Obtém um registro específico por ID
   *
   * @param executionId - ID da execução
   * @returns Registro ou undefined se não encontrado
   */
  getExecutionById(executionId: string): ExecutionRecord | undefined {
    return executionRegistry.getRecord(executionId);
  }
}

/**
 * Instância singleton do adapter
 */
export const leoExecutionAdapter = new LeoExecutionAdapter();
