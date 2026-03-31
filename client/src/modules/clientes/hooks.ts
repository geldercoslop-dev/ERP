/**
 * HOOKS DO MÓDULO CLIENTES
 * 
 * Hooks para operações com clientes
 * 
 * Usa:
 * - trpc para chamadas backend
 * - useQuery/useMutation para state
 * - normalizeListResponse para tipagem
 */

import { trpc } from "../../lib/trpcClient.js";
import { useMemo } from "react";
import { normalizeListResponse, getListTotal } from "../../utils/data-normalizer.js";
import type { ClienteResponse, ClienteFilters } from "../../../shared/types/index.js";

/** Opções padrão para queries de clientes */
const CLIENTES_QUERY_OPTIONS = {
  staleTime: 60_000, // 1 minuto
  refetchOnWindowFocus: false,
};

/**
 * Hook para listar clientes com filtros
 * @param filters - Filtros de pagina, busca, etc
 */
export function useClienteList(filters?: ClienteFilters) {
  const query = trpc.clientes.list.useQuery(filters, CLIENTES_QUERY_OPTIONS);

  const data = useMemo(() => normalizeListResponse<ClienteResponse>(query.data), [query.data]);
  const total = useMemo(() => getListTotal(query.data), [query.data]);

  return {
    ...query,
    data,
    total,
    isEmpty: !query.isLoading && data.length === 0,
    isError: !!query.error,
    errorCode: query.error?.data?.code,
  };
}

/**
 * Hook para buscar clientes por texto
 * @param term - Termo de busca
 */
export function useClienteSearch(term: string) {
  const query = trpc.clientes.search.useQuery(
    { term },
    {
      enabled: term.length >= 2,
      staleTime: 30_000,
    }
  );

  const data = useMemo(() => normalizeListResponse<ClienteResponse>(query.data), [query.data]);

  return {
    ...query,
    data,
    isEmpty: !query.isLoading && data.length === 0,
  };
}

/**
 * Hook para criar novo cliente
 */
export function useClienteCreate() {
  return trpc.clientes.create.useMutation({
    onSuccess: () => {
      trpc.useUtils().clientes.list.invalidate();
    },
  });
}

/**
 * Hook para atualizar cliente
 */
export function useClienteUpdate() {
  return trpc.clientes.update.useMutation({
    onSuccess: () => {
      trpc.useUtils().clientes.list.invalidate();
    },
  });
}

/**
 * Hook para deletar cliente
 */
export function useClienteDelete() {
  return trpc.clientes.delete.useMutation({
    onSuccess: () => {
      trpc.useUtils().clientes.list.invalidate();
    },
  });
}

