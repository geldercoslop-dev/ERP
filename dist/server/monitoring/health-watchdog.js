/**
 * Health Watchdog - Detecção de travamento silencioso
 *
 * Funções:
 * - Detectar quando DB/Redis param de responder
 * - Monitorar health endpoints internos
 * - Auto-restart opcional via ENABLE_AUTO_RESTART
 * - Logs de alerta e recuperação
 */
class HealthWatchdog {
    isRunning = false;
    healthStatus = {
        db: false,
        redis: false,
        http: false,
        lastCheck: Date.now()
    };
    alerts = [];
    intervalId;
    lastStatusLineAt = 0;
    lastFailLogAt = { db: 0, redis: 0, http: 0 };
    lastOkLogAt = { db: 0, redis: 0, http: 0 };
    // Configurações
    CHECK_INTERVAL = 10 * 1000; // 10 segundos (mínimo)
    DB_TIMEOUT = 5000; // 5 segundos
    REDIS_TIMEOUT = 3000; // 3 segundos
    HTTP_TIMEOUT = 3000; // 3 segundos
    MAX_ALERTS = 100; // Limitar buffer de alertas
    FAIL_LOG_COOLDOWN_MS = 60 * 1000; // evitar flood em falhas repetidas
    OK_LOG_COOLDOWN_MS = 60 * 1000; // evitar flood em "OK" repetido
    STATUS_LINE_EVERY_MS = 5 * 60 * 1000; // linha-resumo ocasional
    constructor() {
        this.log('[HEALTH_WATCHDOG] Inicializado');
    }
    start() {
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
    stop() {
        if (!this.isRunning)
            return;
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.log('[HEALTH_WATCHDOG] Parado');
    }
    async performHealthCheck() {
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
        }
        catch (error) {
            this.logOneLine('[HEALTH_CHECK] erro inesperado', error instanceof Error ? error.message : String(error));
        }
    }
    async checkDatabase() {
        try {
            const pool = globalThis.db;
            if (!pool) {
                return false;
            }
            // Teste simples de conexão
            return await Promise.race([
                pool.query('SELECT 1 as test').then(() => true),
                new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), this.DB_TIMEOUT))
            ]);
        }
        catch (error) {
            this.log('[HEALTH_CHECK] DB erro:', error instanceof Error ? error.message : error);
            return false;
        }
    }
    async checkRedis() {
        try {
            const client = globalThis.redis;
            if (!client) {
                return false;
            }
            // Teste de ping
            return await Promise.race([
                client.ping().then(() => true),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), this.REDIS_TIMEOUT))
            ]);
        }
        catch (error) {
            this.log('[HEALTH_CHECK] Redis erro:', error instanceof Error ? error.message : error);
            return false;
        }
    }
    async checkHttpHealth() {
        try {
            // Verificar se o servidor HTTP está respondendo (endpoint padrão e leve)
            const response = await Promise.race([
                fetch(`http://127.0.0.1:${global.SERVER_PORT || 3000}/api/health`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(this.HTTP_TIMEOUT),
                }).then((res) => res.ok),
                new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP timeout')), this.HTTP_TIMEOUT))
            ]);
            return response;
        }
        catch (error) {
            this.maybeLogComponentFail('http', error);
            return false;
        }
    }
    detectHealthChanges(prevStatus) {
        // Detectar falhas
        if (!prevStatus.db && this.healthStatus.db) {
            this.addAlert('recovery', { component: 'db' });
            this.maybeLogComponentOk('db');
        }
        else if (prevStatus.db && !this.healthStatus.db) {
            this.addAlert('db_timeout', { component: 'db' });
            this.maybeLogComponentFail('db');
        }
        if (!prevStatus.redis && this.healthStatus.redis) {
            this.addAlert('recovery', { component: 'redis' });
            this.maybeLogComponentOk('redis');
        }
        else if (prevStatus.redis && !this.healthStatus.redis) {
            this.addAlert('redis_timeout', { component: 'redis' });
            this.maybeLogComponentFail('redis');
        }
        if (!prevStatus.http && this.healthStatus.http) {
            this.addAlert('recovery', { component: 'http' });
            this.maybeLogComponentOk('http');
        }
        else if (prevStatus.http && !this.healthStatus.http) {
            this.addAlert('health_down', { component: 'http' });
            this.maybeLogComponentFail('http');
        }
    }
    isSystemCritical() {
        // Sistema crítico se mais de um componente falhar
        const failures = [
            !this.healthStatus.db,
            !this.healthStatus.redis,
            !this.healthStatus.http
        ].filter(Boolean).length;
        return failures >= 2;
    }
    handleAutoRestart() {
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
    addAlert(type, details) {
        const alert = {
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
    getHealthStatus() {
        return { ...this.healthStatus };
    }
    getRecentAlerts(limit = 10) {
        return this.alerts.slice(-limit);
    }
    log(...args) {
        console.log(`[${new Date().toISOString()}]`, ...args);
    }
    logOneLine(prefix, msg) {
        if (msg && msg.trim())
            this.log(`${prefix}: ${msg}`);
        else
            this.log(prefix);
    }
    maybeLogStatusLine(durationMs) {
        const now = Date.now();
        if (now - this.lastStatusLineAt < this.STATUS_LINE_EVERY_MS)
            return;
        this.lastStatusLineAt = now;
        this.logOneLine('[HEALTH]', `DB:${this.healthStatus.db ? 'OK' : 'FAIL'} Redis:${this.healthStatus.redis ? 'OK' : 'FAIL'} HTTP:${this.healthStatus.http ? 'OK' : 'FAIL'} (${durationMs}ms)`);
    }
    maybeLogComponentFail(component, err) {
        const now = Date.now();
        if (now - this.lastFailLogAt[component] < this.FAIL_LOG_COOLDOWN_MS)
            return;
        this.lastFailLogAt[component] = now;
        const msg = err instanceof Error ? err.message : err != null ? String(err) : undefined;
        this.logOneLine(`[HEALTH_FAIL] ${component.toUpperCase()}`, msg);
    }
    maybeLogComponentOk(component) {
        const now = Date.now();
        if (now - this.lastOkLogAt[component] < this.OK_LOG_COOLDOWN_MS)
            return;
        this.lastOkLogAt[component] = now;
        this.logOneLine(`[HEALTH_OK] ${component.toUpperCase()}`);
    }
}
// Singleton global
let watchdog = null;
export function getHealthWatchdog() {
    if (!watchdog) {
        watchdog = new HealthWatchdog();
    }
    return watchdog;
}
export { HealthWatchdog };
