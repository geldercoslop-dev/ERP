/**
 * Middleware para prevenir travamentos por operações longas
 *
 * Monitora e cancela operações que demoram mais de 10 segundos
 */
import { createLogger } from '../infra/structured-logger.js';
import { isHealthProbePath } from '../_core/health-probe-paths.js';
const logger = createLogger('timeout-guard');
// Tempo máximo de execução em ms (10 segundos)
const MAX_EXECUTION_TIME = 10000;
/**
 * Middleware para prevenir travamentos
 */
export function timeoutGuardMiddleware() {
    return (req, res, next) => {
        const pathOnly = req.path || req.url || "";
        if (isHealthProbePath(pathOnly)) {
            return next();
        }
        // Criar controller para abortar operação
        const abortController = new AbortController();
        const { signal } = abortController;
        // Adicionar signal ao request para uso nos serviços
        const requestWithAbort = req;
        requestWithAbort.abortSignal = signal;
        // Configurar timeout
        const timeoutId = setTimeout(() => {
            // Abortar operação
            abortController.abort();
            // Calcular tempo decorrido
            const startTime = req.startTime || Date.now();
            const elapsedTime = Date.now() - startTime;
            // Registrar log de timeout
            logger.error(`Operação abortada por timeout após ${elapsedTime}ms`, {
                requestId: req.requestId,
                tenantId: extractTenantId(req),
                method: req.method,
                path: req.path,
                duration: elapsedTime,
                threshold: MAX_EXECUTION_TIME,
                metadata: {
                    query: req.query,
                    params: req.params,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                }
            });
            // Se a resposta ainda não foi enviada, enviar erro 503
            if (!res.headersSent) {
                res.status(503).json({
                    error: 'Operação cancelada por timeout',
                    message: 'A operação demorou mais que o limite permitido',
                    timeout: MAX_EXECUTION_TIME,
                    path: req.path
                });
            }
        }, MAX_EXECUTION_TIME);
        // Limpar timeout quando a resposta for enviada
        res.on('finish', () => {
            clearTimeout(timeoutId);
        });
        // Continuar para o próximo middleware
        next();
    };
}
/**
 * Wrapper para funções assíncronas com timeout
 */
export function withTimeout(fn, timeoutMs = MAX_EXECUTION_TIME, operationName = 'operation') {
    return new Promise((resolve, reject) => {
        // Criar timeout
        const timeoutId = setTimeout(() => {
            reject(new TimeoutError(operationName, timeoutMs));
        }, timeoutMs);
        // Executar função
        fn().then(result => {
            clearTimeout(timeoutId);
            resolve(result);
        }, error => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
}
/**
 * Verifica se um erro é de timeout
 */
export function isTimeoutError(error) {
    return error instanceof TimeoutError;
}
class TimeoutError extends Error {
    isTimeout = true;
    operationName;
    timeoutMs;
    constructor(operationName, timeoutMs) {
        super(`Timeout: ${operationName} excedeu ${timeoutMs}ms`);
        this.name = "TimeoutError";
        this.operationName = operationName;
        this.timeoutMs = timeoutMs;
    }
}
function extractTenantId(req) {
    // SECURITY: tenantId must come from JWT only
    const reqWithTenant = req;
    const requestTenantId = Number(reqWithTenant.tenantId);
    if (Number.isFinite(requestTenantId) && requestTenantId > 0) {
        return requestTenantId;
    }
    const userTenantId = Number(reqWithTenant.user?.tenantId);
    if (Number.isFinite(userTenantId) && userTenantId > 0) {
        return userTenantId;
    }
    return undefined;
}
export default {
    timeoutGuardMiddleware,
    withTimeout,
    isTimeoutError
};
