/**
 * API Client
 * Camada HTTP padronizada para comunicação com backend
 * Tipagem forte, sem `any`
 */

export interface ApiResponse<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

const API_URL = typeof import.meta.env !== 'undefined' 
  ? (import.meta.env.VITE_API_URL || 'http://localhost:3000')
  : 'http://localhost:3000';

const DEFAULT_TIMEOUT = 30000; // 30s

/**
 * Faz requisição GET
 */
export async function apiGet<T = unknown>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      return { ok: false, error: 'Não autorizado' };
    }

    if (!response.ok) {
      return { ok: false, error: `Erro HTTP ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return { ok: false, error: message };
  }
}

/**
 * Faz requisição POST
 */
export async function apiPost<T = unknown>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      return { ok: false, error: 'Não autorizado' };
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let error = `Erro HTTP ${response.status}`;

      if (contentType?.includes('application/json')) {
        try {
          const json = await response.json();
          error = (json as any).error || (json as any).message || error;
        } catch {
          // continua com erro padrão
        }
      }

      return { ok: false, error };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return { ok: false, error: message };
  }
}

/**
 * Faz requisição PUT
 */
export async function apiPut<T = unknown>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      return { ok: false, error: 'Não autorizado' };
    }

    if (!response.ok) {
      return { ok: false, error: `Erro HTTP ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return { ok: false, error: message };
  }
}

/**
 * Faz requisição DELETE
 */
export async function apiDelete<T = unknown>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      method: 'DELETE',
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      return { ok: false, error: 'Não autorizado' };
    }

    if (!response.ok) {
      return { ok: false, error: `Erro HTTP ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return { ok: false, error: message };
  }
}

export const api = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  delete: apiDelete,
};
