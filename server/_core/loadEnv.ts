/**
 * Carrega .env e .env.<NODE_ENV> apenas a partir da raiz do projeto (getProjectRoot).
 * Sem fallback para process.cwd(): em produção as variáveis devem estar no ambiente ou no .env da raiz do artefato.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { getProjectRoot } from "./project-root";

console.log("[BOOT] loadEnv — início");
console.log("[ENV] carregando .env / .env.<NODE_ENV>…");

const root = getProjectRoot();
const basePath = path.resolve(root, ".env");
const base = dotenv.config({ path: basePath });
const nodeEnv = process.env.NODE_ENV;

if (!fs.existsSync(basePath) && process.env.NODE_ENV !== "test") {
  console.warn(
    `[ENV] Arquivo .env não encontrado em ${basePath}. Segredos e PORT devem vir do ambiente (ou copie .env para a raiz do deploy).`
  );
}

let modeFile: ReturnType<typeof dotenv.config> | undefined;
if (nodeEnv === "development" || nodeEnv === "production") {
  const modePath = path.resolve(root, `.env.${nodeEnv}`);
  // override: .env.<NODE_ENV> deve prevalecer sobre .env e qualquer preload
  modeFile = dotenv.config({ path: modePath, override: true });
}

if (nodeEnv === "production" && (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "")) {
  const prodPath = path.resolve(root, ".env.production");
  dotenv.config({ path: prodPath });
}

/**
 * Hardening de configuração:
 * Se algum segredo vier vazio (""), alguns ambientes/CI podem setar a variável sem valor.
 * Nesse caso, o dotenv não sobrescreve por padrão; portanto, preenchemos vazios
 * com os valores vindos dos arquivos .env para evitar erros 500 (ex.: ADMIN_PASSWORD_HASH).
 */
const combinedParsed = { ...(base?.parsed ?? {}), ...(modeFile?.parsed ?? {}) } as Record<string, string>;
const keysToFill = [
  "ADMIN_PASSWORD_HASH",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "SESSION_SECRET",
];

for (const key of keysToFill) {
  const current = process.env[key];
  if (current == null || (typeof current === "string" && current.trim() === "")) {
    const parsedValue = combinedParsed[key];
    if (parsedValue) process.env[key] = parsedValue;
  }
}

console.log("[ENV] DATABASE_URL:", process.env.DATABASE_URL ? "definido" : "ausente");
console.log("[ENV] Redis:", process.env.REDIS_HOST ?? "(unset)", process.env.REDIS_PORT ?? "");
