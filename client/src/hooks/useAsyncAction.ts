/**
 * useAsyncAction - Hook para gerenciar ações assíncronas com loading e erro
 * 
 * Features:
 * - Cancelamento automático
 * - Retry automático
 * - Logging estruturado
 * - Type-safe
 */

import { useCallback, useRef, useState } from "react";
import { frontendLogger } from "../monitoring/frontend-logger";
import { generateRequestId } from "../utils/request-id";
import { AppError, ErrorCode } from "../types/error";

interface UseAsyncActionOptions {
  onSuccess?: (data: unknown) => void;
  onError?: (error: AppError) => void;
  onFinally?: () => void;
  autoRetry?: boolean;
  maxRetries?: number;
}

interface UseAsyncActionReturn<T, E = AppError> {
  data: T | null;
  loading: boolean;
  error: E | null;
  execute: (...args: any[]) => Promise<T>;
  reset: () => void;
  cancel: () => void;
}

export function useAsyncAction<T, A extends any[]>(
  asyncFn: (...args: A) => Promise<T>,
  options: UseAsyncActionOptions = {}
): UseAsyncActionReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<string>('');
  const retryCountRef = useRef(0);

  const handleError = useCallback((err: unknown) => {
    const appError =
      err instanceof Error ? new AppError(err.message, ErrorCode.UNKNOWN_ERROR) : (err as AppError);

    setError(appError);

    if (options.onError) {
      options.onError(appError);
    }

    frontendLogger.error({
      message: `Async action failed: ${asyncFn.name}`,
      error: appError as any,
      requestId: requestIdRef.current,
    });
  }, [options]);

  const execute = useCallback(
    async (...args: A): Promise<T> => {
      // Setup
      requestIdRef.current = generateRequestId();
      retryCountRef.current = 0;
      abortControllerRef.current = new AbortController();
      setLoading(true);
      setError(null);

      const attemptExecution = async (): Promise<T> => {
        try {
          frontendLogger.info({
            message: `Starting async action: ${asyncFn.name}`,
            requestId: requestIdRef.current,
            context: { attempt: retryCountRef.current + 1 },
          });

          const result = await asyncFn(...args);
          setData(result);
          
          frontendLogger.info({
            message: `✅ Async action completed: ${asyncFn.name}`,
            requestId: requestIdRef.current,
          });

          if (options.onSuccess) {
            options.onSuccess(result);
          }

          return result;
        } catch (err) {
          // Se abortado por usuário, não trata como erro
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('Cancelled by user');
          }

          // Retry logic
          const maxRetries = options.maxRetries ?? 0;
          if (options.autoRetry && retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            
            frontendLogger.warn({
              message: `Retrying async action: ${asyncFn.name}`,
              requestId: requestIdRef.current,
              context: { attempt: retryCountRef.current, maxRetries },
            });

            await new Promise((resolve) => 
              setTimeout(resolve, Math.pow(2, retryCountRef.current) * 1000)
            );
            return attemptExecution();
          }

          handleError(err);
          throw err;
        }
      };

      try {
        return await attemptExecution();
      } finally {
        setLoading(false);
        if (options.onFinally) {
          options.onFinally();
        }
      }
    },
    [asyncFn, options, handleError]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
    retryCountRef.current = 0;
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);

      frontendLogger.info({
        message: `Async action cancelled: ${asyncFn.name}`,
        requestId: requestIdRef.current,
      });
    }
  }, [asyncFn]);

  return {
    data,
    loading,
    error,
    execute,
    reset,
    cancel,
  };
}

export default useAsyncAction;
