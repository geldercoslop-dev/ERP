import { trpc } from "@/lib/trpcClient";
import { useMemo } from "react";
import { normalizeListResponse, getListTotal } from "@/utils/data-normalizer";
import type { Comissao, ContaReceber, ContaPagar, PlanoConta } from "@/shared/types";

/** Opções padrão para financeiro: atualizações constantes */
const FINANCE_QUERY_OPTIONS = {
  staleTime: 20_000, 
  refetchOnWindowFocus: true,
};

/**
 * Hook centralizado para gestão de comissões.
 */
export function useComissoes(filters?: any) {
  const query = trpc.comissoes.list.useQuery(filters, FINANCE_QUERY_OPTIONS);

  const data = useMemo(() => normalizeListResponse<Comissao>(query.data), [query.data]);
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
 * Hook centralizado para contas a receber.
 */
export function useContasReceber(filters?: { status?: 'PENDENTE' | 'RECEBIDA' }) {
  const query = trpc.contasReceber.list.useQuery(filters, FINANCE_QUERY_OPTIONS);

  const data = useMemo(() => normalizeListResponse<ContaReceber>(query.data), [query.data]);
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
 * Hook centralizado para contas a pagar e plano de contas.
 */
export function useContasPagar(filters?: { status?: 'PENDENTE' | 'PAGO', fornecedor?: string }) {
  const query = trpc.contasPagar.list.useQuery(filters ?? {}, FINANCE_QUERY_OPTIONS);
  const planosQuery = trpc.planoContas.list.useQuery({ tipo: "DESPESA" }, { staleTime: 60_000 });

  const data = useMemo(() => normalizeListResponse<ContaPagar>(query.data), [query.data]);
  const planos = useMemo(() => normalizeListResponse<PlanoConta>(planosQuery.data), [planosQuery.data]);
  const total = useMemo(() => getListTotal(query.data), [query.data]);

  return {
    ...query,
    data,
    planos,
    total,
    isEmpty: !query.isLoading && data.length === 0,
    isError: !!query.error || !!planosQuery.error,
  };
}
