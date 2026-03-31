/**
 * Ponte SQL legada para `server/services/ai/*`.
 *
 * Regras anti-regressão:
 * - Código novo em LEO/AI deve preferir serviços de domínio (`finance.service`, `orders.service`, `inventory.service`, …).
 * - Não importar `db/index`, `db/core` nem `drizzle/schema` diretamente em `services/ai` (ESLint).
 * - Esta fachada permanece apenas enquanto consultas analíticas forem migradas para serviços dedicados.
 */
export * from "../db/index.js";
