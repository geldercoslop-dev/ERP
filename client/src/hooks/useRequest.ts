/**
 * Hook para gerenciar estado de requisições/telas
 * Encapsula loading, erro, vazio com tipagem forte
 */

import { useState, useCallback } from 'react';

export type Payload = Record<string, unknown>;

export interface RequestState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  isEmpty: boolean;
}

export interface UseRequestOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Hook genérico para requisições com states
 */
export function useRequest<T>(initialData: T | null = null) {
  const [state, setState] = useState<RequestState<T>>({
    data: initialData,
    isLoading: false,
    error: null,
    isEmpty: !initialData || (Array.isArray(initialData) && initialData.length === 0),
  });

  const setLoading = useCallback((isLoading: boolean) => {
    setState((prev) => ({ ...prev, isLoading }));
  }, []);

  const setData = useCallback((data: T | null) => {
    setState({
      data,
      isLoading: false,
      error: null,
      isEmpty: !data || (Array.isArray(data) && data.length === 0),
    });
  }, []);

  const setError = useCallback((error: Error | null) => {
    setState({
      data: null,
      isLoading: false,
      error,
      isEmpty: false,
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      isLoading: false,
      error: null,
      isEmpty: !initialData || (Array.isArray(initialData) && initialData.length === 0),
    });
  }, [initialData]);

  const execute = useCallback(
    async (fn: () => Promise<T>, options?: UseRequestOptions) => {
      setLoading(true);
      try {
        const result = await fn();
        setData(result);
        options?.onSuccess?.();
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setError(err);
        options?.onError?.(err);
        throw err;
      }
    },
    [setLoading, setData, setError]
  );

  return {
    ...state,
    setLoading,
    setData,
    setError,
    reset,
    execute,
  };
}
