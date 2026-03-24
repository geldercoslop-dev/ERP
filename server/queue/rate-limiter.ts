/**
 * Rate Limiter para Jobs
 * 
 * Controla a quantidade de jobs por minuto e implementa debounce
 * Evita explosão de jobs em eventos repetidos
 */

export interface RateLimitConfig {
  maxJobsPerMinute?: number;
  debounceMs?: number;
  bucketSize?: number;
}

export interface JobRateLimitEntry {
  timestamp: number;
  jobType: string;
  entity?: string;
  entityId?: string;
  payload?: any;
}

/**
 * Rate Limiter com debounce por tipo de job
 */
class JobRateLimiter {
  private static instance: JobRateLimiter;
  private jobCounts: Map<string, number[]> = new Map(); // jobType -> timestamps
  private debounceCache: Map<string, NodeJS.Timeout> = new Map(); // key -> timeout
  private config: Map<string, RateLimitConfig> = new Map(); // jobType -> config

  private constructor() {}

  public static getInstance(): JobRateLimiter {
    if (!JobRateLimiter.instance) {
      JobRateLimiter.instance = new JobRateLimiter();
    }
    return JobRateLimiter.instance;
  }

  /**
   * Configura rate limit para um tipo de job
   */
  public configure(jobType: string, config: RateLimitConfig): void {
    this.config.set(jobType, {
      maxJobsPerMinute: config.maxJobsPerMinute || 60,
      debounceMs: config.debounceMs || 1000,
      bucketSize: config.bucketSize || 100,
    });
  }

  /**
   * Verifica se job pode ser executado (rate limit)
   */
  public canExecute(jobType: string, entity?: string, entityId?: string): boolean {
    const config = this.config.get(jobType);
    if (!config || !config.maxJobsPerMinute) {
      return true; // Sem limite configurado
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000; // 60 segundos

    // Obter timestamps do tipo de job
    let timestamps = this.jobCounts.get(jobType) || [];
    
    // Limpar timestamps antigos
    timestamps = timestamps.filter((timestamp: any) => timestamp > oneMinuteAgo);
    
    // Verificar limite
    if (timestamps.length >= config.maxJobsPerMinute) {
      console.warn(`Rate limit atingido para ${jobType}: ${timestamps.length}/${config.maxJobsPerMinute} jobs/minuto`);
      return false;
    }

    // Adicionar timestamp atual
    timestamps.push(now);
    this.jobCounts.set(jobType, timestamps);

    return true;
  }

  /**
   * Implementa debounce para jobs repetidos
   */
  public debounce(
    jobType: string,
    entity: string | undefined,
    entityId: string | undefined,
    payload: any,
    callback: () => void | Promise<void>
  ): void {
    const config = this.config.get(jobType);
    if (!config || !config.debounceMs) {
      // Sem debounce, executar imediatamente
      callback();
      return;
    }

    // Gerar chave de debounce
    const debounceKey = this.generateDebounceKey(jobType, entity, entityId, payload);
    
    // Limpar timeout anterior se existir
    const existingTimeout = this.debounceCache.get(debounceKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Configurar novo timeout
    const timeout = setTimeout(async () => {
      this.debounceCache.delete(debounceKey);
      try {
        await callback();
      } catch (error) {
        console.error(`Erro executando job debounced ${jobType}:`, error);
      }
    }, config.debounceMs);

    this.debounceCache.set(debounceKey, timeout);
  }

  /**
   * Executa job com rate limit e debounce
   */
  public async executeWithLimits(
    jobType: string,
    entity: string | undefined,
    entityId: string | undefined,
    payload: any,
    callback: () => void | Promise<void>
  ): Promise<boolean> {
    // Verificar rate limit
    if (!this.canExecute(jobType, entity, entityId)) {
      return false;
    }

    // Aplicar debounce
    return new Promise((resolve) => {
      this.debounce(jobType, entity, entityId, payload, async () => {
        try {
          await callback();
          resolve(true);
        } catch (error) {
          console.error(`Erro executando job com limites ${jobType}:`, error);
          resolve(false);
        }
      });
    });
  }

  /**
   * Gera chave única para debounce
   */
  private generateDebounceKey(
    jobType: string,
    entity: string | undefined,
    entityId: string | undefined,
    payload: any
  ): string {
    const parts = [jobType];
    if (entity) parts.push(entity);
    if (entityId) parts.push(entityId);
    
    // Hash do payload se existir (para capturar mudanças nos dados)
    if (payload) {
      const crypto = require('crypto');
      const payloadHash = crypto
        .createHash('md5')
        .update(JSON.stringify(payload))
        .digest('hex')
        .substring(0, 8);
      parts.push(payloadHash);
    }
    
    return parts.join(':');
  }

  /**
   * Obtém estatísticas de rate limit
   */
  public getStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    for (const [jobType, timestamps] of Array.from(this.jobCounts.entries())) {
      const recentTimestamps = timestamps.filter((t: number) => t > oneMinuteAgo);
      const config = this.config.get(jobType);
      
      stats[jobType] = {
        jobsLastMinute: recentTimestamps.length,
        maxJobsPerMinute: config?.maxJobsPerMinute || 'unlimited',
        debounceActiveDebounces: Array.from(this.debounceCache.keys())
          .filter((key: string) => key.startsWith(jobType))
          .length,
        utilizationRate: config?.maxJobsPerMinute 
          ? `${(recentTimestamps.length / config.maxJobsPerMinute * 100).toFixed(1)}%`
          : 'N/A',
      };
    }

    return stats;
  }

  /**
   * Limpa caches antigos
   */
  public cleanup(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Limpar timestamps antigos
    for (const [jobType, timestamps] of Array.from(this.jobCounts.entries())) {
      const filtered = timestamps.filter((t: number) => t > oneMinuteAgo);
      if (filtered.length === 0) {
        this.jobCounts.delete(jobType);
      } else {
        this.jobCounts.set(jobType, filtered);
      }
    }

    console.log(`Rate limper cleanup: ${this.jobCounts.size} tipos ativos, ${this.debounceCache.size} debounces ativos`);
  }
}

// Configurações padrão para diferentes tipos de jobs
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Jobs críticos de negócio - limite alto
  'pedido_create': { maxJobsPerMinute: 30, debounceMs: 500 },
  'estoque_update': { maxJobsPerMinute: 60, debounceMs: 200 },
  'financeiro_update': { maxJobsPerMinute: 20, debounceMs: 1000 },
  
