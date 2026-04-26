/**
 * Health Watchdog - Detecção de travamento silencioso
 * 
 * Funções:
 * - Detectar quando DB/Redis param de responder
 * - Monitorar health endpoints internos
 * - Auto-restart opcional via ENABLE_AUTO_RESTART
 * - Logs de alerta e recuperação
 */

interface HealthStatus {
  db: boolean;
  redis: boolean;
  http: boolean;
  lastCheck: number;
}

interface HealthAlert {
  timestamp: string;
  type: 'db_timeout' | 'redis_timeout' | 'health_down' | 'recovery';
  details: Record<string, unknown>;
}

interface DbLike {
  query(sql: string): Promise<unknown>;
}

interface RedisLike {
  ping(): Promise<string>;
}

class HealthWatchdog {
  private isRunning = false;
  private healthStatus: HealthStatus = {
    db: false,
    redis: false,
    http: false,
    lastCheck: Date.now()
  };
  private alerts: HealthAlert[] = [];
  private intervalId?: NodeJS.Timeout;
  private lastStatusLineAt = 0;
  private lastFailLogAt: { db: number; redis: number; http: number } = { db: 0, redis: 0, http: 0 };
  private lastOkLogAt: { db: number; redis: number; http: number } = { db: 0, redis: 0, http: 0 };
  
  // Configurações
  private readonly CHECK_INTERVAL = 10 * 1000; // 10 segundos (mínimo)
  private readonly DB_TIMEOUT = 5000; // 5 segundos
  private readonly REDIS_TIMEOUT = 3000; // 3 segundos
  private readonly HTTP_TIMEOUT = 3000; // 3 segundos
  private readonly MAX_ALERTS = 100; // Limitar buffer de alertas
  private readonly FAIL_LOG_COOLDOWN_MS = 60 * 1000; // evitar flood em falhas repetidas
  private readonly OK_LOG_COOLDOWN_MS = 60 * 1000; // evitar flood em "OK" repetido
  private readonly STATUS_LINE_EVERY_MS = 5 * 60 * 1000; // linha-resumo ocasional
  
  constructor() {
    this.log('[HEALTH_WATCHDOG] Inicializado');
  }
  
  start(): void {
    if (this.isRunning) {
      this.log('[HEALTH_WATCHDOG] Já está rodando');
      return;
    }
    
    this.isRunning = true;
    this.log('[HEALTH_WATCHDOG] Iniciando monitoramento a cada 10s');
    
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.CHECK_INTERVAL);
    
