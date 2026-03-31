/**
 * Hook para gerenciar estado de requisições/telas
 * Encapsula loading, erro, vazio com tipagem forte
 */

import { useState, useCallback, ReactNode } from 'react';

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

/**
 * Componentes de UI para estados comuns
 */

export interface LoadingProps {
  children?: ReactNode;
}

export function Loading({ children }: LoadingProps) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      {children && <span className="ml-3">{children}</span>}
    </div>
  );
}

export interface ErrorProps {
  title?: string;
  message?: string;
  error?: Error | null;
  onRetry?: () => void;
}

export function ErrorDisplay({ title = 'Erro', message, error, onRetry }: ErrorProps) {
  const errorMessage = message || error?.message || 'Ocorreu um erro inesperado';

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm mt-1">{errorMessage}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Tentar Novamente
        </button>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title = 'Sem dados',
  message = 'Nenhum item encontrado',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
