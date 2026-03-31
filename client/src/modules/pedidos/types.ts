/**
 * TIPOS DO MÓDULO PEDIDOS
 * 
 * Tipos específicos para domínio de pedidos
 * 
 * @future:
 * - EntidadePedido (com métodos de domínio)
 * - PedidoState (gerenciamento de estado)
 * - PedidoValidation (regras de validação específicas)
 * 
 * 🔒 Não integrado com backend atual
 */

import type {
  PedidoPayload,
  PedidoResponse,
  PedidoFilters,
  PedidoSummary,
} from "../../../shared/types/index.js";

/**
 * Estados possíveis para operações de pedido
 * @future: Usar em hooks/store
 */
export type PedidoState = "idle" | "loading" | "success" | "error";

/**
 * Contexto de pedido (para operações)
 * @future: Usar em componentes
 */
export interface PedidoContext {
  pedido: PedidoResponse | null;
  estado: PedidoState;
  erro: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Query parameters para listagem
 * @future: Tipagem type-safe para usePedidoList
 */
export interface PedidoListParams extends PedidoFilters {
  sortBy?: "numero" | "dataCriacao" | "total";
  sortOrder?: "asc" | "desc";
  statusList?: string[];
}

/**
 * Estados válidos de pedido
 * @future: Usar em validação e workflows
 */
export const PEDIDO_STATUS_ENUM = [
  "GERADO",
  "IMPRESSO",
  "EM_ROTA",
  "ENTREGUE",
  "CANCELADO",
  "PENDENTE_ESTOQUE",
] as const;

export type PedidoStatusEnum = typeof PEDIDO_STATUS_ENUM[number];
