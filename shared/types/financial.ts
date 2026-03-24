/**
 * Tipos financeiros — entidades (ContaPagar, ContaReceber, etc.) vêm de entities.ts
 */
export interface CreateContaPagarData {
  descricao: string;
  valor: number;
  dataVencimento: Date;
  fornecedor?: string;
  planoContasId?: number;
  codigoBarras?: string;
  pixCopiaECola?: string;
}

export interface CreateContaReceberData {
  descricao: string;
  valor: number;
  dataVencimento: Date;
  clienteId?: number;
  pedidoId?: number;
  planoContasId?: number;
}

export interface FinancialTransaction {
  id: number;
  tipo: "receita" | "despesa";
  descricao: string;
  valor: number;
  categoria?: string;
  formaPagamento?: string;
  data: Date;
  usuarioId: number;
  pedidoId?: number;
  createdAt: Date;
}

export interface FinancialSummary {
  periodo: { inicio: Date; fim: Date };
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
  contasReceber: { abertas: number; vencidas: number; total: number };
  contasPagar: { abertas: number; vencidas: number; total: number };
}
