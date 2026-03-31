/**
 * LISTAGEM DE PEDIDOS
 * 
 * Componente com:
 * - Paginação
 * - Filtros (status, busca, cliente)
 * - Tratamento de erro 403 com TRPCError
 * - Tipagem strict - zero 'any'
 */

import React, { useState } from "react";
import { usePedidoList } from "../hooks.js";
import type { PedidoResponse, PedidoFilters, PedidoStatusValue } from "../../../shared/types/index.js";
import { TRPCClientError } from "@trpc/client";

interface PedidoListProps {
  onSelect?: (pedido: PedidoResponse) => void;
  initialFilters?: PedidoFilters;
}

// Status disponíveis
const STATUS_OPTIONS: PedidoStatusValue[] = [
  "GERADO",
  "CONFERIDO",
  "IMPRESSO",
  "EM_ROTA",
  "ENTREGUE",
  "CANCELADO",
  "PENDENTE_ESTOQUE",
];

export function PedidoList({ onSelect, initialFilters }: PedidoListProps) {
  const [filters, setFilters] = useState<PedidoFilters>(
    initialFilters ?? { page: 1, pageSize: 20 }
  );
  const [searchTerm, setSearchTerm] = useState("");

  const query = usePedidoList(filters);
  const data = query.data;
  const total = query.total;
  const trpcError = query.error as TRPCClientError<unknown> | undefined;

  // Tratamento de erro 403 (acesso negado)
  if (trpcError?.data?.code === "FORBIDDEN") {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-900">❌ Acesso Negado</p>
        <p className="text-sm text-red-700">
          Você não tem permissão para ver estes pedidos.
        </p>
      </div>
    );
  }

  if (query.isLoading) {
    return <div className="p-4">⏳ Carregando pedidos...</div>;
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
        <p className="text-sm font-medium text-yellow-900">
          ⚠️ Erro ao carregar pedidos
        </p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-center">
        <p className="text-sm text-gray-600">Nenhum pedido encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com filtros */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar pedido..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setFilters({ ...filters, busca: e.target.value || undefined, page: 1 });
          }}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          onChange={(e) => {
            const status = e.target.value as PedidoStatusValue | "";
            setFilters({
              ...filters,
              status: status ? status : undefined,
              page: 1,
            });
          }}
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Número</th>
              <th className="px-4 py-2 text-left font-medium">Cliente</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 text-left font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {data.map((pedido) => (
              <tr
                key={pedido.id}
                className="cursor-pointer border-b hover:bg-gray-50"
                onClick={() => onSelect?.(pedido)}
              >
                <td className="px-4 py-2 font-medium">#{pedido.numero}</td>
                <td className="px-4 py-2">{pedido.clienteNome}</td>
                <td className="px-4 py-2">
                  <span className="inline-block rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-900">
                    {pedido.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  R$ {parseFloat(String(pedido.total) || "0").toFixed(2)}
                </td>
                <td className="px-4 py-2">
                  {new Date(pedido.dataCriacao).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Total: {total} | Página {filters.page ?? 1}
        </p>
        <div className="flex gap-2">
          <button
            className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() =>
              setFilters({ ...filters, page: Math.max(1, (filters.page ?? 1) - 1) })
            }
          >
            ← Anterior
          </button>
          <button
            className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            disabled={
              (filters.pageSize ?? 20) * (filters.page ?? 1) >= total
            }
            onClick={() =>
              setFilters({ ...filters, page: (filters.page ?? 1) + 1 })
            }
          >
            Próxima →
          </button>
        </div>
      </div>
    </div>
  );
}
