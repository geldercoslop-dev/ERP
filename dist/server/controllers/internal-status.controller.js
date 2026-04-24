/**
 * Internal Status Endpoint Controller
 *
 * GET /internal/status
 *
 * Retorna informações detalhadas do sistema para debug/monitoring
 * PROTEGIDO: Requer token interno ou whoami internal
 */
import { createLogger } from '../infra/structured-logger.js';
import { globalErrorRateMonitor } from '../resilience/error-rate-monitor.js';
import { CircuitBreakerManager } from '../infra/circuit-breaker.js';
import { getPoolStatsSnapshot } from '../config/database.js';
const logger = createLogger('internal-status');
/**
 * GET /internal/status
 *
 * Retorna status completo do sistema:
 * - Uptime
 * - Memória
 * - Bancos de dados
 * - Circuit breakers
 * - Taxa de erros
 */
export async function getInternalStatus(req, res) {
    const startTime = Date.now();
    try {
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();
        const poolStats = getPoolStatsSnapshot();
        const circuitBreakerStats = CircuitBreakerManager.listCircuitBreakers();
        const errorRateStatus = globalErrorRateMonitor.getStatus();
        const status = {
            status: 'operational',
            timestamp: new Date().toISOString(),
            uptime: {
                seconds: Math.round(uptime),
                minutes: Math.round(uptime / 60),
                hours: Math.round(uptime / 3600),
            },
            system: {
                memory: {
                    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
                    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
                    heapPercentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
                },
                node: {
                    version: process.version,
                    platform: process.platform,
                    architecture: process.arch,
                    pid: process.pid,
                },
            },
            database: {
                pool: {
                    total: poolStats.total,
                    free: poolStats.free,
                    used: poolStats.used,
                    queued: poolStats.queued,
                    utilization: poolStats.total > 0
                        ? Math.round((poolStats.used / poolStats.total) * 100)
                        : 0,
                },
                health: {
                    lastOk: poolStats.lastHealthOk,
                    lastCheckAt: new Date(poolStats.lastHealthAt).toISOString(),
                },
            },
            circuitBreakers: circuitBreakerStats,
            errorRate: errorRateStatus,
            responseTime: `${Date.now() - startTime}ms`,
        };
        logger.info('/internal/status accessed', {
            metadata: {
                context: 'INTERNAL_STATUS',
                uptime: status.uptime.hours,
                memoryHeapPercent: status.system.memory.heapPercentage,
                dbConnUsed: poolStats.used,
                errorRateAlerting: errorRateStatus.isAlerting,
            },
        });
        res.status(200).json(status);
    }
    catch (error) {
        logger.error('Error generating internal status', error, {
            metadata: {
                context: 'INTERNAL_STATUS_ERROR',
            },
        });
        res.status(500).json({
            status: 'error',
            message: 'Failed to generate status',
            timestamp: new Date().toISOString(),
        });
    }
}
/**
 * Middleware para proteger endpoint (admin-only ou token interno)
 *
 * Aceita:
 * 1. Header: Authorization: Bearer <INTERNAL_API_TOKEN>
 * 2. Query param: ?token=<INTERNAL_API_TOKEN>
 * 3. Usuário com role 'admin'
 */
export function internalStatusAuthGuard(req, res, next) {
    const requiredToken = process.env.INTERNAL_API_TOKEN?.trim();
    if (!requiredToken) {
        logger.error('INTERNAL_API_TOKEN ausente - internal/status bloqueado', undefined, {
            metadata: {
                context: 'AUTH_GUARD',
                ip: req.ip,
            },
        });
        res.status(503).json({
            error: 'Service Unavailable',
            message: 'Internal endpoint misconfigured',
        });
        return;
    }
    // Extrai token de diferentes fontes
    const bearerToken = req.get('Authorization')?.replace('Bearer ', '').trim();
    const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : undefined;
    const incomingToken = bearerToken || queryToken;
    // Valida token
    if (incomingToken !== requiredToken) {
        logger.warn('Unauthorized access to /internal/status', {
            metadata: {
                context: 'AUTH_GUARD',
                ip: req.ip,
                tokenProvided: !!incomingToken,
            },
        });
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing authentication token',
        });
        return;
    }
    next();
}
/**
 * Health check simplificado (sem detalhes sensíveis)
 * Para ser exposição pública
 */
export function getPublicHealth(req, res) {
    const memUsage = process.memoryUsage();
    const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    res.status(200).json({
        status: heapPercent < 90 ? 'healthy' : 'degraded',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
    });
}
