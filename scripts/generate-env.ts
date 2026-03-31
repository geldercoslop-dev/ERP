/**
 * Gera secrets criptograficamente seguros e grava `.env.development` na raiz do projeto.
 * randomBytes(64).toString("hex") => 128 caracteres hex (> 64 chars exigidos pela validação).
 *
 * Uso: pnpm run generate:env
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, ".env.development");

function generateSecret(): string {
  return crypto.randomBytes(64).toString("hex");
}

function assertStrong(secret: string, label: string): void {
  if (secret.length < 64) {
    throw new Error(`${label}: secret deve ter pelo menos 64 caracteres (obteve ${secret.length})`);
  }
  // Evita placeholders óbvios
  const lower = secret.toLowerCase();
  if (
    lower.includes("changeme") ||
    lower.includes("secret") ||
    lower === "0".repeat(secret.length)
  ) {
    throw new Error(`${label}: valor rejeitado (padrão fraco detectado)`);
  }
}

const JWT_ACCESS_SECRET = generateSecret();
const JWT_REFRESH_SECRET = generateSecret();
const APP_SECRET = generateSecret();
const SESSION_SECRET = generateSecret();

for (const [name, val] of [
  ["JWT_ACCESS_SECRET", JWT_ACCESS_SECRET],
  ["JWT_REFRESH_SECRET", JWT_REFRESH_SECRET],
  ["APP_SECRET", APP_SECRET],
  ["SESSION_SECRET", SESSION_SECRET],
] as const) {
  assertStrong(val, name);
}

const contents = `# Gerado por scripts/generate-env.ts — NÃO COMMITAR (está no .gitignore)
NODE_ENV=development
PORT=3000

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
APP_SECRET=${APP_SECRET}
SESSION_SECRET=${SESSION_SECRET}

# Alinhado ao docker-compose: host = nome do serviço vendas-mysql (não "mysql").
# Se o MySQL corre só no host (sem compose), troque o host por localhost.
DATABASE_URL=mysql://vendas:vendas123@vendas-mysql:3306/erp

# Redis (obrigatório para validação de boot) — serviço vendas-redis no compose
REDIS_URL=redis://vendas-redis:6379
REDIS_HOST=vendas-redis
REDIS_PORT=6379

# Cliente Vite (opcional)
# VITE_TRPC_URL=/api/trpc
`;

fs.writeFileSync(outFile, contents, { encoding: "utf8", mode: 0o600 });

// Saída para conferência (sem repetir valores completos em CI)
console.log(`
✓ Arquivo criado: ${outFile}

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
APP_SECRET=${APP_SECRET}
SESSION_SECRET=${SESSION_SECRET}
`);
