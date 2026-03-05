/**
 * Carrega variáveis de ambiente: .env (base) e depois .env.development ou .env.production.
 * Usa process.cwd() para garantir que .env na raiz do projeto seja lido (dev e produção).
 */
import dotenv from "dotenv";
import path from "path";

const root = process.cwd();
dotenv.config({ path: path.resolve(root, ".env") });
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "development" || nodeEnv === "production") {
  dotenv.config({ path: path.resolve(root, `.env.${nodeEnv}`) });
}
