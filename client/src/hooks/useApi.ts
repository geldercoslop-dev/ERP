/**
 * Hook useApi
 * Abstraçãopara requisições HTTP no React
 * Gerencia loading, error, data automaticamente
 */

import { useState, useCallback, useEffect } from 'react';
import { api, type ApiResponse } from '../services/api';

export interface UseApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface UseApiOptions {
  immediate?: boolean; // executar ao montar (padrão: false)
  deps?: unknown[]; // dependências para re-executar
}

/**
 * Hook para requisições GET
 */
export function useApiGet<T = unknown>(
  endpoint: string,
  options?: UseApiOptions
): UseApiState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    loading: options?.immediate ?? false,
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const response = await api.get<T>(endpoint);

    if (!response.ok) {
      setState({
        data: null,
        error: response.error || 'Erro desconhecido',
        loading: false,
      });
      return;
    }

    setState({
      data: response.data || null,
      error: null,
      loading: false,
    });
  }, [endpoint]);

  useEffect(() => {
    if (options?.immediate) {
      fetch();
    }
  }, [fetch, options?.immediate, ...(options?.deps || [])]);

  return { ...state, refetch: fetch };
}

/**
 * Hook para requisições POST/PUT/DELETE
 */
export function useApiMutation<T = unknown>(
  method: 'post' | 'put' | 'delete' = 'post'
) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const execute = useCallback(
    async (endpoint: string, body?: unknown): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      let response: ApiResponse<T>;

      if (method === 'post') {
        response = await api.post<T>(endpoint, body);
      } else if (method === 'put') {
        response = await api.put<T>(endpoint, body);
      } else {
        response = await api.delete<T>(endpoint);
      }

      if (!response.ok) {
        setState({
          data: null,
          error: response.error || 'Erro desconhecido',
          loading: false,
        });
        return null;
      }

      const data = response.data || null;
      setState({
        data,
        error: null,
        loading: false,
      });

      return data;
    },
    [method]
  );

  return { ...state, execute };
}

/**
 * Hook para múltiplas requisições GET em paralelo
 */
export function useApiMultiple<T extends Record<string, unknown>>(
  endpoints: Record<keyof T, string>,
  options?: UseApiOptions
): Record<keyof T, UseApiState<T[keyof T]>> & { refetch: () => Promise<void> } {
  const [states, setStates] = useState<Record<keyof T, UseApiState<T[keyof T]>>>(() => {
    const initial: Record<keyof T, UseApiState<T[keyof T]>> = {} as any;
    for (const key in endpoints) {
      initial[key] = {
        data: null,
        error: null,
        loading: options?.immediate ?? false,
      };
    }
    return initial;
  });

  const fetch = useCallback(async () => {
    // Atualizar loading para todas
    setStates((prev) => {
      const next = { ...prev };
      for (const key in next) {
        (next[key] as UseApiState<any>).loading = true;
        (next[key] as UseApiState<any>).error = null;
      }
      return next;
    });

    // Executar em paralelo
    const results = await Promise.all(
      Object.entries(endpoints).map(async ([key, endpoint]) => {
        const response = await api.get(endpoint);
        return [key, response] as const;
      })
    );

    // Atualizar estado
    setStates((prev) => {
      const next = { ...prev };
      for (const [key, response] of results) {
        (next[key as keyof T] as UseApiState<any>) = {
          data: response.ok ? response.data : null,
          error: response.ok ? null : response.error,
          loading: false,
        };
      }
      return next;
    });
  }, [endpoints]);

  useEffect(() => {
    if (options?.immediate) {
      fetch();
    }
  }, [fetch, options?.immediate, ...(options?.deps || [])]);

  return { ...states, refetch: fetch };
}
