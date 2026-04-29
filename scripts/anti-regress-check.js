import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

// First, check if this is a massive .pnpm-store deletion
// If so, skip anti-regress check since it's just cache cleanup
try {
  const numstatOutput = execSync("git diff --cached --numstat -- .pnpm-store", {
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 50 * 1024 * 1024
  }).toString();
  const numstatLines = numstatOutput.split("\n").filter(Boolean);
  
  if (numstatLines.length > 0) {
    // Check if there are any non-deleted files outside .pnpm-store (excluding scripts/.husky)
    const nonDeleteOutput = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024
    }).toString();
    const nonDeleteFiles = nonDeleteOutput.split("\n").filter(Boolean);
    const outsideFiles = nonDeleteFiles.filter(f => !f.startsWith(".pnpm-store/") && !f.startsWith("scripts/") && !f.startsWith(".husky/"));
    
    if (outsideFiles.length === 0) {
      // Only .pnpm-store deletions (with allowed script changes) - skip anti-regress check
      console.log("✔ Anti-regress OK (skipped for .pnpm-store cleanup)");
      process.exit(0);
    }
  }
} catch (e) {
  // Proceed to normal flow if check fails
}

const files = execSync("git diff --cached --name-only", {
  stdio: ['pipe', 'pipe', 'pipe'],
  maxBuffer: 50 * 1024 * 1024
})
  .toString()
  .split("\n")
  .filter(Boolean);

// Filter out .pnpm-store files from normal check
const filteredFiles = files.filter(f => !f.startsWith(".pnpm-store/"));

let violation = false;

for (const file of filteredFiles) {
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
  // Remove string literals before checking to avoid false positives on metadata like 'db.operation'
  const contentWithoutStrings = content
    .replace(/(['"`])(?:(?!\1|\\).|\\.)*\1/g, '') // Remove single, double, and backtick strings
    .replace(/`[^`]*`/g, ''); // Remove template literals (extra safety)

  if (
    !file.startsWith("server/services") &&
    (
      /(^|[^a-zA-Z0-9_])db\./.test(contentWithoutStrings) ||
      /(^|[^a-zA-Z0-9_])db\.query\s*\(/.test(contentWithoutStrings) ||
      /(^|[^a-zA-Z0-9_])conn\.query\s*\(/.test(contentWithoutStrings) ||
      /(^|[^a-zA-Z0-9_])connection\.query\s*\(/.test(contentWithoutStrings) ||
      /(^|[^a-zA-Z0-9_])pool\.query\s*\(/.test(contentWithoutStrings)
    )
  ) {
    console.error(`🚫 ACESSO DIRETO AO DB FORA DE SERVICE: ${file}`);
    violation = true;
  }

  // 🔴 3. BLOQUEAR IMPORT DIRETO DE SHARED
  // Exceções permitidas:
  // - idempotency.js contém apenas type guards simples
  // - const.js contém constantes compartilhadas
  // - _core/errors.js contém tipos de erro compartilhados
  if (
    content.includes("../../shared/") &&
    !content.includes("../../shared/types") &&
    !content.includes("../../shared/idempotency.js") &&
    !content.includes("../../shared/const.js") &&
    !content.includes("../../shared/_core/errors.js")
  ) {
    console.error(`🚫 IMPORT DIRETO PROIBIDO EM ${file}`);
    violation = true;
  }

  // 🔴 4. DETECTAR IMPORT-TIME EXECUTION
  // Ignorar arquivos markdown e docs
  if (!file.endsWith(".md") && !file.startsWith("docs/")) {
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
  }

  // 🔴 6. BLOQUEAR IMPORT DIRETO DE server/pdf.ts (LEGACY)
  // server/pdf.ts é legado com DB direto e sem tenant-aware.
  // Novo uso DEVE usar server/services/reports/pdf.service.ts.
  // Exceção: o próprio server/pdf.ts pode existir.
  if (!file.endsWith("server/pdf.ts") && !file.endsWith("server/pdf.js")) {
    const pdfImportMatches = content.match(/from\s+["'][^"']*pdf\.js["']/g) || [];
    const legacyPdfImports = pdfImportMatches.filter(m => !m.includes("pdf.service.js"));
    if (legacyPdfImports.length > 0) {
      console.error(`
🚫 IMPORT DE LEGACY PDF BLOQUEADO

Uso de server/pdf.ts legado detectado em ${file}
Imports bloqueados: ${legacyPdfImports.join(", ")}

server/pdf.ts é LEGADO com DB direto e sem tenant-aware.
Use: server/services/reports/pdf.service.ts (tenant-aware)
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
