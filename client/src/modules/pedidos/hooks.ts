/**
 * HOOKS DO MÓDULO PEDIDOS
 * 
 * Hooks type-safe para operações com pedidos
 * Sem qualquer 'any' - tipagem strict
 * Alinhados com TRPC backend
 */

import { trpc } from "../../lib/trpcClient.js";
import { useMemo } from "react";
import { normalizeListResponse, getListTotal } from "../../utils/data-normalizer.js";
import type { PedidoResponse, PedidoFilters } from "../../../shared/types/index.js";

/** Opções padrão para queries de pedidos */
const PEDIDOS_QUERY_OPTIONS = {
  staleTime: 30_000, // 30 segundos
  refetchOnWindowFocus: true,
};

/**
 * Hook para listar pedidos com filtros
 * Suporta: status, busca, clienteId, dataInicio, dataFim, page, pageSize
 */
export function usePedidoList(filters?: PedidoFilters) {
  const query = trpc.pedidos.list.useQuery(filters, PEDIDOS_QUERY_OPTIONS);

  const data = useMemo(
    () => normalizeListResponse<PedidoResponse>(query.data),
    [query.data]
  );
  const total = useMemo(
    () => getListTotal(query.data),
    [query.data]
  );

  return {
    ...query,
    data,
    total,
    isEmpty: !query.isLoading && data.length === 0,
  };
}

/**
 * Hook para criar novo pedido
 */
export function usePedidoCreate() {
  return trpc.pedidos.create.useMutation({
    onSuccess: () => {
      // Invalidar cache de pedidos após sucesso
      trpc.useUtils().pedidos.list.invalidate();
    },
  });
}

/**
 * Hook para obter detalhes completos de um pedido
 * Inclui itens do pedido
 */
export function usePedidoDetail(pedidoId: number | undefined) {
  return trpc.pedidos.getById.useQuery(
    { id: pedidoId ?? 0 },
    {
      enabled: pedidoId != null && pedidoId > 0,
      staleTime: 60_000,
    }
  );
}

/**
 * Hook para atualizar pedido
 * Suporta: observacoes, formaPagamento, status
 */
export function usePedidoUpdate() {
  return trpc.pedidos.update.useMutation({
    onSuccess: () => {
      trpc.useUtils().pedidos.list.invalidate();
      trpc.useUtils().pedidos.getById.invalidate();
    },
  });
}

/**
 * Hook para deletar pedido
 */
export function usePedidoDelete() {
  return trpc.pedidos.delete.useMutation({
    onSuccess: () => {
      trpc.useUtils().pedidos.list.invalidate();
    },
  });
}


