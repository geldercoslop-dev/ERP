/**
 * Roda a suíte anti-regressão (manual).
 * Uso: pnpm exec tsx util/test/run-all.ts
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function sh(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  return (r.status ?? 1) === 0;
}

function main(): void {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const ok =
    sh(pnpm, ["exec", "tsx", "util/test/leo-test.ts"]) &&
    sh(pnpm, ["exec", "tsx", "util/test/db-stress-test.ts"]) &&
    sh(pnpm, [
      "exec",
      "vitest",
      "run",
      "server/tests/leo-session-gate.test.ts",
      "server/services/core-business-real.test.ts",
      "--reporter=dot",
    ]);

  process.exit(ok ? 0 : 1);
}

main();
