import { apiLogger, logError, logPerformance } from './logger.js';
import { getCircuitBreaker } from './circuit-breaker.js';

/**
 * Configurações de retry para requisições HTTP
 */
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
  retryableStatusCodes: number[];
}

/**
 * Opções para requisições HTTP com retry
 */
interface RequestOptions extends RequestInit {
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
  circuitBreaker?: {
    enabled?: boolean;
    name?: string;
    failureThreshold?: number;
    resetTimeoutMs?: number;
  };
}

/**
 * Configuração padrão de retry
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,      // 1 segundo
  maxDelay: 10000,     // 10 segundos
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
    504  // Gateway Timeout
  ]
};

/**
 * Calcula delay com backoff exponencial jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
  const delay = Math.min(exponentialDelay + jitter, config.maxDelay);
  return Math.floor(delay);
}

/**
 * Verifica se uma requisição deve ser retry
 */
function shouldRetry(
  error: any,
  statusCode: number | undefined,
  attempt: number,
  config: RetryConfig
): boolean {
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
 * Cria um AbortSignal com timeout
 */
function createTimeoutSignal(timeout: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller.signal;
}

/**
 * Executa requisição HTTP com retry automático e logging
 */
export async function fetchWithRetry(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const cbEnabled = options.circuitBreaker?.enabled !== false; // Habilitado por padrão
  
  if (cbEnabled) {
    const cbName = options.circuitBreaker?.name || new URL(url).hostname;
    const breaker = getCircuitBreaker(cbName, {
      failureThreshold: options.circuitBreaker?.failureThreshold,
      resetTimeoutMs: options.circuitBreaker?.resetTimeoutMs
    });

    return await breaker.execute(() => performFetchWithRetry(url, options));
  }

  return await performFetchWithRetry(url, options);
}

/**
 * Lógica interna do fetch com retry
 */
async function performFetchWithRetry(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const startTime = Date.now();
  const timeout = options.timeout || 30000; // 30 segundos padrão
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };
  
  let lastError: any;
  let lastStatusCode: number | undefined;

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

      // Criar AbortSignal com timeout
      const signal = options.signal || createTimeoutSignal(timeout);
      
      const response = await fetch(url, {
        ...options,
        signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ERP-Server/1.0.0',
          ...options.headers
        }
      });

      lastStatusCode = response.status;
      
      // Log da resposta
      const attemptDuration = Date.now() - attemptStartTime;
      logRequest(
        options.method || 'GET',
        url,
        response.status,
        attemptDuration
      );

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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Preparar para retry
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).status = response.status;
      (error as any).statusCode = response.status;
      throw error;

    } catch (error) {
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
export async function fetchJsonWithRetry<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, options);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  
  if (!text) {
    return null as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    logError('json-parse-error', error, {
      url,
      responseText: text.substring(0, 200)
    });
    throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Executa múltiplas requisições em paralelo com retry individual
 */
export async function fetchAllWithRetry(
  requests: Array<{ url: string; options?: RequestOptions }>
): Promise<Response[]> {
  const startTime = Date.now();
  
  apiLogger.info({ message: 'Starting parallel HTTP requests', count: requests.length, urls: requests.map(r => r.url) });

  const promises = requests.map(({ url, options }) =>
    fetchWithRetry(url, options).catch(error => ({ url, error }))
  );

  const results = await Promise.allSettled(promises);
  const responses: Response[] = [];
  const errors: Array<{ url: string; error: any }> = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const value = result.value;
      if (value instanceof Response) {
        responses.push(value);
      } else {
        errors.push(value);
      }
    } else {
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
    apiLogger.warn({ message: 'Some HTTP requests failed', successful: responses.length, failed: errors.length, errors: errors.map(e => ({ url: e.url, error: e.error?.message })) });
  }

  if (responses.length === 0) {
    throw new Error(`All ${requests.length} HTTP requests failed`);
  }

  return responses;
}

/**
 * Helper para sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Função para log de requisições (compatível com logger existente)
 */
function logRequest(
  method: string,
  url: string,
  statusCode: number,
  duration?: number,
  userId?: string
): void {
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
  private defaultOptions: RequestOptions;

  constructor(defaultOptions: RequestOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  async get(url: string, options?: RequestOptions): Promise<Response> {
    return fetchWithRetry(url, { ...this.defaultOptions, ...options, method: 'GET' });
  }

  async post(url: string, data?: any, options?: RequestOptions): Promise<Response> {
    return fetchWithRetry(url, {
      ...this.defaultOptions,
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async put(url: string, data?: any, options?: RequestOptions): Promise<Response> {
    return fetchWithRetry(url, {
      ...this.defaultOptions,
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async delete(url: string, options?: RequestOptions): Promise<Response> {
    return fetchWithRetry(url, { ...this.defaultOptions, ...options, method: 'DELETE' });
  }

  async getJson<T = any>(url: string, options?: RequestOptions): Promise<T> {
    return fetchJsonWithRetry<T>(url, { ...this.defaultOptions, ...options, method: 'GET' });
  }

  async postJson<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T> {
    return fetchJsonWithRetry<T>(url, {
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
