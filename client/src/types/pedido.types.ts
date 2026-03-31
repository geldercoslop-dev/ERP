/**
 * Tipos para Pedidos
 * Sem `any` - tipagem 100% forte
 */

export interface Pedido {
  id: number;
  numeroNF?: string;
  dataEmissao?: string;
  dataVencimento?: string;
  clienteId?: number;
  clienteNome?: string;
  valor?: number;
  status?: string;
  observacoes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PedidoCreateInput {
  numeroNF?: string;
  dataEmissao?: string;
  dataVencimento?: string;
  clienteId?: number;
  clienteNome?: string;
  valor?: number;
  status?: string;
  observacoes?: string;
}

export interface PedidoUpdateInput extends Partial<PedidoCreateInput> {
  id: number;
}

export interface PedidoListResponse {
  items: Pedido[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PedidoListParams {
  page?: number;
  pageSize?: number;
  status?: string;
}

export type PedidoStatus = 'pendente' | 'processando' | 'concluído' | 'cancelado';
