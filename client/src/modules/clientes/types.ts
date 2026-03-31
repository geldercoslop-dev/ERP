/**
 * TIPOS DO MÓDULO CLIENTES
 * 
 * Tipos específicos para domínio de clientes
 * 
 * @future:
 * - EntidadeCliente (com métodos de domínio)
 * - ClienteState (gerenciamento de estado)
 * - ClienteValidation (regras de validação específicas)
 * 
 * 🔒 Não integrado com backend atual
 */

import type {
  ClientePayload,
  ClienteResponse,
  ClienteFilters,
  ClienteAccessControl,
} from "../../../shared/types/index.js";

/**
 * Estados possíveis para operações de cliente
 * @future: Usar em hooks/store
 */
export type ClienteState = "idle" | "loading" | "success" | "error";

/**
 * Contexto de cliente (para operações)
 * @future: Usar em componentes
 */
export interface ClienteContext {
  cliente: ClienteResponse | null;
  estado: ClienteState;
  erro: string | null;
  permissoes: ClienteAccessControl;
}

/**
 * Query parameters para listagem
 * @future: Tipagem type-safe para useClienteList
 */
export interface ClienteListParams extends ClienteFilters {
  sortBy?: "nome" | "telefone" | "createdAt";
  sortOrder?: "asc" | "desc";
}
