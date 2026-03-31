/**
 * Tipos Centrais LEO - Estrutura Oficial
 * Tipos de dados vêm de `shared/types` via `../types.ts`; interfaces de sistema ficam aqui.
 */

import type { LeoTask, LeoEvent, LeoAction, LeoDecision, LeoContext, Payload } from "../types.js";

export type { LeoTask, LeoEvent, LeoAction, LeoDecision, LeoContext, Payload };

/**
 * Resultado da execução de tarefa
 */
export interface TaskResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime?: number;
  processedAt: Date;
}

/**
 * Ação LEO executável (handler) - Unidade de execução atômica
 */
export interface LeoActionHandler {
  name: string;
  description?: string;
  execute(context: LeoExecutionContext): Promise<void>;
  validate?(payload: Payload): boolean;
}

/**
 * Contexto de execução LEO (ambiente de runtime) — distinto de LeoContext em `shared/types`
 */
export interface LeoExecutionContext {
  memory: LeoMemory;
  permissions: LeoPermissions;
  events: LeoEventsSystem;
  task: LeoTask;
  traceId: string;
  startTime: number;
}

/**
 * Memória LEO - Sistema de persistência
 */
export interface LeoMemory {
  store(key: string, value: unknown, ttl?: number): Promise<void>;
  retrieve(key: string): Promise<unknown>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  list(pattern?: string): Promise<Array<{ key: string; value: unknown; ttl?: number }>>;
}

/**
 * Permissões LEO - Sistema de controle de acesso
 */
export interface LeoPermissions {
  canExecute(action: string, context: LeoExecutionContext): boolean;
  canAccess(resource: string, userId?: string): boolean;
  checkPermission(permission: string): boolean;
}

/**
 * Sistema de Eventos LEO
 */
export interface LeoEventsSystem {
  emit(event: LeoEvent): Promise<void>;
  on(event: string, handler: (event: LeoEvent) => void): void;
  off(event: string, handler: (event: LeoEvent) => void): void;
  list(filter?: EventFilter): Promise<LeoEvent[]>;
}

/**
 * Filtro de eventos
 */
export interface EventFilter {
  type?: string;
  status?: string;
  assignedTo?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fila de Tarefas LEO
 */
export interface TaskQueue {
  add(task: Omit<LeoTask, 'id' | 'createdAt' | 'attempts' | 'status' | 'processedAt' | 'result' | 'error' | 'executionTime'>): Promise<LeoTask>;
  getNext(): Promise<LeoTask | null>;
  process(): Promise<void>;
  cancel(taskId: string): boolean;
  remove(taskId: string): boolean;
  list(filter?: TaskFilter): Promise<LeoTask[]>;
  stats(): QueueStats;
  start(): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

/**
 * Filtro de tarefas
 */
export interface TaskFilter {
  type?: string;
  status?: string;
  priority?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Estatísticas da fila
 */
export interface QueueStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  avgExecutionTime: number;
  successRate: number;
}

// ============================================================================
// MONITORING & HEALTH
// ============================================================================

/**
 * Métricas do sistema LEO
 */
export interface LeoMetrics {
  tasksProcessed: number;
  tasksFailed: number;
  avgExecutionTime: number;
  memoryUsage: number;
  uptime: number;
  lastActivity: Date;
}

/**
 * Status de saúde do sistema
 */
export interface LeoHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: HealthCheck[];
  metrics: LeoMetrics;
}

/**
 * Verificação de saúde individual
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration: number;
  timestamp: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuração do sistema LEO
 */
export interface LeoConfig {
  enabled: boolean;
  maxConcurrentTasks: number;
  defaultTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  memoryLimit: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  permissions: PermissionConfig;
  monitoring: MonitoringConfig;
}

/**
 * Configuração de permissões
 */
export interface PermissionConfig {
  defaultPermissions: string[];
  adminPermissions: string[];
  userPermissions: string[];
}

/**
 * Configuração de monitoramento
 */
export interface MonitoringConfig {
  enabled: boolean;
  interval: number;
  metricsRetention: number;
  alertThresholds: AlertThresholds;
}

/**
 * Limites para alertas
 */
export interface AlertThresholds {
  taskFailureRate: number;
  avgExecutionTime: number;
  memoryUsage: number;
  queueSize: number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Erro LEO base
 */
export class LeoError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'LeoError';
  }
}

/**
 * Erro de permissão
 */
export class LeoPermissionError extends LeoError {
  constructor(action: string, context?: Record<string, unknown>) {
    super(`Permission denied: ${action}`, 'PERMISSION_DENIED', context);
    this.name = 'LeoPermissionError';
  }
}

/**
 * Erro de timeout
 */
export class LeoTimeoutError extends LeoError {
  constructor(taskId: string, timeout: number) {
    super(`Task timeout: ${taskId} after ${timeout}ms`, 'TIMEOUT', { taskId, timeout });
    this.name = 'LeoTimeoutError';
  }
}

/**
 * Erro de validação
 */
export class LeoValidationError extends LeoError {
  constructor(field: string, value: unknown, expected: string) {
    super(`Validation failed: ${field}`, 'VALIDATION_ERROR', { field, value, expected });
    this.name = 'LeoValidationError';
  }
}
