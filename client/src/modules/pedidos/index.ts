/**
 * MÓDULO PEDIDOS
 * 
 * Estrutura para operações com pedidos
 * 
 * Usa:
 * - Hooks para state (usePedidoList, usePedidoCreate, etc)
 * - Componentes para UI (PedidoList, PedidoForm, PedidoDetail)
 * - Types compartilhados (shared/types)
 * 
 * 🔒 Integrado com backend real
 */

// Exports dos hooks
export {
  usePedidoList,
  usePedidoCreate,
  usePedidoDetail,
  usePedidoUpdate,
  usePedidoDelete,
} from "./hooks.js";

// Exports dos componentes
export {
  PedidoList,
  PedidoForm,
  PedidoDetail,
} from "./components/index.js";

// Exports dos types
export type {
  PedidoState,
  PedidoContext,
  PedidoListParams,
  PedidoStatusEnum,
  PEDIDO_STATUS_ENUM,
} from "./types.js";

