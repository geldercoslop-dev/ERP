/**
 * Carrega variáveis de ambiente: .env (base) e depois .env.development ou .env.production.
 * Deve ser o primeiro import no entry do servidor (antes de dotenv/config se usado).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(root, ".env") });
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "development" || nodeEnv === "production") {
  dotenv.config({ path: path.join(root, `.env.${nodeEnv}`) });
}
