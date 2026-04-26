import { execSync } from "child_process";

const files = execSync("git diff --cached --name-only")
  .toString()
  .split("\n")
  .filter(Boolean);

let violation = false;

for (const file of files) {
  const content = execSync(`git show :${file}`).toString();

  // 🔴 1. BLOQUEAR ANY (GLOBAL)
  if (content.includes(" as any") || content.includes(": any")) {
    console.error(`🚫 ANY DETECTADO em ${file}`);
    violation = true;
  }

  // 🔴 2. BLOQUEAR DB FORA DE SERVICES
  if (
    !file.startsWith("server/services") &&
    (
      /(^|[^a-zA-Z0-9_])db\./.test(content) ||
      /(^|[^a-zA-Z0-9_])query\s*\(/.test(content)
    )
  ) {
    console.error(`🚫 ACESSO DIRETO AO DB FORA DE SERVICE: ${file}`);
    violation = true;
  }

  // 🔴 3. BLOQUEAR IMPORT DIRETO DE SHARED
  if (
    content.includes("../../shared/") &&
    !content.includes("../../shared/types")
  ) {
    console.error(`🚫 IMPORT DIRETO PROIBIDO EM ${file}`);
    violation = true;
  }
}

if (violation) {
  console.error("\n❌ ANTI-REGRESS BLOQUEOU O COMMIT\n");
  process.exit(1);
}

console.log("✔ Anti-regress OK");
