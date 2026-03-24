/**
 * Core Logger Types & Interfaces
 * 
 * Módulo neutro que contém definições de tipos compartilhadas
 * entre structured-logger.ts e error-tracking.ts.
 * 
 * Propósito: Quebrar circular dependency
 * - Nenhuma implementação aqui (só tipos)
 * - Pode ser importado por qualquer módulo de infra sem riscos
 */

export interface LogContext {
  timestamp?: string;
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message?: string;
  module?: string;
  function?: string;
  userId?: number;
  tenantId?: number;
  requestId?: string;
  traceId?: string;
  duration?: number;
  success?: boolean;
  payload?: Record<string, unknown>;
  status?: string;
  query?: string;
  delay?: number;
  size?: number;
  errorKey?: string;
  severity?: string;
  name?: string;
  operation?: string;
  activeRequests?: number;
  state?: string;
  nextAttemptTime?: number | string;
  count?: number;
  method?: string;
  path?: string;
  url?: string;
  ip?: string;
  threshold?: number;
  totalCount?: number;
  recentCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  maxConcurrent?: number;
  queueSize?: number;
  maxQueueSize?: number;
  failureCount?: number;
  failureThreshold?: number;
  errorMessage?: string;
  error?: string | { message: string; stack?: string };
  metadata?: Record<string, unknown>;
  paramsCount?: number;
  hasQuery?: boolean;
  [key: string]: unknown;
}

export interface ErrorContext {
  route?: string;
  method?: string;
  path?: string;
  payload?: any;
  userId?: number;
  tenantId?: number;
  requestId?: string;
  duration?: number;
  userAgent?: string;
  ip?: string;
}

/**
 * Interface para logger estruturado
 * Implementado em structured-logger.ts
 */
export interface IStructuredLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}
