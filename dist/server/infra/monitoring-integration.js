/**
 * Exemplo de integração do sistema de monitoramento
 *
 * Este arquivo mostra como integrar todos os componentes de monitoramento
 * no servidor Express principal
 */
import { metricsMiddleware, databaseMetricsMiddleware } from './metrics-middleware.js';
import { createLogger } from './structured-logger.js';
import { metrics, recordSystemMetrics } from './metrics.js';
const logger = createLogger('monitoring-integration');
/**
 * Configura middleware de monitoramento no app Express
 */
export function setupMonitoring(app) {
    // 1. Middleware de métricas de database (deve vir antes dos outros)
    app.use(metricsMiddleware);
    app.use(databaseMetricsMiddleware);
    // 2. Endpoint de métricas
    app.get("/metrics", (_req, res) => {
        res.json({
            counters: metrics.getCounters(),
            requests: metrics.getRequestStats(5),
            system: metrics.getCurrentSystemMetrics(),
        });
    });
    logger.info('Sistema de monitoramento configurado', {
        metadata: {
            endpoints: ['/api/health', '/metrics'],
            middleware: ['metricsMiddleware', 'databaseMetricsMiddleware', 'errorTrackingMiddleware'],
        },
    });
}
/**
 * Inicia coleta de métricas do sistema
 */
export function startMetricsCollection(interval = 60000) {
    logger.info('Iniciando coleta de métricas do sistema', {
        metadata: { interval }
    });
    return setInterval(() => {
        try {
            recordSystemMetrics();
            logger.debug('Métricas do sistema coletadas');
        }
        catch (error) {
            logger.error('Erro ao coletar métricas do sistema', error);
        }
    }, interval);
}
/**
 * Função para limpeza de métricas antigas
 */
export function startMetricsCleanup(interval = 300000) {
    logger.info('Iniciando limpeza de métricas antigas', {
        metadata: { interval }
    });
    return setInterval(() => {
        try {
            metrics.clearOldMetrics(60); // Remove métricas mais antigas que 1 hora
            logger.debug('Limpeza de métricas concluída');
        }
        catch (error) {
            logger.error('Erro na limpeza de métricas', error);
        }
    }, interval);
}
/**
 * Exemplo de uso em um service
 */
export class ExampleService {
    logger = createLogger('ExampleService');
    async doSomething(tenantId, data) {
        const startTime = Date.now();
        try {
            // Simula alguma operação
            await new Promise(resolve => setTimeout(resolve, 100));
            const duration = Date.now() - startTime;
            this.logger.info('Operação concluída com sucesso', {
                tenantId,
                duration,
                payload: { dataKeys: Object.keys(data) },
            });
            return { success: true, data };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('Erro na operação', error, {
                tenantId,
                duration,
                payload: data,
            });
            throw error;
        }
    }
}
export function exampleRouteHandler(req, res) {
    const startTime = Date.now();
    const logger = createLogger('example-route');
    try {
        // Simula processamento
        const result = { message: 'Hello World', timestamp: new Date() };
        const duration = Date.now() - startTime;
        const userId = req.user?.id;
        logger.request(req.method, req.path, 200, duration, {
            userId,
            tenantId: req.tenantId,
            requestId: req.requestId,
            metadata: { method: req.method },
        });
        res.json(result);
    }
    catch (error) {
        const duration = Date.now() - startTime;
        const errorUserId = req.user?.id;
        logger.error('Erro na rota', error, {
            metadata: { method: req.method, path: req.path },
            duration,
            userId: errorUserId,
            tenantId: req.tenantId,
        });
        res.status(500).json({ error: 'Internal server error' });
    }
}
