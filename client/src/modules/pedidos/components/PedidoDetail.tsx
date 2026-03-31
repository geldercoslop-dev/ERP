/**
 * DETALHES DO PEDIDO
 * 
 * Componente que mostra:
 * - Informações completas do pedido
 * - Itens com tipagem strict
 * - Status e forma de pagamento
 * - Tratamento de erro 403 com TRPCError
 * - Zero qualquer 'any'
 */

import React from "react";
import { usePedidoDetail } from "../hooks.js";
import type { PedidoResponse } from "../../../shared/types/index.js";
import { TRPCClientError } from "@trpc/client";

interface PedidoDetailProps {
  pedidoId: number;
}

export function PedidoDetail({ pedidoId }: PedidoDetailProps) {
  const query = usePedidoDetail(pedidoId);
  const pedido = query.data as PedidoResponse | undefined;
  const trpcError = query.error as TRPCClientError<unknown> | undefined;

  // Tratamento de erro 403 (acesso negado)
  if (trpcError?.data?.code === "FORBIDDEN") {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-900">❌ Acesso Negado</p>
        <p className="text-sm text-red-700">Você não tem permissão para ver este pedido.</p>
      </div>
    );
  }

  if (query.isLoading) {
    return <div className="p-4">⏳ Carregando detalhes...</div>;
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
        <p className="text-sm font-medium text-yellow-900">⚠️ Erro ao carregar pedido</p>
      </div>
    );
  }

  if (!pedido) {
    return <div className="p-4 text-center text-gray-500">Pedido não encontrado</div>;
  }

  // Formatar valores decimais de string para número
  const subtotal = parseFloat(String(pedido.subtotal) || "0");
  const desconto = parseFloat(String(pedido.desconto) || "0");
  const frete = parseFloat(String(pedido.frete) || "0");
  const total = parseFloat(String(pedido.total) || "0");

  return (
    <div className="space-y-6 rounded border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-bold">Pedido #{pedido.numero}</h2>
          <p className="text-sm text-gray-600">
            Criado em {new Date(pedido.dataCriacao).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <span className="inline-block rounded bg-blue-100 px-3 py-1 font-medium text-blue-900">
          {pedido.status}
        </span>
      </div>

      {/* Informações do cliente */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-gray-500">Cliente</p>
          <p className="text-sm font-semibold">{pedido.clienteNome}</p>
          {pedido.clienteTelefone && (
            <p className="text-xs text-gray-600">{pedido.clienteTelefone}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-gray-500">Data de Entrega</p>
          <p className="text-sm">
            {pedido.dataEntrega
              ? new Date(pedido.dataEntrega).toLocaleDateString("pt-BR")
              : "Não informada"}
          </p>
        </div>
      </div>

      {/* Forma de Pagamento (se disponível) */}
      {pedido.formaPagamento && (
        <div className="rounded bg-gray-50 p-3">
          <p className="text-xs font-medium uppercase text-gray-500">Forma de Pagamento</p>
          <p className="text-sm font-medium">{pedido.formaPagamento}</p>
        </div>
      )}

      {/* Valores */}
      <div className="space-y-2 rounded bg-gray-50 p-4">
        <div className="flex justify-between text-sm">
          <span>Subtotal:</span>
          <span>R$ {subtotal.toFixed(2)}</span>
        </div>
        {desconto > 0 && (
          <div className="flex justify-between text-sm">
            <span>Desconto:</span>
            <span className="text-green-600">-R$ {desconto.toFixed(2)}</span>
          </div>
        )}
        {frete > 0 && (
          <div className="flex justify-between text-sm">
            <span>Frete:</span>
            <span>R$ {frete.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t pt-2 text-right font-bold">
          <span>Total:</span>
          <span className="ml-2">R$ {total.toFixed(2)}</span>
        </div>
      </div>

      {/* Itens */}
      {pedido.itens && pedido.itens.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Itens do Pedido</p>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left">Tipo</th>
                  <th className="px-2 py-2 text-left">Descrição</th>
                  <th className="px-2 py-2 text-center">Qtd</th>
                  <th className="px-2 py-2 text-right">Valor Unit.</th>
                  <th className="px-2 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {pedido.itens.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-2 py-2 text-xs">
                      <span className="rounded bg-blue-100 px-2 py-1 text-blue-900">
                        {item.tipo}
                      </span>
                    </td>
                    <td className="px-2 py-2">{item.descricao}</td>
                    <td className="px-2 py-2 text-center">{item.quantidade}</td>
                    <td className="px-2 py-2 text-right">
                      R$ {Number(item.valorUnitario).toFixed(2)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium">
                      R$ {(item.quantidade * Number(item.valorUnitario)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Observações */}
      {pedido.observacoes && (
        <div>
          <p className="text-xs font-medium uppercase text-gray-500">Observações</p>
          <p className="text-sm text-gray-700">{pedido.observacoes}</p>
        </div>
      )}
    </div>
  );
}
