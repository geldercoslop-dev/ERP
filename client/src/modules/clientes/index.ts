/**
 * MÓDULO CLIENTES
 * 
 * Estrutura para operações com clientes
 * 
 * Usa:
 * - Hooks para state (useClienteList, useClienteCreate, etc)
 * - Types compartilhados (shared/types)
 * 
 * 🔒 Integrado com backend real
 */

// Exports dos hooks
export {
  useClienteList,
  useClienteSearch,
  useClienteCreate,
  useClienteUpdate,
  useClienteDelete,
} from "./hooks.js";

// Exports dos types
export type {
  ClienteState,
  ClienteContext,
  ClienteListParams,
  ClienteAccessControl,
} from "./types.js";

