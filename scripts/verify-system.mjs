#!/usr/bin/env node
/**
 * verify:system — ENV + TypeScript + DB + Redis + (opcional) servidor HTTP + /api/health
 * VERIFY_SKIP_HTTP=1 — não sobe servidor (só checagens locais).
 * VERIFY_SKIP_DB=1 / VERIFY_SKIP_REDIS=1 — pula testes de conexão (ex.: CI sem Docker).
 * VERIFY_STRICT_ENV=1 — roda também validate-env.mjs (JWT 64 chars).
 */
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const tscCli = path.join(root, "node_modules", "typescript", "lib", "tsc.js");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
      ...opts,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exit ${code}`));
    });
    child.on("error", reject);
  });
}

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

async function waitForHealth(port, maxMs = 90000) {
  const url = `http://127.0.0.1:${port}/api/health`;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const code = await httpGet(url, 4000);
      if (code >= 200 && code < 500) return code;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Health check em ${url} não respondeu em ${maxMs}ms`);
}

async function main() {
  console.log("[VERIFY] [BOOT] raiz do projeto:", root);

  const skipHttp =
    process.env.VERIFY_HTTP === "0" ||
    (process.env.VERIFY_SKIP_HTTP === "1" && process.env.VERIFY_HTTP !== "1");

  if (process.env.VERIFY_STRICT_ENV === "1") {
    console.log("[VERIFY] [ENV] validate-env.mjs (estrito, 64 chars)…");
    await run("node", ["server/scripts/validate-env.mjs"]);
  }

  console.log("[VERIFY] [SERVER] TypeScript (tsconfig.server.json)…");
  await run("node", [tscCli, "-p", "tsconfig.server.json", "--noEmit"]);

  console.log("[VERIFY] [DB] [REDIS] checagens de conexão…");
  await run("node", [tsxCli, "server/scripts/verify-system-checks.ts"], {
    env: process.env,
  });

  if (skipHttp) {
    console.log("[VERIFY] [SERVER] HTTP omitido (VERIFY_SKIP_HTTP=1 ou VERIFY_HTTP=0)");
    console.log("[VERIFY] OK — todas as etapas concluídas");
    return;
  }

  const port = Number(process.env.VERIFY_HTTP_PORT || "13099");
  console.log(`[VERIFY] [SERVER] subindo servidor em PORT=${port} (teste HTTP)…`);

  const child = spawn(
    "node",
    [tsxCli, "--import", "./instrument.ts", "server/index.ts"],
    {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "development",
      },
      stdio: "pipe",
      shell: false,
    }
  );

  let stderr = "";
  child.stderr?.on("data", (d) => {
    stderr += d.toString();
  });

  try {
    const code = await waitForHealth(port, 90000);
    console.log("[VERIFY] [SERVER] /api/health respondeu, status:", code);
  } finally {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    if (process.platform === "win32") {
      try {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          shell: true,
        });
      } catch {
        /* ignore */
      }
    }
  }

  console.log("[VERIFY] OK — todas as etapas passaram");
}

main().catch((e) => {
  console.error("[VERIFY] [ERROR]", e?.message || e);
  process.exit(1);
});
