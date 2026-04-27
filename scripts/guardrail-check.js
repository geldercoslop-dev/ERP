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

// Arquivos específicos permitidos SE drizzle-schema-guard passar
const ALLOWED_SCHEMA_FILES = [
  "drizzle/relations.ts",
  "shared/types/entities.ts",
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

function isOnlyAllowedSchemaFiles(violations) {
  // Se não há violações, retorna true
  if (violations.length === 0) return true;

  // Verifica se todas as violações são arquivos permitidos
  return violations.every(file => ALLOWED_SCHEMA_FILES.includes(file));
}

function runDrizzleSchemaGuard() {
  try {
    console.log("\n🔍 Executando drizzle-schema-guard.mjs...");
    execSync("node scripts/drizzle-schema-guard.mjs", { stdio: "inherit" });
    console.log("✓ drizzle-schema-guard passou\n");
    return true;
  } catch (e) {
    console.error("\n✗ drizzle-schema-guard falhou\n");
    return false;
  }
}

function main() {
  const files = getChangedFiles();

  const violations = checkBlocked(files);

  if (violations.length > 0) {
    // Verifica se são apenas os arquivos permitidos
    if (isOnlyAllowedSchemaFiles(violations)) {
      console.log("\n📋 Arquivos de schema/types detectados:");
      violations.forEach(f => console.log(" - " + f));
      console.log();

      // Executa drizzle-schema-guard
      if (runDrizzleSchemaGuard()) {
        console.log("✔ Guardrail OK — arquivos permitidos validados");
        return;
      } else {
        console.error("\nDOC BLOQUEADO — drizzle-schema-guard falhou\n");
        process.exit(1);
      }
    }

    // Bloqueia outros arquivos
    console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
    console.error("Arquivos bloqueados modificados:\n");

    violations.forEach(f => console.error(" - " + f));

    console.error("\nDOC BLOQUEADO — ALTERAÇÃO NÃO PERMITIDA\n");

    process.exit(1);
  }

  console.log("✔ Guardrail OK — nenhuma violação");
}

main();
