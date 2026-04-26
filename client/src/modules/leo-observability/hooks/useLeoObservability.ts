/**
 * Hook de Observabilidade do LEO
 *
 * Agrega dados de múltiplas fontes existentes:
 * - useSystemHealth (health check geral do sistema)
 * - leo-admin.system.health (leo-system-monitor)
 * - admin.leoExecution.records (execution-registry via adapter)
 *
 * PRINCÍPIO: read-only, sem duplicação de backend
 */

import { useEffect, useState, useRef } from "react";
import { trpc } from "../../../lib/trpc";
import { useSystemHealth } from "../../../hooks/useSystemHealth";

export interface LeoSystemMonitorData {
  servidor: {
    online: boolean;
    uptime: number;
    memoria: NodeJS.MemoryUsage;
    cpu: {
      uso: number;
      loadAverage: number[];
    };
    disco: {
      total: number;
      livre: number;
      usado: number;
    };
  };
  banco: {
    conectado: boolean;
    tempoResposta: number;
    totalConexoes?: number;
  };
  aplicacao: {
    errosRecentes: number;
    alertasAtivos: number;
    ultimaAtividade: Date;
  };
  timestamp: Date;
}

export interface ExecutionRecord {
  id: string;
  origin: string;
  actor: string;
  tenantId: number;
  entrypoint: string;
  timestamp: string | Date; // Serialized as string from JSON
  traceId?: string;
  duration?: number;
  status: 'started' | 'completed' | 'failed' | 'blocked';
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface LeoObservabilityData {
  systemHealth: ReturnType<typeof useSystemHealth> extends infer T ? T : never;
  leoSystemMonitor: LeoSystemMonitorData | null;
  executionRecords: ExecutionRecord[];
  executionRecordsTotal: number;
  leoSystemMonitorError: string | null;
  executionRecordsError: string | null;
  isFetchingLeo: boolean;
}

const initialState: LeoObservabilityData = {
  systemHealth: {} as any,
  leoSystemMonitor: null,
  executionRecords: [],
  executionRecordsTotal: 0,
  leoSystemMonitorError: null,
  executionRecordsError: null,
  isFetchingLeo: false,
};

export function useLeoObservability(pollIntervalMs = 10000): LeoObservabilityData {
  const systemHealth = useSystemHealth();

  // Use tRPC React Query hooks for automatic fetching and caching
  const leoSystemMonitorQuery = trpc.leoAdmin.system.health.useQuery(undefined, {
    refetchInterval: pollIntervalMs,
  });

  const executionRecordsQuery = trpc.admin.leoExecution.records.useQuery(
    { limit: 50 },
    { refetchInterval: pollIntervalMs }
  );

  // Extract data from queries
  let leoSystemMonitor: LeoSystemMonitorData | null = null;
  let leoSystemMonitorError: string | null = null;

  if (leoSystemMonitorQuery.data) {
    if ('success' in leoSystemMonitorQuery.data && leoSystemMonitorQuery.data.success && 'data' in leoSystemMonitorQuery.data) {
      leoSystemMonitor = leoSystemMonitorQuery.data.data as LeoSystemMonitorData;
    } else if ('success' in leoSystemMonitorQuery.data && !leoSystemMonitorQuery.data.success && 'message' in leoSystemMonitorQuery.data) {
      leoSystemMonitorError = leoSystemMonitorQuery.data.message;
    }
  }

  if (leoSystemMonitorQuery.error && !leoSystemMonitorError) {
    leoSystemMonitorError = leoSystemMonitorQuery.error instanceof Error ? leoSystemMonitorQuery.error.message : 'Erro desconhecido';
  }

  const executionRecords = executionRecordsQuery.data?.records || [];
  const executionRecordsTotal = executionRecordsQuery.data?.total || 0;
  const executionRecordsError = executionRecordsQuery.error
    ? (executionRecordsQuery.error instanceof Error ? executionRecordsQuery.error.message : 'Erro desconhecido')
    : null;

  const isFetchingLeo = leoSystemMonitorQuery.isLoading || executionRecordsQuery.isLoading;

  return {
    systemHealth,
    leoSystemMonitor,
    executionRecords,
    executionRecordsTotal,
    leoSystemMonitorError,
    executionRecordsError,
    isFetchingLeo,
  };
}
