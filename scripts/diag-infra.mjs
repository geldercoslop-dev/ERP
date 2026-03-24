#!/usr/bin/env node
/**
 * Diagnóstico de infra (sem lógica de negócio):
 * - portas 3000, 3306, 6379 (Windows: netstat)
 * - MySQL (DATABASE_URL)
 * - Redis (REDIS_HOST / REDIS_PORT)
 *
 * Uso: pnpm run diag:infra
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import mysql from "mysql2/promise";
import Redis from "ioredis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.development"), override: true });

console.log("\n=== diag:infra ===\n");

// Portas (Windows)
try {
  const out = execSync('netstat -ano | findstr ":3000 :3306 :6379 "', {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log("[portas] netstat (3000, 3306, 6379):\n", out || "(nenhuma linha)\n");
} catch {
  console.log("[portas] netstat: nada ou comando indisponível\n");
}

const dbUrl = process.env.DATABASE_URL;
console.log("[env] DATABASE_URL definida:", Boolean(dbUrl && dbUrl.trim()));
console.log("[env] REDIS:", process.env.REDIS_HOST, process.env.REDIS_PORT);

if (!dbUrl?.trim()) {
  console.error("[MySQL] FAIL: DATABASE_URL ausente");
  process.exitCode = 1;
} else {
  try {
    const c = await mysql.createConnection(dbUrl);
    await c.query("SELECT 1 as ok");
    await c.end();
    console.log("[MySQL] OK (ping SELECT 1)");
  } catch (e) {
    console.error("[MySQL] FAIL:", e?.message || e);
    console.error("  → Suba: pnpm run infra:up   (Docker) ou ajuste DATABASE_URL");
    process.exitCode = 1;
  }
}

try {
  const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  });
  await redis.connect();
  const pong = await redis.ping();
  await redis.quit();
  console.log("[Redis] OK", pong);
} catch (e) {
  console.error("[Redis] FAIL:", e?.message || e);
  console.error("  → Suba: pnpm run infra:up   (Docker) ou inicie redis-server local");
  process.exitCode = 1;
}

console.log("\n=== fim diag:infra ===\n");
