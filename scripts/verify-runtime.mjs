import http from "node:http";
import { spawn } from "node:child_process";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("timeout")));
  });
}

async function main() {
  const port = Number(process.env.PORT || 3000);
  const url = `http://127.0.0.1:${port}/health`;

  console.error("[VERIFY] starting dist/server/index.js...");
  const child = spawn(process.execPath, ["dist/server/index.js"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
  });

  let exited = false;
  let stderr = "";
  child.stderr.on("data", (b) => {
    stderr += b.toString("utf8");
  });
  child.on("exit", (code) => {
    exited = true;
    console.error(`[VERIFY] process exited early with code ${code}`);
  });

  // Espera o /health responder OK por até 15s
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (exited) break;
    try {
      const res = await get(url);
      if (res.statusCode === 200) {
        console.error("[VERIFY] /health OK");
        child.kill("SIGTERM");
        await sleep(300);
        process.exit(0);
      }
    } catch {
      // ignore until deadline
    }
    await sleep(500);
  }

  child.kill("SIGTERM");
  await sleep(300);
  console.error("[VERIFY] failed: /health did not become OK");
  if (stderr.trim()) console.error("[VERIFY][stderr]", stderr.slice(-4000));
  process.exit(1);
}

main().catch((e) => {
  console.error("[VERIFY] fatal:", e);
  process.exit(1);
});