  // Jobs de análise - limite moderado
  'leo_analysis': { maxJobsPerMinute: 10, debounceMs: 2000 },
  'ocr_processing': { maxJobsPerMinute: 5, debounceMs: 5000 },
  
  // Jobs de notificação - limite alto com debounce
  'notifications': { maxJobsPerMinute: 100, debounceMs: 100 },
  
  // Jobs de sistema - limite baixo
  'backup': { maxJobsPerMinute: 2, debounceMs: 30000 },
  'cleanup': { maxJobsPerMinute: 1, debounceMs: 60000 },
  
  // Jobs de automação - limite muito baixo
  'desktop_automation': { maxJobsPerMinute: 3, debounceMs: 10000 },
  'screenshot_capture': { maxJobsPerMinute: 10, debounceMs: 1000 },
  
  // Jobs de relatórios - limite moderado
  'report_generation': { maxJobsPerMinute: 5, debounceMs: 5000 },
};

// Exportar instância singleton
export const jobRateLimiter = JobRateLimiter.getInstance();

// Inicializar configurações padrão
export function initializeRateLimits(): void {
  Object.entries(DEFAULT_RATE_LIMITS).forEach(([jobType, config]) => {
    jobRateLimiter.configure(jobType, config);
  });
  
  // Limpeza periódica (a cada 5 minutos)
  setInterval(() => {
    jobRateLimiter.cleanup();
  }, 5 * 60 * 1000);
  
  console.log('Rate limits inicializados para jobs');
}

// Funções de conveniência
export async function executeJobWithLimits(
  jobType: string,
  entity: string | undefined,
  entityId: string | undefined,
  payload: any,
  callback: () => void | Promise<void>
): Promise<boolean> {
  return jobRateLimiter.executeWithLimits(jobType, entity, entityId, payload, callback);
}

export function getRateLimitStats(): Record<string, any> {
  return jobRateLimiter.getStats();
}
