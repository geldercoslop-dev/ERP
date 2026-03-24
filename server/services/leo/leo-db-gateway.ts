import { getDb } from "../../db/index";

/**
 * Ponto único para obter conexão Drizzle no ecossistema LEO (sem re-exportar schema/tabelas).
 * Preferir sempre serviços de domínio (`finance.service`, `orders.service`, …) em código novo.
 */
export async function getLeoDb() {
  return getDb();
}
