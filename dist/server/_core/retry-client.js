import { apiLogger, logError, logPerformance } from './logger.js';
import { getCircuitBreaker } from './circuit-breaker.js';
import { InfrastructureError } from './errors/typed-errors.js';
/**
 * Configuração padrão de retry
 */
const DEFAULT_RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelay: 1000, // 1 segundo
    maxDelay: 10000, // 10 segundos
    backoffMultiplier: 2,
    retryableErrors: [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETUNREACH',
        'EAI_AGAIN'
    ],
    retryableStatusCodes: [
        408, // Request Timeout
        429, // Too Many Requests
        500, // Internal Server Error
        502, // Bad Gateway
        503, // Service Unavailable
        504 // Gateway Timeout
    ]
};
/**
 * Calcula delay com backoff exponencial jitter
 */
function calculateDelay(attempt, config) {
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const delay = Math.min(exponentialDelay + jitter, config.maxDelay);
    return Math.floor(delay);
}
/**
 * Verifica se uma requisição deve ser retry
 */
function shouldRetry(error, statusCode, attempt, config) {
    if (attempt >= config.maxAttempts) {
        return false;
    }
    // Verificar códigos de status
    if (statusCode && config.retryableStatusCodes.includes(statusCode)) {
        return true;
    }
    // Verificar erros de rede
    if (error && error.code && config.retryableErrors.includes(error.code)) {
        return true;
    }
    // Verificar erros de timeout
    if (error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
        return true;
    }
    return false;
}
/**
 * Cria um AbortSignal com timeout.
 * Retorna também `clear()` para cancelar o timer quando o fetch resolver antes do prazo,
 * evitando timer ativo (leak) pós-resolução.
 */
function createTimeoutSignal(timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
}
/**
 * Executa requisição HTTP com retry automático e logging
 */
export async function fetchWithRetry(url, options = {}) {
    const perAttemptMs = options.timeout ?? 30_000;
    const maxAttempts = options.retryConfig?.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts;
    // Teto global: impede que retries + delays somem indefinidamente.
    const globalMs = options.globalTimeoutMs ?? perAttemptMs * (maxAttempts + 1);
    let globalTimer;
    const timeoutPromise = new Promise((_, reject) => {
        globalTimer = setTimeout(() => reject(new Error(`fetchWithRetry: global timeout after ${globalMs}ms`)), globalMs);
    });
    const cbEnabled = options.circuitBreaker?.enabled !== false;
    let operation;
    if (cbEnabled) {
        const cbName = options.circuitBreaker?.name ?? new URL(url).hostname;
        const breaker = getCircuitBreaker(cbName, {
            failureThreshold: options.circuitBreaker?.failureThreshold,
            resetTimeoutMs: options.circuitBreaker?.resetTimeoutMs,
        });
        operation = breaker.execute(() => performFetchWithRetry(url, options));
    }
    else {
        operation = performFetchWithRetry(url, options);
    }
    try {
        return await Promise.race([operation, timeoutPromise]);
    }
    finally {
        clearTimeout(globalTimer);
    }
}
/**
 * Lógica interna do fetch com retry
 */
async function performFetchWithRetry(url, options = {}) {
    const startTime = Date.now();
    const timeout = options.timeout || 30000; // 30 segundos padrão
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };
    let lastError;
    let lastStatusCode;
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
        const attemptStartTime = Date.now();
        try {
            apiLogger.info({
                url,
                method: options.method || 'GET',
                attempt,
                maxAttempts: retryConfig.maxAttempts,
                timeout
            }, 'HTTP request attempt');
            // Criar AbortSignal com timeout — timer cleared via .finally() para evitar timer ativo pós-resolve
            const timeoutCtrl = options.signal ? null : createTimeoutSignal(timeout);
            const fetchSignal = timeoutCtrl
                ? timeoutCtrl.signal
                : options.signal;
            const response = await fetch(url, {
                ...options,
                signal: fetchSignal,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'ERP-Server/1.0.0',
                    ...options.headers
                }
            }).finally(() => timeoutCtrl?.clear());
            lastStatusCode = response.status;
            // Log da resposta
            const attemptDuration = Date.now() - attemptStartTime;
            logRequest(options.method || 'GET', url, response.status, attemptDuration);
            // Se a resposta for bem-sucedida, retornar
            if (response.ok) {
                const totalDuration = Date.now() - startTime;
                logPerformance('http-request-with-retry', totalDuration, {
                    url,
                    method: options.method || 'GET',
                    status: response.status,
                    attempts: attempt
                });
                apiLogger.info({
                    url,
                    method: options.method || 'GET',
                    status: response.status,
                    attempts: attempt,
                    totalDuration
                }, 'HTTP request successful');
                return response;
            }
            // Se não for retryável, lançar erro
            if (!shouldRetry(null, response.status, attempt, retryConfig)) {
                throw new InfrastructureError(`HTTP ${response.status}: ${response.statusText}`);
            }
            // Preparar para retry
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            const httpError = error;
            httpError.status = response.status;
            httpError.statusCode = response.status;
            throw error;
        }
        catch (error) {
            lastError = error;
            // Verificar se deve retry
            if (!shouldRetry(error, lastStatusCode, attempt, retryConfig)) {
                throw error;
            }
            // Log do erro e preparação para retry
            const attemptDuration = Date.now() - attemptStartTime;
            logError({ message: 'http-request-retry', url, method: options.method || 'GET', attempt, maxAttempts: retryConfig.maxAttempts, attemptDuration }, error, { statusCode: lastStatusCode });
            // Se não for a última tentativa, esperar antes de retry
            if (attempt < retryConfig.maxAttempts) {
                const delay = calculateDelay(attempt, retryConfig);
                apiLogger.info({
                    url,
                    method: options.method || 'GET',
                    attempt,
                    nextAttempt: attempt + 1,
                    delay
                }, 'Waiting before retry');
                await sleep(delay);
            }
        }
    }
    // Todas as tentativas falharam
    const totalDuration = Date.now() - startTime;
    logError({ message: 'http-request-failed', url, method: options.method || 'GET', attempts: retryConfig.maxAttempts, totalDuration, lastStatusCode }, lastError);
    throw lastError;
}
/**
 * Wrapper para requisições JSON com parse automático
 */
