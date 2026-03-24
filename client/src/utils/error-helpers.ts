/**
 * Utilitários de validação e tratamento de erros
 */

import type { ApiError, ApiResponse } from '../types/api';
import { AppError, ErrorCode, isErrorWithCode } from '../types/error';

/**
 * Verifica se uma resposta é um erro de API
 * @param response - Resposta do servidor
 * @returns true se contém erro
 */
export function isApiError(response: unknown): response is ApiError {
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    'message' in response
  );
}

/**
 * Verifica se um objeto é ApiResponse com erro
 * @param data - Objeto a verificar
 * @returns true se é ApiResponse com erro
 */
export function isApiResponseWithError<T = unknown>(
  data: unknown
): data is ApiResponse<T> & { error: ApiError } {
  const response = data as Partial<ApiResponse<T>>;
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    isApiError(response.error)
  );
}

/**
 * Extrai mensagem de erro de várias fontes
 * @param error - Erro de qualquer tipo
 * @returns String com a mensagem de erro
 */
export function getErrorMessage(error: unknown): string {
  // AppError
  if (error instanceof AppError) {
    return error.message;
  }

  // Error padrão
  if (error instanceof Error) {
    return error.message;
  }

  // Objeto com error.error.message
  if (typeof error === 'object' && error !== null) {
    if ('error' in error && typeof error.error === 'object' && error.error !== null) {
      if ('message' in error.error && typeof error.error.message === 'string') {
        return error.error.message;
      }
    }
    // Objeto com message direto
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }

  // String
  if (typeof error === 'string') {
    return error;
  }

  // Fallback
  return 'Erro desconhecido';
}

/**
 * Extrai código de erro
 * @param error - Erro de qualquer tipo
 * @returns Código do erro
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) {
    return error.code;
  }

  if (isErrorWithCode(error)) {
    const code = error.code as ErrorCode;
    return Object.values(ErrorCode).includes(code) ? code : ErrorCode.UNKNOWN_ERROR;
  }

  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Extrai requestId do erro se disponível
 * @param error - Erro
 * @returns RequestId ou undefined
 */
export function getRequestIdFromError(error: unknown): string | undefined {
  if (error instanceof AppError) {
    return error.requestId;
  }

  if (typeof error === 'object' && error !== null) {
    if ('details' in error && typeof error.details === 'object' && error.details !== null) {
      if ('requestId' in error.details && typeof error.details.requestId === 'string') {
        return error.details.requestId;
      }
    }
  }

  return undefined;
}

/**
 * Verifica se um erro é retentável
 * @param error - Erro a verificar
 * @returns true se pode fazer retry
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isRetryable();
  }

  // Erros de rede genéricos
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('enotfound')
  );
}

/**
 * Cria AppError a partir de resposta de erro
 * @param apiError - Erro da API
 * @param statusCode - HTTP status code
 * @returns AppError
 */
export function createAppError(apiError: ApiError, statusCode?: number): AppError {
  const mappedCode = mapErrorCode(apiError.code);

  return new AppError(
    apiError.message,
    mappedCode,
    statusCode || apiError.statusCode,
    apiError.details,
    apiError.details?.requestId
  );
}

/**
 * Mapeia código de erro string para enum
 * @param code - Código de erro
 * @returns ErrorCode correspondente
 */
function mapErrorCode(code: string): ErrorCode {
  const codeMap: Record<string, ErrorCode> = {
    VALIDATION_ERROR: ErrorCode.VALIDATION_ERROR,
    AUTHORIZATION_ERROR: ErrorCode.AUTHORIZATION_ERROR,
    AUTHENTICATION_ERROR: ErrorCode.AUTHENTICATION_ERROR,
    NOT_FOUND: ErrorCode.NOT_FOUND,
    CONFLICT: ErrorCode.CONFLICT,
    TOO_MANY_REQUESTS: ErrorCode.TOO_MANY_REQUESTS,
    INTERNAL_ERROR: ErrorCode.INTERNAL_ERROR,
    SERVICE_UNAVAILABLE: ErrorCode.SERVICE_UNAVAILABLE,
    TIMEOUT: ErrorCode.TIMEOUT,
    NETWORK_ERROR: ErrorCode.NETWORK_ERROR,
    CONNECTION_ERROR: ErrorCode.CONNECTION_ERROR,
    PARSE_ERROR: ErrorCode.PARSE_ERROR,
  };

  return codeMap[code] || ErrorCode.UNKNOWN_ERROR;
}

/**
 * Formata erro para exibição ao usuário
 * @param error - Erro
 * @returns Mensagem formatada
 */
export function formatErrorForDisplay(error: unknown): string {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);

  // Mensagens customizadas por tipo de erro
  const userMessages: Record<ErrorCode, string> = {
    [ErrorCode.VALIDATION_ERROR]: 'Os dados fornecidos são inválidos. Verifique e tente novamente.',
    [ErrorCode.AUTHORIZATION_ERROR]: 'Você não tem permissão para acessar este recurso.',
    [ErrorCode.AUTHENTICATION_ERROR]: 'Sua sessão expirou. Faça login novamente.',
    [ErrorCode.NOT_FOUND]: 'O recurso não foi encontrado.',
    [ErrorCode.CONFLICT]: 'Operação conflitante. O recurso pode ter sido modificado.',
    [ErrorCode.TOO_MANY_REQUESTS]: 'Muitas requisições. Tente novamente em alguns segundos.',
    [ErrorCode.INTERNAL_ERROR]: 'Erro interno do servidor. Tente novamente.',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Serviço indisponível. Tente de novo em instantes.',
    [ErrorCode.TIMEOUT]: 'Operação demorou demais. Tente novamente.',
    [ErrorCode.NETWORK_ERROR]: 'Erro de rede. Verifique sua conexão.',
    [ErrorCode.CONNECTION_ERROR]: 'Não foi possível conectar ao servidor.',
    [ErrorCode.PARSE_ERROR]: 'Erro ao processar resposta do servidor.',
    [ErrorCode.UNKNOWN_ERROR]: message || 'Ocorreu um erro inesperado.',
    [ErrorCode.INVALID_INPUT]: 'Entrada inválida. Verifique os dados fornecidos.',
  };

  return userMessages[code] || message;
}
