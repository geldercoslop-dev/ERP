import type { ApiListResponse } from "@/shared/types";

/**
 * Normaliza respostas de API que podem vir em formatos variados (Array, ApiListResponse, { items })
 * Centraliza a lógica para evitar repetição nas páginas.
 */
export function normalizeListResponse<T>(response: any): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response as T[];
  
  // Se for ApiListResponse
  if (typeof response === 'object' && 'success' in response && 'data' in response && Array.isArray(response.data)) {
    return (response as ApiListResponse<T>).data;
  }

  // Fallbacks para outros formatos comuns no projeto
  if (typeof response === 'object' && 'items' in response && Array.isArray(response.items)) {
    return response.items as T[];
  }

  if (typeof response === 'object' && 'clientes' in response && Array.isArray(response.clientes)) {
    return response.clientes as T[];
  }

  if (typeof response === 'object' && 'produtos' in response && Array.isArray(response.produtos)) {
    return response.produtos as T[];
  }

  return [];
}

/**
 * Obtém o total de registros de uma resposta paginada.
 */
export function getListTotal(response: any): number {
  if (!response) return 0;
  if (Array.isArray(response)) return response.length;
  if (typeof response === 'object' && 'total' in response) return Number(response.total);
  if (typeof response === 'object' && 'data' in response && Array.isArray(response.data)) return response.data.length;
  return 0;
}
