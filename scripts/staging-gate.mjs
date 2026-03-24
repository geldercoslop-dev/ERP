#!/usr/bin/env node
import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const cmd = isWin
  ? ["powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/staging-gate.ps1"]]
  : ["bash", ["./scripts/staging-gate.sh"]];

const child = spawn(cmd[0], cmd[1], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("[staging-gate] failed to start:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
