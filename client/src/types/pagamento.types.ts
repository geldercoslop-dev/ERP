/**
 * Tipos para Pagamentos
 * Sem `any` - tipagem 100% forte
 */

export interface Pagamento {
  id: number;
  pedidoId?: number;
  numeroPedido?: string;
  valor?: number;
  dataPagamento?: string;
  dataVencimento?: string;
  status?: PagamentoStatus;
  formaPagamento?: FormaPagamento;
  referencia?: string;
  observacoes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PagamentoCreateInput {
  pedidoId?: number;
  numeroPedido?: string;
  valor?: number;
  dataPagamento?: string;
  dataVencimento?: string;
  status?: PagamentoStatus;
  formaPagamento?: FormaPagamento;
  referencia?: string;
  observacoes?: string;
}

export interface PagamentoUpdateInput extends Partial<PagamentoCreateInput> {
  id: number;
}

export interface PagamentoListResponse {
  items: Pagamento[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PagamentoListParams {
  page?: number;
  pageSize?: number;
  status?: PagamentoStatus;
}

export type PagamentoStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado';
export type FormaPagamento = 'dinheiro' | 'cartao' | 'boleto' | 'transferencia' | 'cheque';
