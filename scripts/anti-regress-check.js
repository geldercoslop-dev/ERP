import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

const files = execSync("git diff --cached --name-only")
  .toString()
  .split("\n")
  .filter(Boolean);

let violation = false;

for (const file of files) {
  if (!existsSync(file)) continue;

  // Excluir scripts e guards das checagens (auto-bloqueio)
  if (file.includes("scripts/") || file.includes("guards/")) {
    continue;
  }

  const content = readFileSync(file, "utf-8");

  // 🔴 1. BLOQUEAR CAST INSEGURO (as any)
  // : any é tratado pelo phase0-guard para código crítico
  if (/\bas\s+any\b/.test(content)) {
    console.error(`
🚫 VIOLAÇÃO DE TIPAGEM

Uso de "as any" detectado em ${file}

Proibido cast inseguro.
Use tipagem correta.
`);
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

  // 🔴 4. DETECTAR IMPORT-TIME EXECUTION
  if (
    content.includes("setInterval(") ||
    content.includes("new ") ||
    content.includes(".start()")
  ) {
    if (!content.includes("function") && !file.includes("services")) {
      console.error(`
🚫 IMPORT-TIME EXECUTION DETECTADO em ${file}

Código executando no topo do arquivo.
Isso quebra o bootstrap.

Mover execução para dentro de função.
`);
      violation = true;
    }
  }

  // 🔴 5. BLOQUEAR USO DE ENV FORA DO LUGAR
  if (
    content.includes("getEnv(") &&
    !file.includes("_core") &&
    !file.includes("bootstrap")
  ) {
    console.error(`
🚫 VIOLAÇÃO DE ARQUITETURA

Uso de ENV fora do fluxo controlado em ${file}

Ordem obrigatória:
dotenv → bootstrap → env → runtime → services → server
`);
    violation = true;
  }
}

if (violation) {
  console.error("\n❌ ANTI-REGRESS BLOQUEOU O COMMIT\n");
  process.exit(1);
}

console.log("✔ Anti-regress OK");
