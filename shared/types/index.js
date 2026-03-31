/**
 * Tipos compartilhados — única definição por entidade.
 * Backend: import { Cliente } from "./index.ts"
 * Frontend: import { Cliente } from "../../client/src/shared/types"
 */
// Entidades do banco (fonte: Drizzle schema)
export * from "./entities";
// Order (CreatePedidoData, PedidoFilter, etc.)
export * from "./order";
// Financial (CreateContaPagarData, FinancialSummary, etc.)
export * from "./financial";
// LEO
export * from "./leo";
// Utils
export * from "./utils";
