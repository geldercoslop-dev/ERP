import { trpc } from "@/lib/trpcClient";
import { useMemo } from "react";
import { normalizeListResponse, getListTotal } from "@/utils/data-normalizer";
import type { Cliente } from "@/shared/types";

/** Opções padrão para queries que não precisam de refetch constante */
const DEFAULT_QUERY_OPTIONS = {
  staleTime: 60_000, // 1 minuto
  refetchOnWindowFocus: false,
};

/**
 * Hook centralizado para gerenciar a listagem de clientes.
 * Encapsula normalização, totalizadores e cache.
 */
export function useClientes(filters?: any) {
  const query = trpc.clientes.list.useQuery(filters, DEFAULT_QUERY_OPTIONS);

  const data = useMemo(() => normalizeListResponse<Cliente>(query.data), [query.data]);
  const total = useMemo(() => getListTotal(query.data), [query.data]);

  return {
    ...query,
    data,
    total,
    isEmpty: !query.isLoading && data.length === 0,
    isError: !!query.error,
  };
}

/**
 * Hook para buscar um único cliente ou realizar busca global.
 */
export function useClienteSearch(term: string) {
  const query = trpc.clientes.buscaGlobal.useQuery(
    { term, limit: 20 },
    { 
      enabled: term.length >= 2,
      staleTime: 30_000, 
    }
  );

  const data = useMemo(() => normalizeListResponse<Cliente>(query.data), [query.data]);

  return {
    ...query,
    data,
    isEmpty: !query.isLoading && data.length === 0,
  };
}
