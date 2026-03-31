import { trpc } from "../lib/trpcClient";
import { useMemo } from "react";
import { normalizeListResponse, getListTotal } from "../utils/data-normalizer";
import type { Produto, GrupoPrecificacao, Cor } from "../shared/types";

/** Opções padrão para estoque: atualização moderada */
const PRODUTOS_QUERY_OPTIONS = {
  staleTime: 45_000, 
  refetchOnWindowFocus: false,
};

/**
 * Hook centralizado para gestão de produtos e estoque.
 */
export function useProdutos(filters?: any) {
  const query = trpc.produtos.list.useQuery(filters, PRODUTOS_QUERY_OPTIONS);

  const data = useMemo(() => normalizeListResponse<Produto>(query.data), [query.data]);
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
 * Hook para buscar produtos por termo.
 */
export function useProdutoSearch(queryStr: string) {
  const query = trpc.produtos.buscar.useQuery(
    { query: queryStr || undefined },
    { enabled: queryStr.length >= 2, staleTime: 30_000 }
  );

  const data = useMemo(() => normalizeListResponse<Produto>(query.data?.produtos), [query.data?.produtos]);

  return {
    ...query,
    data,
    isEmpty: !query.isLoading && data.length === 0,
  };
}

/**
 * Hook auxiliar para grupos e cores (Cadastros base).
 */
export function useCadastrosBaseProdutos() {
  const gruposQuery = trpc.gruposPrecificacao.list.useQuery(undefined, PRODUTOS_QUERY_OPTIONS);
  const coresQuery = trpc.cores.list.useQuery(undefined, PRODUTOS_QUERY_OPTIONS);

  const grupos = useMemo(() => normalizeListResponse<GrupoPrecificacao>(gruposQuery.data), [gruposQuery.data]);
  const cores = useMemo(() => normalizeListResponse<Cor>(coresQuery.data), [coresQuery.data]);

  return {
    grupos,
    cores,
    isLoading: gruposQuery.isLoading || coresQuery.isLoading,
    isError: gruposQuery.isError || coresQuery.isError,
    refetch: () => {
      gruposQuery.refetch();
      coresQuery.refetch();
    }
  };
}
