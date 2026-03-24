/**
 * Anti-regressão — idempotência / concorrência (delega ao Vitest).
 * Uso: pnpm exec tsx util/test/concurrency-test.ts
 *       (ou: pnpm vitest run server/services/core-business-real.test.ts)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function main(): void {
  const r = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vitest", "run", "server/services/core-business-real.test.ts", "--reporter=dot"],
    { cwd: root, stdio: "inherit", shell: false }
  );
  process.exit(r.status ?? 1);
}

main();
