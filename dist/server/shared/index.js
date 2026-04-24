/**
 * Ponto central de exports do @erp/shared
 * Exporta todos os tipos, status e guards necessários para o server
 */
// Domain status (já inclui todos os status financeiros)
export * from "./domain-status.js";
// Types
export * from "./types/db-transaction.js";
// Guards
export * from "./guards/domain-guard.js";
