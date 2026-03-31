/**
 * FORM PARA CRIAR PEDIDO
 * 
 * Componente com:
 * - Seleção de cliente
 * - Campos alinhados com backend TRPC (tipo, frete, formaPagamento)
 * - Validação básica
 * - Tratamento de erro 403 com tipagem stricta
 * - Zero uso de 'any'
 */

import React, { useState } from "react";
import { usePedidoCreate } from "../hooks.js";
import { useClienteList } from "../../clientes/hooks.js";
import type { PedidoPayload, PedidoItemPayload, PedidoItemTipo } from "../../../shared/types/index.js";
import { TRPCClientError } from "@trpc/client";

interface PedidoFormProps {
  onSuccess?: (pedidoId: number) => void;
  onError?: (erro: string) => void;
}

export function PedidoForm({ onSuccess, onError }: PedidoFormProps) {
  const [clienteId, setClienteId] = useState<number | "">("");
  const [observacoes, setObservacoes] = useState("");
  const [desconto, setDesconto] = useState("0");
  const [frete, setFrete] = useState("0");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [itemTipo, setItemTipo] = useState<PedidoItemTipo>("CATALOGO");
  const [itemDescricao, setItemDescricao] = useState("Item padrão");
  const [itemQuantidade, setItemQuantidade] = useState("1");
  const [itemValorUnitario, setItemValorUnitario] = useState("0");
  
  const { data: clientes, isLoading: clientesLoading } = useClienteList();
  const createMutation = usePedidoCreate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!clienteId) {
      onError?.("Selecione um cliente");
      return;
    }

    try {
      // Construir item tipado (TRPC exige tipo)
      const item: PedidoItemPayload = {
        tipo: itemTipo,
        descricao: itemDescricao || "Item",
        quantidade: parseInt(itemQuantidade, 10) || 1,
        valorUnitario: parseFloat(itemValorUnitario) || 0,
        custo: 0,
      };

      // Construir payload EXATAMENTE como TRPC espera
      const payload: PedidoPayload = {
        clienteId: Number(clienteId),
        itens: [item],
        desconto: parseFloat(desconto) || undefined,
        frete: parseFloat(frete) || undefined,
        formaPagamento: formaPagamento || undefined,
        observacoes: observacoes || undefined,
      };

      const result = await createMutation.mutateAsync(payload);

      onSuccess?.(result.id);
      // Reset form
      setClienteId("");
      setObservacoes("");
      setDesconto("0");
      setFrete("0");
      setFormaPagamento("");
      setItemTipo("CATALOGO");
      setItemDescricao("Item padrão");
      setItemQuantidade("1");
      setItemValorUnitario("0");
    } catch (error) {
      // Tipagem strict do erro TRPC
      if (error instanceof TRPCClientError) {
        if (error.data?.code === "FORBIDDEN") {
          onError?.("Você não tem permissão para criar pedidos");
        } else {
          onError?.(error.message ?? "Erro ao criar pedido");
        }
      } else if (error instanceof Error) {
        onError?.(error.message);
      } else {
        onError?.("Erro desconhecido ao criar pedido");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded border border-gray-300 p-4">
      <h3 className="font-semibold">Criar Novo Pedido</h3>

      {/* Cliente */}
      <div>
        <label className="block text-sm font-medium">Cliente *</label>
        <select
          required
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : "")}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          disabled={clientesLoading}
        >
          <option value="">Selecionar cliente...</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      {/* Item - Tipo */}
      <div>
        <label className="block text-sm font-medium">Tipo de Item *</label>
        <select
          required
          value={itemTipo}
          onChange={(e) => setItemTipo(e.target.value as PedidoItemTipo)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
        >
          <option value="CATALOGO">Catálogo</option>
          <option value="LIVRE">Livre</option>
        </select>
      </div>

      {/* Item - Descrição */}
      <div>
        <label className="block text-sm font-medium">Descrição do Item *</label>
        <input
          type="text"
          required
          value={itemDescricao}
          onChange={(e) => setItemDescricao(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          placeholder="Descrição do item..."
        />
      </div>

      {/* Item - Quantidade e Valor */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Quantidade *</label>
          <input
            type="number"
            min="1"
            value={itemQuantidade}
            onChange={(e) => setItemQuantidade(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Valor Unitário *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={itemValorUnitario}
            onChange={(e) => setItemValorUnitario(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          />
        </div>
      </div>

      {/* Desconto */}
      <div>
        <label className="block text-sm font-medium">Desconto (opcional)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={desconto}
          onChange={(e) => setDesconto(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          placeholder="0.00"
        />
      </div>

      {/* Frete */}
      <div>
        <label className="block text-sm font-medium">Frete (opcional)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={frete}
          onChange={(e) => setFrete(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          placeholder="0.00"
        />
      </div>

      {/* Forma de Pagamento */}
      <div>
        <label className="block text-sm font-medium">Forma de Pagamento (opcional)</label>
        <input
          type="text"
          value={formaPagamento}
          onChange={(e) => setFormaPagamento(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          placeholder="Ex: Dinheiro, Cartão, Boleto..."
        />
      </div>

      {/* Observações */}
      <div>
        <label className="block text-sm font-medium">Observações (opcional)</label>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          rows={3}
          placeholder="Notas sobre o pedido..."
        />
      </div>

      {/* Botão submit */}
      <button
        type="submit"
        disabled={createMutation.isPending || !clienteId}
        className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {createMutation.isPending ? "Criando..." : "Criar Pedido"}
      </button>
    </form>
  );
}
