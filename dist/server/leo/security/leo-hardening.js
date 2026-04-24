/**
 * Sistema de Hardening Final do LEO
 *
 * Implementa logging detalhado, tratamento robusto de erros
 * e monitoramento avançado do sistema
 */
import { leoLogManager } from '../utils/leo-log-manager.js';
import { join } from 'path';
import { InfrastructureError } from '../../_core/errors/typed-errors.js';
/** Registro de ação LEO (stub; usar import de db quando disponível) */
async function insertLeoActionLog(_params) {
    void _params;
}
import { existsSync } from 'fs';
/**
 * Sistema de logging e hardening do LEO
 */
class LeoHardening {
    static instance;
    config;
    logFile;
    currentFileSize = 0;
    metricsHistory = [];
    errorCounts = new Map();
    circuitBreakers = new Map();
    constructor() {
        this.config = {
            level: 'INFO',
            logToFile: true,
            logToConsole: true,
            logToDatabase: true,
            maxFileSize: 10, // 10MB
            maxFiles: 5,
            logDirectory: join(process.cwd(), 'logs'),
            enableStructuredLogging: true,
            enableStackTrace: true,
            enablePerformanceLogging: true,
        };
        this.initializeLogger();
    }
    static getInstance() {
        if (!LeoHardening.instance) {
            LeoHardening.instance = new LeoHardening();
        }
        return LeoHardening.instance;
    }
    /**
     * Inicializa o sistema de logging
     */
    initializeLogger() {
        try {
            // Configurar handlers de erro do processo
            this.setupErrorHandlers();
            // Iniciar monitoramento de métricas
            this.startMetricsMonitoring();
            console.log('🛡️ Sistema de hardening do Leo inicializado');
        }
        catch (error) {
            console.error('[LeoHardening] Erro ao inicializar logger:', error);
        }
    }
    /**
     * Configura arquivo de log
     */
    setupLogFile() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        this.logFile = join(this.config.logDirectory, `leo-${dateStr}.log`);
        // Verificar tamanho do arquivo atual
        if (existsSync(this.logFile)) {
            const stats = require('fs').statSync(this.logFile);
            this.currentFileSize = stats.size;
        }
    }
    /**
     * Configura handlers de erro do processo
     */
    setupErrorHandlers() {
        /**
         * Shutdown de processo é centralizado em `server/services/system/shutdown.service.ts`
         * (SIGTERM/SIGINT, uncaught, unhandled). LEO apenas registra telemetria — sem `process.exit`.
         */
        process.on('uncaughtException', (error) => {
            this.critical('UNCAUGHT_EXCEPTION', 'Exceção não capturada no processo', {
                error: error?.message ?? String(error),
            });
        });
        process.on('unhandledRejection', (reason, promise) => {
            this.critical('UNHANDLED_REJECTION', 'Promessa rejeitada não tratada', {
                reason: reason instanceof Error ? reason.message : String(reason),
                promise,
            });
        });
        process.on('warning', (warning) => {
            this.warn('NODE_WARNING', 'Warning do Node.js', { warning: warning?.message ?? String(warning) });
        });
    }
    /**
     * Registra log em nível DEBUG
     */
    debug(message, data, traceId) {
        this.log('DEBUG', message, data, traceId);
    }
    /**
     * Registra log em nível INFO
     */
    info(message, data, payload, traceId) {
        this.log('INFO', message, payload ?? data, traceId);
    }
    warn(message, data, payload, traceId) {
        this.log('WARN', message, payload ?? data, traceId);
    }
    error(message, error, data, traceId) {
        this.log('ERROR', message, data, traceId, error);
    }
    critical(message, data, payload, traceId) {
        this.log('CRITICAL', message, payload ?? data, traceId);
    }
    /**
     * Método principal de logging
     */
    log(level, message, data, traceId, error) {
        // Verificar se o nível deve ser logado
        if (!this.shouldLog(level)) {
            return;
        }
        const entry = {
            timestamp: new Date(),
            level,
            module: this.getCallingModule(),
            message,
            data,
            error: typeof error === 'string' ? new Error(error) : error ?? undefined,
            traceId,
        };
        // Log no console
        if (this.config.logToConsole) {
            this.logToConsole(entry);
        }
        // Log em arquivo
        if (this.config.logToFile) {
            this.logToFile(entry);
        }
        // Log no banco de dados
        if (this.config.logToDatabase) {
            this.logToDatabase(entry);
        }
        // Atualizar contadores de erro
        if (level === 'ERROR' || level === 'CRITICAL') {
            this.updateErrorCount(entry.module);
        }
    }
    /**
     * Verifica se o nível deve ser logado
     */
    shouldLog(level) {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
        const currentLevelIndex = levels.indexOf(this.config.level);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= currentLevelIndex;
    }
    /**
     * Obtém o módulo que está chamando o log
     */
    getCallingModule() {
        const stack = new Error().stack;
        if (stack) {
            const lines = stack.split('\n');
            if (lines.length >= 4) {
                const callerLine = lines[3];
                const match = callerLine?.match(/at\s+(.+?)\s+\(/);
                if (match?.[1]) {
                    return match[1];
                }
            }
        }
        return 'unknown';
    }
    /**
     * Log no console com formatação
     */
    logToConsole(entry) {
        const timestamp = entry.timestamp.toISOString();
        const prefix = `[${timestamp}] [${entry.level}] [${entry.module}]`;
        let message = `${prefix} ${entry.message}`;
        if (entry.traceId) {
            message += ` [${entry.traceId}]`;
        }
        if (entry.data) {
            message += ` ${JSON.stringify(entry.data)}`;
        }
        if (entry.error && this.config.enableStackTrace) {
            message += `\n${entry.error.stack}`;
        }
        // Usar cores diferentes para cada nível
        switch (entry.level) {
            case 'DEBUG':
                console.log('\x1b[36m%s\x1b[0m', message);
                break;
            case 'INFO':
                console.log('\x1b[32m%s\x1b[0m', message);
                break;
            case 'WARN':
                console.warn('\x1b[33m%s\x1b[0m', message);
                break;
            case 'ERROR':
                console.error('\x1b[31m%s\x1b[0m', message);
                break;
            case 'CRITICAL':
                console.error('\x1b[41m%s\x1b[0m', message);
                break;
            default:
                console.log(message);
        }
    }
    /**
     * Log em arquivo
     */
    logToFile(entry) {
        try {
            // Usar o gerenciador de logs
            leoLogManager.writeLog(entry);
        }
        catch (error) {
            console.error('[LeoHardening] Erro ao escrever no arquivo de log:', error);
        }
    }
    /**
     * Log no banco de dados
     */
    async logToDatabase(entry) {
        try {
            await insertLeoActionLog({
                usuario: 'leo-hardening',
                acao: 'log_entry',
                entidade: 'leo_hardening',
                dados: JSON.stringify({
                    level: entry.level,
                    module: entry.module,
                    message: entry.message,
                    data: entry.data,
                    traceId: entry.traceId,
                    error: entry.error?.message,
                }),
                resultado: entry.level === 'ERROR' || entry.level === 'CRITICAL' ? 'ERRO' : 'SUCESSO',
            });
        }
        catch (error) {
            console.error('[LeoHardening] Erro ao salvar log no banco:', error);
        }
    }
    /**
     * Formata entrada de log
     */
    formatLogEntry(entry) {
        const timestamp = entry.timestamp.toISOString();
        const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
        const errorStr = entry.error ? ` ${entry.error.stack || entry.error.message}` : '';
        const traceIdStr = entry.traceId ? ` [${entry.traceId}]` : '';
        if (this.config.enableStructuredLogging) {
            return JSON.stringify({
                timestamp,
                level: entry.level,
                module: entry.module,
                message: entry.message,
                data: entry.data,
                traceId: entry.traceId,
                error: entry.error?.stack,
            });
        }
        return `${timestamp} [${entry.level}] [${entry.module}]${traceIdStr} ${entry.message}${dataStr}${errorStr}`;
    }
    /**
     * Rotaciona arquivo de log
     */
    rotateLogFile() {
        try {
            if (!this.logFile)
                return;
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const oldFile = this.logFile;
            this.logFile = join(this.config.logDirectory, `leo-${dateStr}.log`);
            if (existsSync(oldFile)) {
                const oldFileRotated = join(this.config.logDirectory, `leo-${dateStr}-${Date.now()}.log`);
                const { renameSync } = require('fs');
                renameSync(oldFile, oldFileRotated);
            }
            this.currentFileSize = 0;
            this.info('LOG_ROTATION', 'Arquivo de log rotacionado', { oldFile, newFile: this.logFile });
        }
        catch (error) {
            console.error('[LeoHardening] Erro ao rotacionar arquivo de log:', error);
        }
    }
    /**
     * Atualiza contador de erros por módulo
     */
    updateErrorCount(module) {
        const current = this.errorCounts.get(module) || 0;
        this.errorCounts.set(module, current + 1);
    }
    /**
     * Inicia monitoramento de métricas
     */
    startMetricsMonitoring() {
        if (!this.config.enablePerformanceLogging)
            return;
        setInterval(() => {
            this.collectSystemMetrics();
        }, 60000);
    }
    /**
     * Coleta métricas do sistema
     */
    collectSystemMetrics() {
        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const metrics = {
                timestamp: new Date(),
                memory: {
                    used: memUsage.heapUsed,
                    total: memUsage.heapTotal,
                    percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
                },
                cpu: {
                    usage: cpuUsage.user / 1000000,
                    loadAverage: [0, 0, 0],
                },
                disk: {
                    used: 0,
                    total: 0,
                    percentage: 0,
                },
                uptime: process.uptime(),
                activeConnections: 0,
                requestsPerSecond: 0,
                errorsPerSecond: this.calculateErrorsPerSecond(),
            };
            this.metricsHistory.push(metrics);
            if (this.metricsHistory.length > 1000) {
                this.metricsHistory = this.metricsHistory.slice(-1000);
            }
            this.checkPerformanceAlerts(metrics);
        }
        catch (error) {
            this.error('METRICS_ERROR', 'Erro ao coletar métricas', error instanceof Error ? error : undefined);
        }
    }
    /**
     * Calcula erros por segundo
     */
    calculateErrorsPerSecond() {
        const recentMetrics = this.metricsHistory.slice(-10);
        if (recentMetrics.length < 2)
            return 0;
        const first = recentMetrics[0];
        const last = recentMetrics[recentMetrics.length - 1];
        const timeWindow = first && last ? (last.timestamp.getTime() - first.timestamp.getTime()) / 1000 : 0;
        const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
        return timeWindow > 0 ? totalErrors / timeWindow : 0;
    }
    /**
     * Verifica alertas de performance
     */
    checkPerformanceAlerts(metrics) {
        if (metrics.memory.percentage > 85) {
            this.warn('MEMORY_HIGH', 'Uso de memória elevado', {
                percentage: metrics.memory.percentage,
                used: metrics.memory.used,
                total: metrics.memory.total,
            });
        }
        if (metrics.cpu.usage > 80) {
            this.warn('CPU_HIGH', 'Uso de CPU elevado', {
                usage: metrics.cpu.usage,
            });
        }
        if (metrics.errorsPerSecond > 1) {
            this.error('ERROR_RATE_HIGH', undefined, {
                errorsPerSecond: metrics.errorsPerSecond,
                totalErrors: Array.from(this.errorCounts.values()).reduce((s, c) => s + c, 0),
            });
        }
    }
    /**
     * Executa função com tratamento de erro e recuperação
     */
    async executeWithRecovery(operation, operationName, recovery, _traceId) {
        let attempts = 0;
        let lastError = null;
        while (attempts < recovery.maxRetries) {
            try {
                let cb = this.circuitBreakers.get(operationName);
                if (!cb) {
                    cb = { isOpen: false, lastFailure: new Date(), successCount: 0, failureCount: 0 };
                    this.circuitBreakers.set(operationName, cb);
                }
                if (cb.isOpen) {
                    const now = Date.now();
                    if (now - cb.lastFailure.getTime() < recovery.circuitBreakerTimeout) {
                        cb.isOpen = false;
                        cb.successCount = 0;
                        cb.failureCount = 0;
                    }
                    else {
                        throw new InfrastructureError(`Circuit breaker aberto para ${operationName}`);
                    }
                }
                const result = await operation();
                cb.successCount++;
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                attempts++;
                let cb = this.circuitBreakers.get(operationName);
                if (!cb) {
                    cb = { isOpen: false, lastFailure: new Date(), successCount: 0, failureCount: 0 };
                    this.circuitBreakers.set(operationName, cb);
                }
                cb.lastFailure = new Date();
                cb.failureCount++;
                if (cb.failureCount >= recovery.circuitBreakerThreshold) {
                    cb.isOpen = true;
                }
                if (attempts >= recovery.maxRetries) {
                    throw lastError;
                }
                await new Promise((r) => setTimeout(r, recovery.retryDelay * Math.pow(recovery.backoffMultiplier, attempts)));
            }
        }
        throw lastError ?? new Error('executeWithRecovery failed');
    }
    /**
     * Obtém estatísticas de erros
     */
    getErrorStatistics() {
        return Object.fromEntries(this.errorCounts);
    }
    /**
     * Obtém métricas recentes
     */
    getRecentMetrics(limit = 100) {
        return this.metricsHistory.slice(-limit);
    }
    /**
     * Obtém configuração atual
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Atualiza configuração
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.info('CONFIG_UPDATED', 'Configuração atualizada', { newConfig });
    }
    /**
     * Limpa logs antigos
     */
    cleanupOldLogs(maxAge = 7) {
        try {
            const fs = require('fs');
            const files = fs.readdirSync(this.config.logDirectory);
            const cutoff = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
            let deletedCount = 0;
            for (const file of files) {
                if (file.startsWith('leo-') && file.endsWith('.log')) {
                    const filePath = join(this.config.logDirectory, file);
                    const stats = fs.statSync(filePath);
                    if (stats.mtime.getTime() < cutoff) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    }
                }
            }
            this.info('LOGS_CLEANED', `Logs antigos limpos: ${deletedCount} arquivos`, { deletedCount, maxAge });
        }
        catch (error) {
            this.error('LOGS_CLEANUP_ERROR', 'Erro ao limpar logs antigos', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Gera relatório de saúde do sistema
     */
    generateHealthReport() {
        try {
            const recentMetrics = this.metricsHistory.slice(-1)[0];
            if (!recentMetrics) {
                return {
                    timestamp: new Date(),
                    status: 'healthy',
                    metrics: {
                        timestamp: new Date(),
                        memory: { used: 0, total: 0, percentage: 0 },
                        cpu: { usage: 0, loadAverage: [0, 0, 0] },
                        disk: { used: 0, total: 0, percentage: 0 },
                        uptime: process.uptime(),
                        activeConnections: 0,
                        requestsPerSecond: 0,
                        errorsPerSecond: 0,
                    },
                    errors: this.getErrorStatistics(),
                    recommendations: [],
                    uptime: process.uptime(),
                    circuitBreakers: Object.fromEntries(this.circuitBreakers),
                };
            }
            const errorStats = this.getErrorStatistics();
            const circuitBreakerStats = Object.fromEntries(this.circuitBreakers);
            let status = 'healthy';
            const recommendations = [];
            // Verificar saúde do sistema
            if (recentMetrics.memory.percentage > 90) {
                status = 'critical';
                recommendations.push('Uso de memória crítico - considere aumentar recursos ou otimizar');
            }
            else if (recentMetrics.memory.percentage > 75) {
                status = 'warning';
                recommendations.push('Uso de memória elevado - monitore de perto');
            }
            if (recentMetrics.errorsPerSecond > 2) {
                status = 'critical';
                recommendations.push('Taxa de erros muito alta - investigue causas imediatamente');
            }
            else if (recentMetrics.errorsPerSecond > 1) {
                status = 'warning';
                recommendations.push('Taxa de erros elevada - monitore o sistema');
            }
            const openCircuitBreakers = Object.entries(circuitBreakerStats).filter(([_, cb]) => cb.isOpen);
            if (openCircuitBreakers.length > 0) {
                status = 'critical';
                recommendations.push(`${openCircuitBreakers.length} circuit breakers abertos - verifique falhas`);
            }
            return {
                timestamp: new Date(),
                status,
                metrics: recentMetrics,
                errors: errorStats,
                recommendations,
                uptime: process.uptime(),
                circuitBreakers: circuitBreakerStats,
            };
        }
        catch (error) {
            this.error('HEALTH_REPORT_ERROR', 'Erro ao gerar relatório de saúde', error instanceof Error ? error : new Error(String(error)));
            return {
                timestamp: new Date(),
                status: 'critical',
                metrics: {},
                errors: {},
                recommendations: ['Erro ao gerar relatório de saúde'],
                uptime: 0,
                circuitBreakers: {},
            };
        }
    }
}
// Exportar instância singleton
export const leoHardening = LeoHardening.getInstance();