    // Primeira verificação imediata
    setImmediate(() => this.performHealthCheck());
  }
  
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    this.log('[HEALTH_WATCHDOG] Parado');
  }
  
  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();
    const prevStatus = this.healthStatus;
    
    try {
      // Verificação paralela de todos os componentes
      const [dbOk, redisOk, httpOk] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkHttpHealth()
      ]);
      
      // Atualizar status
      this.healthStatus = {
        db: dbOk.status === 'fulfilled' && dbOk.value,
        redis: redisOk.status === 'fulfilled' && redisOk.value,
        http: httpOk.status === 'fulfilled' && httpOk.value,
        lastCheck: Date.now()
      };
      
      // Detectar mudanças de status
      this.detectHealthChanges(prevStatus);
      
      const duration = Date.now() - startTime;
      this.maybeLogStatusLine(duration);
      
      // Auto-restart se habilitado e sistema crítico
      if (process.env.ENABLE_AUTO_RESTART === '1' && this.isSystemCritical()) {
        this.handleAutoRestart();
      }
      
    } catch (error) {
      this.logOneLine('[HEALTH_CHECK] erro inesperado', error instanceof Error ? error.message : String(error));
    }
  }
  
  private async checkDatabase(): Promise<boolean> {
    try {
      const pool = globalThis.db as DbLike | undefined;
      if (!pool) {
        return false;
      }
      
      // Teste simples de conexão
      return await Promise.race([
        pool.query('SELECT 1 as test').then(() => true),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('DB timeout')), this.DB_TIMEOUT)
        )
      ]);
    } catch (error) {
      this.log('[HEALTH_CHECK] DB erro:', error instanceof Error ? error.message : error);
      return false;
    }
  }
  
  private async checkRedis(): Promise<boolean> {
    try {
      const client = globalThis.redis as RedisLike | undefined;
      if (!client) {
        return false;
      }
      
      // Teste de ping
      return await Promise.race([
        client.ping().then(() => true),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), this.REDIS_TIMEOUT)
        )
      ]);
    } catch (error) {
      this.log('[HEALTH_CHECK] Redis erro:', error instanceof Error ? error.message : error);
      return false;
    }
  }
  
  private async checkHttpHealth(): Promise<boolean> {
    try {
      // Use actual server port from global (handles dynamic port allocation)
      const port = (global as typeof globalThis & { SERVER_PORT?: number }).SERVER_PORT || Number(process.env.PORT) || 3000;

      // Verificar se o servidor HTTP está respondendo (endpoint padrão e leve)
      const response = await Promise.race([
        fetch(`http://127.0.0.1:${port}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(this.HTTP_TIMEOUT),
        }).then((res: Response) => res.ok),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('HTTP timeout')), this.HTTP_TIMEOUT)
        )
      ]);

      return response;
    } catch (error) {
      this.maybeLogComponentFail('http', error);
      return false;
    }
  }
  
  private detectHealthChanges(prevStatus: HealthStatus): void {
    // Detectar falhas
    if (!prevStatus.db && this.healthStatus.db) {
      this.addAlert('recovery', { component: 'db' });
      this.maybeLogComponentOk('db');
    } else if (prevStatus.db && !this.healthStatus.db) {
      this.addAlert('db_timeout', { component: 'db' });
      this.maybeLogComponentFail('db');
    }
    
    if (!prevStatus.redis && this.healthStatus.redis) {
      this.addAlert('recovery', { component: 'redis' });
      this.maybeLogComponentOk('redis');
    } else if (prevStatus.redis && !this.healthStatus.redis) {
      this.addAlert('redis_timeout', { component: 'redis' });
      this.maybeLogComponentFail('redis');
    }
    
    if (!prevStatus.http && this.healthStatus.http) {
      this.addAlert('recovery', { component: 'http' });
      this.maybeLogComponentOk('http');
    } else if (prevStatus.http && !this.healthStatus.http) {
      this.addAlert('health_down', { component: 'http' });
      this.maybeLogComponentFail('http');
    }
  }
  
  private isSystemCritical(): boolean {
    // Sistema crítico se mais de um componente falhar
    const failures = [
      !this.healthStatus.db,
      !this.healthStatus.redis,
      !this.healthStatus.http
    ].filter(Boolean).length;
    
    return failures >= 2;
  }
  
  private handleAutoRestart(): void {
    this.log('[HEALTH_CRITICAL] Sistema em estado crítico - auto-restart ativado');
    
    // Aguardar um pouco para tentar recuperação
    setTimeout(() => {
      if (this.isSystemCritical()) {
        this.log('[HEALTH_CRITICAL] Forçando restart (ENABLE_AUTO_RESTART=1)');
        console.error('[FATAL] Auto-restart forçado por falhas críticas');
        process.exit(1);
      }
    }, 5000);
  }
  
  private addAlert(type: HealthAlert['type'], details: Record<string, unknown>): void {
    const alert: HealthAlert = {
      timestamp: new Date().toISOString(),
      type,
      details
    };
    
    this.alerts.push(alert);
    
    // Limitar buffer de alertas
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS);
    }
  }
  
  getHealthStatus(): HealthStatus {
    return { ...this.healthStatus };
  }
  
  getRecentAlerts(limit = 10): HealthAlert[] {
    return this.alerts.slice(-limit);
  }
  
  private log(...args: unknown[]): void {
    console.log(`[${new Date().toISOString()}]`, ...args);
  }

  private logOneLine(prefix: string, msg?: string): void {
    if (msg && msg.trim()) this.log(`${prefix}: ${msg}`);
    else this.log(prefix);
  }

  private maybeLogStatusLine(durationMs: number): void {
    const now = Date.now();
    if (now - this.lastStatusLineAt < this.STATUS_LINE_EVERY_MS) return;
    this.lastStatusLineAt = now;
    this.logOneLine(
      '[HEALTH]',
      `DB:${this.healthStatus.db ? 'OK' : 'FAIL'} Redis:${this.healthStatus.redis ? 'OK' : 'FAIL'} HTTP:${this.healthStatus.http ? 'OK' : 'FAIL'} (${durationMs}ms)`
    );
  }

  private maybeLogComponentFail(component: 'db' | 'redis' | 'http', err?: unknown): void {
    const now = Date.now();
    if (now - this.lastFailLogAt[component] < this.FAIL_LOG_COOLDOWN_MS) return;
    this.lastFailLogAt[component] = now;
    const msg =
      err instanceof Error ? err.message : err != null ? String(err) : undefined;
    this.logOneLine(`[HEALTH_FAIL] ${component.toUpperCase()}`, msg);
  }

  private maybeLogComponentOk(component: 'db' | 'redis' | 'http'): void {
    const now = Date.now();
    if (now - this.lastOkLogAt[component] < this.OK_LOG_COOLDOWN_MS) return;
    this.lastOkLogAt[component] = now;
    this.logOneLine(`[HEALTH_OK] ${component.toUpperCase()}`);
  }
}

// Singleton global
let watchdog: HealthWatchdog | null = null;

export function getHealthWatchdog(): HealthWatchdog {
  if (!watchdog) {
    watchdog = new HealthWatchdog();
  }
  return watchdog;
}

export { HealthWatchdog, HealthStatus, HealthAlert };
