import { toast } from 'sonner';
import { authenticatedFetch, isSameOriginUrl } from '@/lib/security/apiClient';

/**
 * Configurações de retry para requisições API
 */
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
  retryableStatusCodes: number[];
  timeout?: number;
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
    'NETWORK_ERROR',
    'TIMEOUT',
    'CONNECTION_ERROR',
    'SERVER_ERROR',
    'SERVICE_UNAVAILABLE'
  ],
  retryableStatusCodes: [
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
    520, // Unknown Error
    521, // Web Server Is Down
    522, // Connection Timed Out
    523, // Origin Is Unreachable
    524  // A Timeout Occurred
  ]
};

/**
 * Calcula delay com backoff exponencial e jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
  const delay = Math.min(exponentialDelay + jitter, config.maxDelay);
  return Math.floor(delay);
}

/** RequestInit estendido com timeout e config de retry (não repassados ao fetch nativo). */
export type FetchWithRetryInit = RequestInit & {
  retryConfig?: Partial<RetryConfig>;
  timeout?: number;
};

/**
 * Verifica se uma requisição deve ser retry
 */
function shouldRetry(
  error: unknown,
  attempt: number,
  config: RetryConfig,
  statusCode?: number
): boolean {
  if (attempt >= config.maxAttempts) {
    return false;
  }

  if (statusCode && config.retryableStatusCodes.includes(statusCode)) {
    return true;
  }

  if (error != null && typeof error === "object") {
    const e = error as { message?: string; name?: string; status?: number; statusCode?: number };
    const errorMessage = (e.message ?? "").toLowerCase();
    const code = e.status ?? e.statusCode;
    if (typeof code === "number" && config.retryableStatusCodes.includes(code)) {
      return true;
    }
    for (const retryableError of config.retryableErrors) {
      if (errorMessage.includes(retryableError.toLowerCase())) {
        return true;
      }
    }
    if (e.name === "TypeError" && errorMessage.includes("fetch")) {
      return true;
    }
    if (e.name === "AbortError" || errorMessage.includes("timeout")) {
      return true;
    }
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
 * Wrapper para fetch com retry automático
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryInit = {}
): Promise<Response> {
  const { retryConfig, timeout: timeoutOpt, ...restInit } = options;
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  const timeout = timeoutOpt ?? config.timeout ?? 30000;

  let lastError: unknown;
  let lastStatusCode: number | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    const attemptStartTime = Date.now();

    try {
      console.log(`[Retry] Attempt ${attempt}/${config.maxAttempts} for ${url}`);

      const signal = restInit.signal || createTimeoutSignal(timeout);

      const reqInit: RequestInit = {
        ...restInit,
        signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ERP-Frontend/1.0.0",
          ...restInit.headers,
        },
      };
      const response = isSameOriginUrl(url)
        ? await authenticatedFetch(url, reqInit)
        : await fetch(url, reqInit);

      lastStatusCode = response.status;
      
      // Log da resposta
      const attemptDuration = Date.now() - attemptStartTime;
      console.log(`[Retry] Response ${response.status} in ${attemptDuration}ms`);
      
      // Se a resposta for bem-sucedida, retornar
      if (response.ok) {
        return response;
      }

      // Se não for retryável, lançar erro
      if (!shouldRetry(null, attempt, config, response.status)) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Preparar para retry
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      (error as any).status = response.status;
      (error as any).statusCode = response.status;
      throw error;

    } catch (error) {
      lastError = error;
      const attemptDuration = Date.now() - attemptStartTime;
      
      console.error(`[Retry] Attempt ${attempt} failed in ${attemptDuration}ms:`, error);
      
      // Verificar se deve retry
      if (!shouldRetry(error, attempt, config, lastStatusCode)) {
        throw error;
      }

      // Se não for a última tentativa, mostrar toast e esperar
      if (attempt < config.maxAttempts) {
        const delay = calculateDelay(attempt, config);
        
        // Mostrar toast informativo
        if (attempt === 1) {
          toast.warning('Conexão instável detectada. Tentando novamente...', {
            duration: 2000,
            id: `retry-${url}` // ID único para evitar duplicatas
          });
        } else {
          toast.info(`Tentativa ${attempt}/${config.maxAttempts}...`, {
            duration: 1000,
            id: `retry-${url}`
          });
        }
        
        console.log(`[Retry] Waiting ${delay}ms before retry`);
        await sleep(delay);
      }
    }
  }

  // Todas as tentativas falharam
  const totalDuration = Date.now() - (Date.now() - (config.maxAttempts * 1000)); // Estimativa
  
  console.error(`[Retry] All ${config.maxAttempts} attempts failed for ${url}`);
  toast.error('Falha na conexão com o servidor. Verifique sua internet.', {
    duration: 5000,
    id: `retry-${url}`
  });
  
  throw lastError;
}

/**
 * Wrapper para requisições JSON com parse automático
 */
