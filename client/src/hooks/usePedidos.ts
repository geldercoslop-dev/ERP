import { trpc } from "@/lib/trpcClient";
import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useMemo } from "react";
import { normalizeListResponse, getListTotal } from "@/utils/data-normalizer";
import type { Pedido } from "@/shared/types";

export type PedidosListInput = NonNullable<inferRouterInputs<AppRouter>["pedidos"]["list"]>;

/** Opções padrão para pedidos: atualizações mais frequentes */
const PEDIDOS_QUERY_OPTIONS = {
  staleTime: 30_000, // 30 segundos
  refetchOnWindowFocus: true,
};

/**
 * Hook centralizado para listagem e filtragem de pedidos.
 */
export function usePedidos(filters?: PedidosListInput) {
  const query = trpc.pedidos.list.useQuery(filters, PEDIDOS_QUERY_OPTIONS);

  const data = useMemo(() => normalizeListResponse<Pedido>(query.data), [query.data]);
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
 * Hook para pedidos disponíveis para carga.
 */
export function usePedidosParaCarga(enabled: boolean = true) {
  const query = trpc.pedidos.listParaCarga.useQuery(undefined, {
    enabled,
    staleTime: 15_000,
  });

  const data = useMemo(() => normalizeListResponse<Pedido>(query.data), [query.data]);

  return {
    ...query,
    data,
    isEmpty: !query.isLoading && data.length === 0,
  };
}
