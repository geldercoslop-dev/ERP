/**
 * server/services/db — Canonical DB access layer.
 * Toda query de serviço deve importar via este módulo.
 * NÃO importe diretamente de 'drizzle-orm' ou 'drizzle/schema' fora daqui.
 */

// Re-exporta tudo do db/index (conexão, tabelas, operadores tipados)
export * from "../../db/index.js";
