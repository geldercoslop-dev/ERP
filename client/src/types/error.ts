/**
 * Tipos de erros para tratamento estruturado
 */

/** Códigos de erro padrão */
export enum ErrorCode {
  // Client errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',

  // Client-side errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
}

/** Classe de erro customizada */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode?: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    statusCode?: number,
    details?: Record<string, unknown>,
    requestId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;

    // Manter chain de prototype
    Object.setPrototypeOf(this, AppError.prototype);
  }

  isClientError(): boolean {
    return this.statusCode ? this.statusCode >= 400 && this.statusCode < 500 : false;
  }

  isServerError(): boolean {
    return this.statusCode ? this.statusCode >= 500 : false;
  }

  isNetworkError(): boolean {
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.CONNECTION_ERROR,
      ErrorCode.TIMEOUT,
    ].includes(this.code);
  }

  isRetryable(): boolean {
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.CONNECTION_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.TOO_MANY_REQUESTS,
      ErrorCode.SERVICE_UNAVAILABLE,
    ].includes(this.code);
  }
}

/** Type guard para AppError */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Type guard para erros com propriedade code */
export function isErrorWithCode(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}
