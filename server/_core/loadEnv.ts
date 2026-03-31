/**
 * Única leitura opcional de ficheiro: `.env` na raiz do projeto (getProjectRoot).
 * Variáveis já definidas no processo (ex.: `env_file` do Docker Compose) NÃO são sobrescritas
 * (dotenv sem override).
 *
 * Não carregar `.env.development`, `.env.production` nem cadeias com override — elimina
 * sobreposição e conflitos com o ambiente injectado pelo compose.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { getProjectRoot } from "./project-root.js";

console.log("[BOOT] loadEnv — início");
console.log("[ENV] carregando apenas .env (sem override; compose/env_file tem precedência)…");

const root = getProjectRoot();
const basePath = path.resolve(root, ".env");
const base = dotenv.config({ path: basePath, override: false });

if (!fs.existsSync(basePath) && process.env.NODE_ENV !== "test") {
  console.warn(
    `[ENV] Arquivo .env não encontrado em ${basePath}. Variáveis devem vir do ambiente (ex.: env_file no Docker).`
  );
}

/**
 * Se algum segredo vier vazio (""), preencher a partir do que foi parseado do único .env
 * (não sobrescreve valores já injectados pelo runtime).
 */
const combinedParsed = { ...(base?.parsed ?? {}) } as Record<string, string>;
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
