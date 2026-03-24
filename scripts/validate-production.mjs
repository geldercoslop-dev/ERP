#!/usr/bin/env node
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.production") });

const port = Number(process.env.PORT || 3000);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if ((code ?? 1) === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})`));
    });
    child.on("error", reject);
  });
}

async function waitHealth(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`health check timeout: ${url}`);
}

async function runStartAndHealth() {
  const child = spawn("pnpm", ["start:prod"], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  try {
    await waitHealth(`http://127.0.0.1:${port}/health`, 45000);
  } finally {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

async function main() {
  console.log("[validate:production] 1/5 typecheck");
  await run("pnpm", ["exec", "tsc", "-p", "tsconfig.server.json", "--noEmit"]);

  console.log("[validate:production] 2/5 env validation");
  await run("node", ["server/scripts/validate-env.mjs"]);

  console.log("[validate:production] 3/5 infra check");
  await run("pnpm", ["run", "check:infra"]);

  console.log("[validate:production] 4/5 start server");
  console.log("[validate:production] 5/5 health check");
  await runStartAndHealth();

  console.log("[validate:production] success");
}

main().catch((error) => {
  console.error("[validate:production] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
