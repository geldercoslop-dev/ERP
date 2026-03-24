/**
 * HTTP Client PRO - Cliente HTTP com logging estruturado
 * 
 * Wrapper do apiClient existente com:
 * - Logging estruturado via frontendLogger
 * - RequestId automático
 * - Type-safe
 */

import { apiClient, type ApiResult, type ApiRequestOptions } from '@/lib/api/apiClient';
import { frontendLogger } from '@/monitoring/frontend-logger';
import { generateRequestId } from '@/utils/request-id';
import type { ApiError } from '@/types/api';

export class HttpClient {
  private requestIdStack: string[] = [];

  /**
   * Obter RequestId atual
   */
  getCurrentRequestId(): string | undefined {
    return this.requestIdStack[this.requestIdStack.length - 1];
  }

  /**
   * Push RequestId para o stack
   */
  private pushRequestId(requestId: string): void {
    this.requestIdStack.push(requestId);
    frontendLogger.pushRequestId(requestId);
  }

  /**
   * Pop RequestId do stack
   */
  private popRequestId(): void {
    this.requestIdStack.pop();
    frontendLogger.popRequestId();
  }

  /**
   * GET request
   */
  async get<T = unknown>(
    url: string,
    options?: Omit<ApiRequestOptions, 'method' | 'payload'>
  ): Promise<ApiResult<T>> {
    const requestId = generateRequestId();
    this.pushRequestId(requestId);

    try {
      frontendLogger.logHttpRequest({
        method: 'GET',
        url,
        requestId,
      });

      const startTime = performance.now();
      const result = await apiClient<T>(url, {
        ...options,
        method: 'GET',
      });

      const duration = Math.round(performance.now() - startTime);

      if (result.ok) {
        frontendLogger.info({
          message: `✅ GET ${url} [${duration}ms]`,
          context: { status: result.status, duration },
          requestId,
        });
      } else {
        frontendLogger.warn({
          message: `❌ GET ${url} [${result.error.code}]`,
          context: { status: result.status, error: result.error.message, duration },
          requestId,
        });
      }

      return result;
    } finally {
      this.popRequestId();
    }
  }

  /**
   * POST request
   */
  async post<T = unknown, P = unknown>(
    url: string,
    payload: P,
    options?: Omit<ApiRequestOptions<P>, 'method' | 'payload'>
  ): Promise<ApiResult<T>> {
    const requestId = generateRequestId();
    this.pushRequestId(requestId);

    try {
      frontendLogger.logHttpRequest({
        method: 'POST',
        url,
        requestId,
      });

      const startTime = performance.now();
      const result = await apiClient<T, P>(url, {
        ...options,
        method: 'POST',
        payload,
      });

      const duration = Math.round(performance.now() - startTime);

      if (result.ok) {
        frontendLogger.logCriticalAction({
          action: 'POST',
          status: 'success',
          requestId,
          context: { url, duration, status: result.status },
        });
      } else {
        frontendLogger.logCriticalAction({
          action: 'POST',
          status: 'error',
          requestId,
          context: { url, error: result.error.message, duration },
        });
      }

      return result;
    } finally {
      this.popRequestId();
    }
  }

  /**
   * PUT request
   */
  async put<T = unknown, P = unknown>(
    url: string,
    payload: P,
    options?: Omit<ApiRequestOptions<P>, 'method' | 'payload'>
  ): Promise<ApiResult<T>> {
    const requestId = generateRequestId();
    this.pushRequestId(requestId);

    try {
      frontendLogger.logHttpRequest({
        method: 'PUT',
        url,
        requestId,
      });

      const startTime = performance.now();
      const result = await apiClient<T, P>(url, {
        ...options,
        method: 'PUT',
        payload,
      });

      const duration = Math.round(performance.now() - startTime);

      if (!result.ok) {
        frontendLogger.warn({
          message: `❌ PUT ${url} [${result.error.code}]`,
          context: { status: result.status, error: result.error.message, duration },
          requestId,
        });
      }

      return result;
    } finally {
      this.popRequestId();
    }
  }

  /**
   * PATCH request
   */
  async patch<T = unknown, P = unknown>(
    url: string,
    payload: P,
    options?: Omit<ApiRequestOptions<P>, 'method' | 'payload'>
  ): Promise<ApiResult<T>> {
    const requestId = generateRequestId();
    this.pushRequestId(requestId);

    try {
      const startTime = performance.now();
      const result = await apiClient<T, P>(url, {
        ...options,
        method: 'PATCH',
        payload,
      });

      const duration = Math.round(performance.now() - startTime);

      if (!result.ok) {
        frontendLogger.warn({
          message: `❌ PATCH ${url} [${result.error.code}]`,
          context: { status: result.status, error: result.error.message, duration },
          requestId,
        });
      }

      return result;
    } finally {
      this.popRequestId();
    }
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(
    url: string,
    options?: Omit<ApiRequestOptions, 'method' | 'payload'>
  ): Promise<ApiResult<T>> {
    const requestId = generateRequestId();
    this.pushRequestId(requestId);

    try {
      frontendLogger.logCriticalAction({
        action: 'delete',
        status: 'start',
        requestId,
        context: { url },
      });

      const startTime = performance.now();
      const result = await apiClient<T>(url, {
        ...options,
        method: 'DELETE',
      });

      const duration = Math.round(performance.now() - startTime);

      if (result.ok) {
        frontendLogger.logCriticalAction({
          action: 'delete',
          status: 'success',
          requestId,
          context: { url, duration, status: result.status },
        });
      } else {
        frontendLogger.logCriticalAction({
          action: 'delete',
          status: 'error',
          requestId,
          error: new Error(result.error.message),
          context: { url, error: result.error.code, duration },
        });
      }

      return result;
    } finally {
      this.popRequestId();
    }
  }
}

// Singleton instance
export const httpClient = new HttpClient();

export default httpClient;
