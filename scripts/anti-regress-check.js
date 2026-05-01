import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

const files = execSync("git diff --cached --name-only")
  .toString()
  .split("\n")
  .filter(Boolean);

let violation = false;

// 🔵 ARQUIVOS DE INFRA DB LEGÍTIMOS
// Exceção explícita para arquivos de configuração de banco que gerenciam pools
const ALLOWED_DB_INFRA_FILES = new Set([
  "server/config/database.ts"
]);

for (const file of files) {
  if (!existsSync(file)) continue;

  // Excluir scripts e guards das checagens (auto-bloqueio)
  if (file.includes("scripts/") || file.includes("guards/")) {
    continue;
  }

  // Ignorar arquivos de documentação (falsos positivos em texto descritivo)
  if (file.endsWith(".md") || file.startsWith("docs/")) {
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
    !ALLOWED_DB_INFRA_FILES.has(file) &&
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
    // Suspicious: setInterval, setTimeout, .start(), new X() at import time
    // Safe new X() inside: class methods, functions, async functions, arrow functions, object methods
    const suspiciousPatterns = /setInterval\s*\(|setTimeout\s*\(|\.start\s*\(|new\s+[A-Z][a-zA-Z0-9_]*\s*\(/;

    const lines = content.split("\n");
    let braceDepth = 0;
    const boundaryStack = []; // Stack of brace depths where functions/classes start
    let pendingFunctionBoundary = null; // For multiline function declarations
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

      // Count braces to track execution context for import-time guard
      const openBraces = (codeWithoutStrings.match(/\{/g) || []).length;
      const closeBraces = (codeWithoutStrings.match(/\}/g) || []).length;

      // Check if this line completes a pending multiline function declaration
      if (pendingFunctionBoundary !== null && openBraces > 0) {
        boundaryStack.push(pendingFunctionBoundary);
        pendingFunctionBoundary = null;
      }

      // BEFORE updating braceDepth: check if this line starts a function boundary
      // A line starts a function/class scope if it matches function patterns AND has an opening brace
      const functionStartPatterns = [
        /\bexport\s+(async\s+)?function\b/,
        /\b(async\s+)?function\s+\w+\s*\(/,
        /\bclass\s+\w+\b/,
        /\bconstructor\s*\(/,
        /\b(method|get|set)\s+\w+\s*\(/,
        /=>\s*\{/,
        /:\s*(async\s*)?\([^)]*\)\s*=>\s*\{/,
        /:\s*(async\s*)?\([^)]*\)\s*\{/,
        /\b\w+\s*:\s*(async\s*)?\([^)]*\)\s*=>\s*\{/,
        /\b\w+\s*:\s*(async\s*)?function\s*\(/,
      ];

      let hasFunctionBoundary = false;
      for (const pattern of functionStartPatterns) {
        if (pattern.test(codeWithoutStrings) && openBraces > 0) {
          hasFunctionBoundary = true;
          break;
        }
      }

      // Check for function declarations that may span multiple lines (brace on next line)
      // These patterns detect function declarations where the { is on a subsequent line
      const functionDeclPatterns = [
        /\bexport\s+(async\s+)?function\s+\w+\s*\(/,
        /\b(async\s+)?function\s+\w+\s*\(/,
      ];
      let hasFunctionDeclStart = false;
      for (const pattern of functionDeclPatterns) {
        if (pattern.test(codeWithoutStrings)) {
          hasFunctionDeclStart = true;
          break;
        }
      }

      // If function decl starts on this line but brace is NOT here, mark as pending
      if (hasFunctionDeclStart && openBraces === 0) {
        pendingFunctionBoundary = braceDepth;
      }

      // Check for arrow function with brace on same line: const x = () => {
      const arrowWithBrace = /=>\s*\{/.test(codeWithoutStrings);

      // Check for object method with brace: { method() { or { async method() {
      const objectMethod = /:\s*(async\s+)?\w+\s*\([^)]*\)\s*\{/.test(codeWithoutStrings) ||
                           /\b\w+\s*:\s*(async\s+)?\([^)]*\)\s*\{/.test(codeWithoutStrings) ||
                           /\b\w+\s*:\s*function\s*\(/.test(codeWithoutStrings);

      // Check for class method: methodName() { or async methodName() {
      const classMethod = /^\s*(async\s+)?\w+\s*\([^)]*\)\s*\{/.test(codeWithoutStrings) ||
                          /^\s*\*?\w+\s*\([^)]*\)\s*\{/.test(codeWithoutStrings);

      if ((hasFunctionBoundary || arrowWithBrace || objectMethod || classMethod) && openBraces > 0) {
        // This line starts a new function scope
        // Push the current braceDepth (before this line's braces are counted)
        // because the code INSIDE will be at braceDepth + 1 or more
        boundaryStack.push(braceDepth);
      }

      // Update brace depth
      braceDepth += openBraces - closeBraces;
      if (braceDepth < 0) braceDepth = 0;

      // Pop boundaries that have been closed
      while (boundaryStack.length > 0 && braceDepth <= boundaryStack[boundaryStack.length - 1]) {
        boundaryStack.pop();
      }

      // Check suspicious patterns
      const suspiciousMatch = codeWithoutStrings.match(suspiciousPatterns);
      if (suspiciousMatch) {
        const suspiciousIndex = suspiciousMatch.index;

        // Check if there's a function boundary on this same line BEFORE the suspicious pattern
        let hasPriorBoundary = false;
        for (const pattern of functionStartPatterns) {
          const match = codeWithoutStrings.match(pattern);
          if (match && match.index < suspiciousIndex) {
            hasPriorBoundary = true;
            break;
          }
        }

        // VIOLATION if: not inside any function AND no boundary on same line before it
        if (!hasPriorBoundary && boundaryStack.length === 0) {
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
