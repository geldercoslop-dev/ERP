import { execSync } from "child_process";

const BLOCKED_PATHS = [
  "server/_core",
  "server/bootstrap",
  "server/config",
  "server/security",
  "shared",
  "drizzle",
  "migrations",
];

function getChangedFiles() {
  try {
    const output = execSync("git diff --cached --name-only").toString();
    return output.split("\n").filter(Boolean);
  } catch (e) {
    console.error("Erro ao obter arquivos alterados");
    process.exit(1);
  }
}

function checkBlocked(files) {
  const violations = [];

  for (const file of files) {
    for (const blocked of BLOCKED_PATHS) {
      if (file.startsWith(blocked)) {
        violations.push(file);
      }
    }
  }

  return violations;
}

function main() {
  const files = getChangedFiles();

  const violations = checkBlocked(files);

  if (violations.length > 0) {
    console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
    console.error("Arquivos bloqueados modificados:\n");

    violations.forEach(f => console.error(" - " + f));

    console.error("\nDOC BLOQUEADO — ALTERAÇÃO NÃO PERMITIDA\n");

    process.exit(1);
  }

  console.log("✔ Guardrail OK — nenhuma violação");
}

main();
