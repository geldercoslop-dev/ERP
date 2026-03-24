/**
 * Frontend Logger - Logging Estruturado para Produção
 *
 * Features:
 * - Diferentes níveis (error, warn, info, debug)
 * - RequestId automático para rastreamento
 * - Formatação estruturada
 * - Pronto para integração com Sentry/LogRocket/etc
 * - Type-safe
 * - Sem impacto em produção (configurável)
 */

import { isDevelopment, LOG_CONFIG } from '@/config/app';
import type { AppError } from '@/types/error';

/** Níveis de log */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Estrutura de um log */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  error?: Error | AppError | null;
  componentStack?: string;
  requestId?: string;
  userId?: string;
  context?: Record<string, unknown>;
  tags?: string[];
  userAgent?: string;
  url?: string;
}

/**
 * FrontendLogger - Centralized logging para frontend
 */
class FrontendLogger {
  private logs: LogEntry[] = [];
  private readonly maxLogs = LOG_CONFIG.maxLogs;
  private requestIdStack: string[] = [];

  /**
   * Obter RequestId atual (do stack)
   */
  getCurrentRequestId(): string | undefined {
    return this.requestIdStack[this.requestIdStack.length - 1];
  }

  /**
   * Push RequestId para o stack
   */
  pushRequestId(requestId: string): void {
    this.requestIdStack.push(requestId);
  }

  /**
   * Pop RequestId do stack
   */
  popRequestId(): void {
    this.requestIdStack.pop();
  }

  /**
   * Executar função com RequestId
   */
  async withRequestId<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
    this.pushRequestId(requestId);
    try {
      return await fn();
    } finally {
      this.popRequestId();
    }
  }

  /**
   * Adicionar um log estruturado
   */
  private addLog(entry: LogEntry): void {
    // Não logar em produção se desabilitado
    if (!isDevelopment && !LOG_CONFIG.enabled) {
      return;
    }

    const enrichedEntry: LogEntry = {
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
      requestId: entry.requestId || this.getCurrentRequestId(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    };

    // Adicionar ao buffer
    this.logs.push(enrichedEntry);

    // Manter limite máximo
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output
    this.printToConsole(enrichedEntry);
  }

  /**
   * Logar erro
   */
  error(params: {
    message: string;
    error?: Error | AppError | null;
    componentStack?: string;
    requestId?: string;
    context?: Record<string, unknown>;
    tags?: string[];
  }): void {
    this.addLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: params.message,
      error: params.error || null,
      componentStack: params.componentStack,
      requestId: params.requestId,
      context: params.context,
      tags: params.tags,
    });
  }

  /**
   * Logar aviso
   */
  warn(params: {
    message: string;
    context?: Record<string, unknown>;
    requestId?: string;
    tags?: string[];
  }): void {
    this.addLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: params.message,
      context: params.context,
      requestId: params.requestId,
      tags: params.tags,
    });
  }

  /**
   * Logar informação
   */
  info(params: {
    message: string;
    context?: Record<string, unknown>;
    requestId?: string;
    tags?: string[];
  }): void {
    if (!isDevelopment && LOG_CONFIG.level === 'error') return;

    this.addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: params.message,
      context: params.context,
      requestId: params.requestId,
      tags: params.tags,
    });
  }

  /**
   * Logar debug
   */
  debug(params: {
    message: string;
    context?: Record<string, unknown>;
    requestId?: string;
  }): void {
    if (!isDevelopment || LOG_CONFIG.level !== 'debug') return;

    this.addLog({
      timestamp: new Date().toISOString(),
      level: 'debug',
      message: params.message,
      context: params.context,
      requestId: params.requestId,
    });
  }

  /**
   * Logar requisição HTTP
   */
  logHttpRequest(params: {
    method: string;
    url: string;
    statusCode?: number;
    duration?: number;
    requestId?: string;
    error?: Error | null;
  }): void {
    const level = params.statusCode && params.statusCode >= 400 ? 'warn' : 'info';

    this.addLog({
      timestamp: new Date().toISOString(),
      level,
      message: `HTTP ${params.method} ${params.url}`,
      error: params.error || null,
      requestId: params.requestId,
      context: {
        method: params.method,
        url: params.url,
        statusCode: params.statusCode,
        duration: params.duration,
      },
      tags: ['http'],
    });
  }

  /**
   * Logar ação crítica de negócio
   */
  logCriticalAction(params: {
    action: 'login' | 'logout' | 'delete' | 'submit' | 'export' | string;
    status: 'start' | 'success' | 'error';
    requestId?: string;
    context?: Record<string, unknown>;
    error?: Error | null;
  }): void {
    const level = params.status === 'error' ? 'warn' : 'info';

    this.addLog({
      timestamp: new Date().toISOString(),
      level,
      message: `Action: ${params.action} [${params.status}]`,
      error: params.error || null,
      requestId: params.requestId,
      context: params.context,
      tags: ['action', params.action],
    });
  }

  /**
   * Obter todos os logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Obter logs filtrados
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Obter logs por requestId
   */
  getLogsByRequestId(requestId: string): LogEntry[] {
    return this.logs.filter((log) => log.requestId === requestId);
  }

  /**
   * Limpar logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Exportar logs como JSON
   */
  exportAsJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Enviar logs para servidor (implementar conforme necessário)
   */
  async flushLogs(endpoint?: string): Promise<void> {
    if (!this.logs.length) return;

    try {
      if (endpoint) {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logs: this.logs }),
        });
      }

      this.clearLogs();
    } catch (error) {
      console.error('Failed to flush logs:', error);
    }
  }

  /**
   * Imprimir log no console
   */
  private printToConsole(entry: LogEntry): void {
    if (!isDevelopment) return;

    const colors = {
      error: 'color: #ff6b6b; font-weight: bold;',
      warn: 'color: #ffd93d; font-weight: bold;',
      info: 'color: #6bcf7f; font-weight: bold;',
      debug: 'color: #9b8cff;',
    };

    const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase()}`;
    const requestIdStr = entry.requestId ? ` [${entry.requestId}]` : '';

    console.log(
      `%c${prefix}${requestIdStr}`,
      colors[entry.level],
      entry.message
    );

    if (entry.context && Object.keys(entry.context).length > 0) {
      console.log('  Context:', entry.context);
    }

    if (entry.error) {
      console.log('  Error:', entry.error);
    }

    if (entry.componentStack) {
      console.log('  Component Stack:', entry.componentStack);
    }
  }
}

// Singleton instance
export const frontendLogger = new FrontendLogger();

export default frontendLogger;
