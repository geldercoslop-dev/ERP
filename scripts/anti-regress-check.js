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
  if (!file.endsWith(".md") && !file.startsWith("docs/") && !file.includes("services")) {
    const suspiciousPatterns = /setInterval\s*\(|setTimeout\s*\(|\.start\s*\(|new\s+/;
    const safeBoundaries = [
      /\bfunction\b/,
      /=>/,
      /\.query\s*\(/,
      /\.mutation\s*\(/,
      /\.use\s*\(/,
      /router\s*\(\{/,
      /createTRPCRouter\s*\(/,
      /Router\s*\(\)/
    ];

    const lines = content.split("\n");
    let braceDepth = 0;
    let lastSafeBoundaryDepth = -1;
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Track block comments
      if (line.includes("/*")) inBlockComment = true;
      if (line.includes("*/")) {
        inBlockComment = false;
        continue;
      }
      if (inBlockComment) continue;

      // Ignore line comments for analysis
      const codePart = line.split("//")[0];
      if (!codePart.trim()) continue;

      // Remove string literals to avoid false positives
      const codeWithoutStrings = codePart
        .replace(/(['"`])(?:(?!\1|\\).|\\.)*\1/g, "");

      // Check for safe boundaries before counting braces on this line
      for (const boundary of safeBoundaries) {
        if (boundary.test(codeWithoutStrings)) {
          lastSafeBoundaryDepth = braceDepth;
        }
      }

      // Count braces (rough, acceptable for this guard)
      const openBraces = (codeWithoutStrings.match(/\{/g) || []).length;
      const closeBraces = (codeWithoutStrings.match(/\}/g) || []).length;
      braceDepth += openBraces - closeBraces;
      if (braceDepth < 0) braceDepth = 0;

      // If closed back to or below the boundary depth, invalidate
      if (lastSafeBoundaryDepth >= 0 && braceDepth <= lastSafeBoundaryDepth) {
        lastSafeBoundaryDepth = -1;
      }

      // Check suspicious patterns
      const suspiciousMatch = codeWithoutStrings.match(suspiciousPatterns);
      if (suspiciousMatch) {
        const suspiciousIndex = suspiciousMatch.index;
        let hasPriorBoundary = false;
        for (const boundary of safeBoundaries) {
          const boundaryMatch = codeWithoutStrings.match(boundary);
          if (boundaryMatch && boundaryMatch.index < suspiciousIndex) {
            hasPriorBoundary = true;
            break;
          }
        }
        if (!hasPriorBoundary && lastSafeBoundaryDepth < 0) {
          console.error(`
🚫 IMPORT-TIME EXECUTION DETECTADO em ${file} (linha ${i + 1})

Código executando no topo do arquivo.
Isso quebra o bootstrap.

Mover execução para dentro de função.
`);
          violation = true;
        }
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