export async function fetchJsonWithRetry<T = any>(
  url: string,
  options: FetchWithRetryInit = {}
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
    console.error('[Retry] Failed to parse JSON response:', text.substring(0, 200));
    throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Executa múltiplas requisições em paralelo com retry individual
 */
export async function fetchAllWithRetry(
  requests: Array<{ url: string; options?: RequestInit & { retryConfig?: Partial<RetryConfig> } }>
): Promise<Response[]> {
  console.log(`[Retry] Starting ${requests.length} parallel requests`);
  
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
        url: requests[index].url,
        error: result.reason
      });
    }
  });

  if (errors.length > 0) {
    console.warn(`[Retry] ${errors.length} requests failed:`, errors);
    toast.warning(`${errors.length} requisições falharam`, {
      duration: 3000
    });
  }

  if (responses.length === 0) {
    throw new Error(`All ${requests.length} HTTP requests failed`);
  }

  console.log(`[Retry] ${responses.length}/${requests.length} requests succeeded`);
  return responses;
}

/**
 * Classe para gerenciar cliente HTTP com retry
 */
export class RetryHttpClient {
  private defaultOptions: FetchWithRetryInit;

  constructor(defaultOptions: FetchWithRetryInit = {}) {
    this.defaultOptions = {
      timeout: 30000,
      retryConfig: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000
      },
      ...defaultOptions
    };
  }

  async get(url: string, options?: RequestInit & { retryConfig?: Partial<RetryConfig> }): Promise<Response> {
    return fetchWithRetry(url, { ...this.defaultOptions, ...options, method: 'GET' });
  }

  async post(url: string, data?: any, options?: RequestInit & { retryConfig?: Partial<RetryConfig> }): Promise<Response> {
    return fetchWithRetry(url, {
      ...this.defaultOptions,
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async put(url: string, data?: any, options?: FetchWithRetryInit): Promise<Response> {
    return fetchWithRetry(url, {
      ...this.defaultOptions,
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async delete(url: string, options?: RequestInit & { retryConfig?: Partial<RetryConfig> }): Promise<Response> {
    return fetchWithRetry(url, { ...this.defaultOptions, ...options, method: 'DELETE' });
  }

  async getJson<T = any>(url: string, options?: FetchWithRetryInit): Promise<T> {
    return fetchJsonWithRetry<T>(url, { ...this.defaultOptions, ...options, method: 'GET' });
  }

  async postJson<T = any>(url: string, data?: any, options?: RequestInit & { retryConfig?: Partial<RetryConfig> }): Promise<T> {
    return fetchJsonWithRetry<T>(url, {
      ...this.defaultOptions,
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    });
  }
}

/**
 * Cliente HTTP padrão com retry
 */
export const httpClient = new RetryHttpClient({
  timeout: 30000,
  retryConfig: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000
  }
});

/**
 * Hook para usar retry em requisições customizadas
 */
export function useRetryRequest() {
  const execute = async <T = any>(
    requestFn: () => Promise<T>,
    options: Partial<RetryConfig> = {}
  ): Promise<T> => {
    const config = { ...DEFAULT_RETRY_CONFIG, ...options };
    let lastError: any;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await requestFn();
        
        if (attempt > 1) {
          toast.success('Requisição recuperada com sucesso!', {
            duration: 2000
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (!shouldRetry(error, attempt, config, undefined)) {
          throw error;
        }

        if (attempt < config.maxAttempts) {
          const delay = calculateDelay(attempt, config);
          
          if (attempt === 1) {
            toast.warning('Erro detectado. Tentando novamente...', {
              duration: 2000
            });
          } else {
            toast.info(`Tentativa ${attempt}/${config.maxAttempts}...`, {
              duration: 1000
            });
          }
          
          await sleep(delay);
        }
      }
    }

    toast.error('Falha após várias tentativas', {
      duration: 5000
    });
    
    throw lastError;
  };

  return { execute };
}

/**
 * Helper para sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Função para verificar se o erro é de rede
 */
export function isNetworkError(error: any): boolean {
  return (
    error instanceof TypeError ||
    error.name === 'TypeError' ||
    error.message?.toLowerCase().includes('fetch') ||
    error.message?.toLowerCase().includes('network') ||
    error.message?.toLowerCase().includes('connection')
  );
}

/**
 * Função para verificar se o erro é de timeout
 */
export function isTimeoutError(error: any): boolean {
  return (
    error.name === 'AbortError' ||
    error.message?.toLowerCase().includes('timeout') ||
    error.message?.toLowerCase().includes('aborted')
  );
}

/**
 * Função para criar wrapper de tRPC com retry
 */
export function createTrpcRetryWrapper(trpcClient: any) {
  return new Proxy(trpcClient, {
    get(target, prop) {
      const value = target[prop];
      
      if (typeof value === 'function') {
        return async (...args: any[]) => {
          try {
            return await value.apply(target, args);
          } catch (error) {
            // Se for erro de rede ou timeout, tentar novamente
            if (isNetworkError(error) || isTimeoutError(error)) {
              console.log('[TRPC Retry] Network error detected, retrying...');
              
              // Esperar um pouco antes de retry
              await sleep(1000);
              
              try {
                return await value.apply(target, args);
              } catch (retryError) {
                console.error('[TRPC Retry] Retry failed:', retryError);
                throw retryError;
              }
            }
            
            throw error;
          }
        };
      }
      
      return value;
    }
  });
}
