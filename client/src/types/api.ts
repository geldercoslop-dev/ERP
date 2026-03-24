/**
 * Tipos globais para API responses
 * Garante contrato consistente entre Cliente/Servidor
 */

/** Response padrão da API */
export type ApiResponse<T = unknown> = {
  data?: T;
  error?: ApiError;
  meta?: {
    requestId?: string;
    timestamp?: string;
    duration?: number;
  };
};

/** Erro estruturado da API */
export type ApiError = {
  code: string;
  message: string;
  details?: {
    requestId?: string;
    timestamp?: string;
    field?: string;
    [key: string]: unknown;
  };
  statusCode?: number;
};

/** Resultado de operação sem dados */
export type ApiSuccess = {
  success: true;
  message?: string;
  meta?: ApiResponse['meta'];
};

/** Resultado de falha */
export type ApiFailure = {
  success: false;
  error: ApiError;
};

/** Tipo discriminado para operações */
export type OperationResult<T = unknown> = ApiSuccess | ApiFailure;

/** Context para requisições */
export type RequestContext = {
  requestId: string;
  timestamp: Date;
  timeout: number;
  headers?: Record<string, string>;
};

/** Configuração de requisição */
export type FetchConfig = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  cancelToken?: AbortSignal;
};
