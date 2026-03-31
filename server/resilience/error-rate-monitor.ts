/**
 * Error Rate Monitor - Alerta simples para taxa alta de erros
 * 
 * Conta erros por minuto e loga ALERTA se exceder limiar
 * Sem integração externa (simples e leve)
 */

import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('error-rate-monitor');

export interface ErrorRateConfig {
  windowMs?: number; // Janela de tempo (default 60s)
  maxErrorsPerWindow?: number; // Max erros antes de alerta (default 10)
}

export class ErrorRateMonitor {
  private errorCounts: number[] = []; // Stack de timestamps de erros
  private readonly windowMs: number;
  private readonly maxErrorsPerWindow: number;
  private isAlerting = false;

  constructor(config: ErrorRateConfig = {}) {
    this.windowMs = config.windowMs ?? 60_000; // 1 minuto padrão
    this.maxErrorsPerWindow = config.maxErrorsPerWindow ?? 10; // Você recebe 10+ erros/min = alerta
  }

  /**
   * Registra um erro
   */
  recordError(): void {
    const now = Date.now();
    this.errorCounts.push(now);

    // Remove erros fora da janela de tempo
    this.errorCounts = this.errorCounts.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    // Verifica se ultrapassou limiar
    const currentCount = this.errorCounts.length;
    if (currentCount > this.maxErrorsPerWindow && !this.isAlerting) {
      this.triggerAlert(currentCount);
    } else if (currentCount <= this.maxErrorsPerWindow && this.isAlerting) {
      this.clearAlert();
    }
  }

  /**
   * Dispara alerta (só loga uma vez até voltar ao normal)
   */
  private triggerAlert(errorCount: number): void {
    this.isAlerting = true;
    logger.error('🚨 HIGH ERROR RATE DETECTED', {
      metadata: {
        errorCount,
        threshold: this.maxErrorsPerWindow,
        windowMs: this.windowMs,
        windowSeconds: Math.round(this.windowMs / 1000),
        context: 'ALERT',
        severity: 'CRITICAL',
      },
    });
  }

  /**
   * Limpa alerta (volta ao normal)
   */
  private clearAlert(): void {
    this.isAlerting = false;
    logger.info('Error rate returned to normal', {
      metadata: {
        context: 'ALERT_CLEARED',
        threshold: this.maxErrorsPerWindow,
      },
    });
  }

  /**
   * Retorna status atual
   */
  getStatus() {
    const now = Date.now();
    const recentErrors = this.errorCounts.filter(
      (timestamp) => now - timestamp < this.windowMs
    ).length;

    return {
      isAlerting: this.isAlerting,
      recentErrorCount: recentErrors,
      threshold: this.maxErrorsPerWindow,
      windowMs: this.windowMs,
      windowSeconds: Math.round(this.windowMs / 1000),
      errorRate: `${recentErrors}/${Math.round(this.windowMs / 1000)}s`,
    };
  }

  /**
   * Reset para testes
   */
  reset(): void {
    this.errorCounts = [];
    this.isAlerting = false;
  }
}

/**
 * Instância global do monitor (singleton)
 */
export const globalErrorRateMonitor = new ErrorRateMonitor({
  windowMs: 60_000, // 1 minuto
  maxErrorsPerWindow: 10, // Alerta após 10+ erros/min
});