export async function fetchJsonWithRetry(url, options = {}) {
    const response = await fetchWithRetry(url, options);
    if (!response.ok) {
        throw new InfrastructureError(`HTTP ${response.status}: ${response.statusText}`);
    }
    const text = await response.text();
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    }
    catch (error) {
        logError('json-parse-error', error, {
            url,
            responseText: text.substring(0, 200)
        });
        throw new InfrastructureError(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Executa múltiplas requisições em paralelo com retry individual
 */
export async function fetchAllWithRetry(requests) {
    const startTime = Date.now();
    apiLogger.info({ message: 'Starting parallel HTTP requests', count: requests.length, urls: requests.map(r => r.url) });
    const promises = requests.map(({ url, options }) => fetchWithRetry(url, options).catch(error => ({ url, error })));
    const results = await Promise.allSettled(promises);
    const responses = [];
    const errors = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const value = result.value;
            if (value instanceof Response) {
                responses.push(value);
            }
            else {
                errors.push(value);
            }
        }
        else {
            errors.push({
                url: requests[index]?.url || 'unknown',
                error: result.reason
            });
        }
    });
    const totalDuration = Date.now() - startTime;
    logPerformance('http-parallel-requests', totalDuration, {
        totalRequests: requests.length,
        successful: responses.length,
        failed: errors.length
    });
    if (errors.length > 0) {
        apiLogger.warn({ message: 'Some HTTP requests failed', successful: responses.length, failed: errors.length, errors: errors.map(e => ({ url: e.url, error: e.error instanceof Error ? e.error.message : String(e.error) })) });
    }
    if (responses.length === 0) {
        throw new InfrastructureError(`All ${requests.length} HTTP requests failed`);
    }
    return responses;
}
/**
 * Helper para sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Função para log de requisições (compatível com logger existente)
 */
function logRequest(method, url, statusCode, duration, userId) {
    apiLogger.info({
        method,
        url,
        statusCode,
        duration: duration ? `${duration}ms` : undefined,
        userId
    }, `HTTP ${method} ${url} - ${statusCode}`);
}
/**
 * Classe para gerenciar cliente HTTP com retry
 */
export class RetryHttpClient {
    defaultOptions;
    constructor(defaultOptions = {}) {
        this.defaultOptions = defaultOptions;
    }
    async get(url, options) {
        return fetchWithRetry(url, { ...this.defaultOptions, ...options, method: 'GET' });
    }
    async post(url, data, options) {
        return fetchWithRetry(url, {
            ...this.defaultOptions,
            ...options,
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined
        });
    }
    async put(url, data, options) {
        return fetchWithRetry(url, {
            ...this.defaultOptions,
            ...options,
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined
        });
    }
    async delete(url, options) {
        return fetchWithRetry(url, { ...this.defaultOptions, ...options, method: 'DELETE' });
    }
    async getJson(url, options) {
        return fetchJsonWithRetry(url, { ...this.defaultOptions, ...options, method: 'GET' });
    }
    async postJson(url, data, options) {
        return fetchJsonWithRetry(url, {
            ...this.defaultOptions,
            ...options,
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined
        });
    }
}
// Export cliente HTTP padrão
export const httpClient = new RetryHttpClient({
    timeout: 30000,
    retryConfig: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000
    }
});
