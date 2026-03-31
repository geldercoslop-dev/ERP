import fs from "node:fs";
import path from "node:path";

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile() && (p.endsWith(".ts") || p.endsWith(".js"))) acc.push(p);
  }
  return acc;
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function fail(title, items) {
  console.error(`[ARCH] ${title}`);
  for (const it of items.slice(0, 40)) console.error("[ARCH] " + it);
  process.exit(1);
}

async function main() {
  const root = process.cwd();
  const server = path.join(root, "server");

  const leoDir = path.join(server, "leo");
  const servicesDir = path.join(server, "services");
  const envSchema = path.join(servicesDir, "env.schema.ts");

  const leoFiles = walk(leoDir);
  const serviceFiles = walk(servicesDir);
  const allServerFiles = walk(server);

  const leoViolations = [];
  for (const f of leoFiles) {
    const c = read(f);
    if (/\bfrom\s+["'][^"']*\/db\//.test(c) || /\bfrom\s+["']\.\.\/db\//.test(c) || /\bfrom\s+["']\.\.\/\.\.\/db\//.test(c)) {
      leoViolations.push(`${f}: LEO não pode importar DB`);
    }
  }
  if (leoViolations.length) fail("violação: LEO → DB", leoViolations);

  const servicesViolations = [];
  for (const f of serviceFiles) {
    // Exceções: serviços "de LEO" (ponte) podem depender de server/leo por design do projeto.
    // A regra é impedir que serviços de domínio/infra "normais" puxem LEO.
    const normalized = f.replace(/\\/g, "/");
    if (normalized.includes("/server/services/leo/")) continue;
    if (normalized.includes("/server/services/ai/")) continue;
    if (normalized.includes("/server/services/leo-")) continue;
    if (normalized.includes("/server/services/leo.")) continue;
    if (normalized.includes("/server/services/leo_")) continue;
    if (normalized.endsWith("/server/services/system-monitor.ts")) continue;

    const c = read(f);
    if (/\bfrom\s+["'][^"']*\/leo\//.test(c) || /\bfrom\s+["']\.\.\/leo\//.test(c) || /\bfrom\s+["']\.\.\/\.\.\/leo\//.test(c)) {
      servicesViolations.push(`${f}: SERVICES não pode importar LEO`);
    }
  }
  if (servicesViolations.length) fail("violação: SERVICES → LEO", servicesViolations);

  // Proíbe uso direto de process.env para as 4 variáveis críticas fora do env.schema.ts
  const envViolations = [];
  for (const f of allServerFiles) {
    if (path.resolve(f) === path.resolve(envSchema)) continue;
    const normalized = f.replace(/\\/g, "/");
    if (normalized.includes("/server/scripts/")) continue;
    if (normalized.includes("/server/examples/")) continue;
    if (normalized.includes("/server/infra/backup/")) continue;
    if (normalized.endsWith("/server/_core/loadEnv.ts")) continue;
    const c = read(f);
    const m = c.match(/\bprocess\.env\.(JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|DATABASE_URL|REDIS_URL)\b/);
    if (m) envViolations.push(`${f}: uso proibido de process.env.${m[1]} (use parseEnv)`);
  }
  if (envViolations.length) fail("violação: process.env direto (vars críticas)", envViolations);

  console.error("[ARCH] ok");
}

main().catch((e) => {
  console.error("[ARCH] fatal:", e);
  process.exit(1);
});

