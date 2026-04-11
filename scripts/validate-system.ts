import { execSync } from "node:child_process";

const run = (cmd: string) => {
  execSync(cmd, { stdio: "inherit" });
};

try {
  run("pnpm exec tsc -p tsconfig.server.json --noEmit");
  run("pnpm exec eslint . --ext .ts");
  process.exit(0);
} catch {
  process.exit(1);
}
