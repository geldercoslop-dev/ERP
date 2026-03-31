/**
 * TIPOS BASE PARA PEDIDOS - ALINHADO COM BACKEND TRPC
 * 
 * Contrato 100% TypeScript alinhado com:
 * - server/routers.ts pedidos router
 * - drizzle/schema.ts (pedidos + itensPedido)
 * - server/shared/domain-status.ts (PedidoStatusValue)
 */

/** Status válidos de pedido */
export type PedidoStatusValue =
  | "GERADO"
  | "CONFERIDO"
  | "IMPRESSO"
  | "EM_ROTA"
  | "ENTREGUE"
  | "CANCELADO"
  | "PENDENTE_ESTOQUE";

/** Tipo de item (CATALOGO ou LIVRE) */
export type PedidoItemTipo = "CATALOGO" | "LIVRE";

/**
 * Item de pedido - EXATAMENTE como TRPC espera
 * Alinhado com: itensPedido table schema
 */
export interface PedidoItemPayload {
  tipo: PedidoItemTipo; // OBRIGATÓRIO - CATALOGO ou LIVRE
  produtoId?: number | null;
  descricao: string; // OBRIGATÓRIO - descrição do item
  marca?: string | null;
  quantidade: number; // OBRIGATÓRIO - int positivo
  valorUnitario: number; // OBRIGATÓRIO - decimal
  custo: number; // OBRIGATÓRIO - default 0
  corId?: number | null;
  corNome?: string | null;
  prazoGarantia?: number; // default 90
  isPremio?: boolean; // optional flag
}

/**
 * Payload para criar pedido
 * EXATAMENTE como TRPC define em create procedure
 */
export interface PedidoPayload {
  clienteId: number; // OBRIGATÓRIO - min 1
  desconto?: number; // optional, default 0, min 0
  frete?: number; // optional, default 0, min 0
  formaPagamento?: string | null; // optional
  observacoes?: string | null; // optional
  vendedorIdAlvo?: number; // optional - admin only
  itens: PedidoItemPayload[]; // OBRIGATÓRIO - min 1 item
}

/**
 * Payload para atualizar pedido
 * EXATAMENTE como TRPC define em update procedure
 */
export interface PedidoUpdatePayload {
  id: number; // OBRIGATÓRIO
  observacoes?: string | null;
  formaPagamento?: string | null;
  status?: PedidoStatusValue;
}

/**
 * Resposta completa de pedido (GET)
 * Alinhado com: drizzle schema.pedidos type
 */
export interface PedidoResponse {
  // Identificação
  id: number;
  tenantId: number; // Multi-tenant
  numero: number; // Número único do pedido

  // Cliente (dados desnormalizados para exibição)
  clienteId: number;
  clienteNome: string;
  clienteTelefone?: string | null;
  clienteTelefoneRecado?: string | null;
  clienteRua?: string | null;
  clienteNumero?: string | null;
  clienteBairro?: string | null;
  clienteCidade?: string | null;
  clienteUf?: string | null;
  clienteReferencia?: string | null;
  clienteCondominio?: string | null;
  clienteBloco?: string | null;
  clienteApartamento?: string | null;

  // Valores (strings decimais do DB)
  subtotal: string; // decimal(10,2)
  desconto: string; // decimal(10,2)
  frete: string; // decimal(10,2)
  total: string; // decimal(10,2)

  // Status e forma de pagamento
  status: PedidoStatusValue;
  formaPagamento?: string | null;

  // Datas
  dataCriacao: Date | string; // timestamp
  dataEntrega?: Date | string | null; // optional timestamp
  createdAt: Date | string;
  updatedAt: Date | string;

  // Vendedor
  vendedorId: number;

  // Itens (relationship)
  itens?: PedidoItemPayload[];
}

/** Resumo de pedido (para listas - apenas campos essenciais) */
export interface PedidoSummary {
  id: number;
  numero: number;
  clienteNome: string;
  status: PedidoStatusValue;
  total: string;
  dataCriacao: Date | string;
}

/**
 * Filtros para listagem de pedidos
 */
export interface PedidoFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  clienteId?: number;
  vendedorId?: number;
  dataInicio?: Date;
  dataFim?: Date;
}
