#!/usr/bin/env node
import dotenv from "dotenv";
import path from "path";

const root = process.cwd();
const basePath = path.resolve(root, ".env");
dotenv.config({ path: basePath });

const checks = [
  ["JWT_SECRET", 32],
  ["JWT_ACCESS_SECRET", 32],
  ["JWT_REFRESH_SECRET", 32],
];

const issues = [];

for (const [name, min] of checks) {
  const value = process.env[name];
  if (!value || value.trim().length < min) {
    issues.push(`${name} must be at least ${min} chars`);
  }
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") issues.push("DATABASE_URL is required");

if (!process.env.REDIS_HOST || process.env.REDIS_HOST.trim() === "") {
  issues.push("REDIS_HOST is required");
}

if (!process.env.REDIS_PORT || process.env.REDIS_PORT.trim() === "") {
  issues.push("REDIS_PORT is required");
}

if (issues.length > 0) {
  console.error("[ENV] inválido:");
  for (const issue of issues) console.error(`[ENV]  - ${issue}`);
  process.exit(1);
}

console.log("[ENV] ok (script validate-env.mjs)");
