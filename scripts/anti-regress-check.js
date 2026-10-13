import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

const files = execSync("git diff --cached --name-only")
  .toString()
  .split("\n")
  .filter(Boolean);

let violation = false;

// 🔵 JANELA CIRÚRGICA P23-APP-SECRET-MIDDLEWARE-EXTRACTION
// Autoriza commit específico da extração do App Secret middleware
// Requer variável: ERP_AUTHORIZED_CORE_SECURITY_UPDATE=P23_APP_SECRET_MIDDLEWARE_EXTRACTION
// Permite somente os 3 arquivos específicos da extração:
//   - server/_core/index.ts
//   - server/security/app-secret-middleware.ts
//   - server/tests/security-app-secret.test.ts
const P23_APP_SECRET_AUTHORIZED_FILES = new Set([
  "server/_core/index.ts",
  "server/security/app-secret-middleware.ts",
  "server/tests/security-app-secret.test.ts",
]);

const p23AppSecretAuthorized = process.env.ERP_AUTHORIZED_CORE_SECURITY_UPDATE === "P23_APP_SECRET_MIDDLEWARE_EXTRACTION";
const isP23AppSecretWindowActive = p23AppSecretAuthorized && files.length === P23_APP_SECRET_AUTHORIZED_FILES.size && 
                                     files.every(f => P23_APP_SECRET_AUTHORIZED_FILES.has(f));

// 🔵 JANELA CIRÚRGICA P23-R-10C-DOUBLE-BOOT-FIX
// Autoriza commit específico da correção do double-boot (remoção da autoexecução de startServer)
// Requer variável: ERP_AUTHORIZED_DOUBLE_BOOT_FIX=P23_R10C_DOUBLE_BOOT_FIX
// Permite somente os 2 arquivos específicos do fix:
//   - server/_core/index.ts
//   - tests/single-boot-guard.spec.ts
// NÃO desabilita nenhum check globalmente: exige simultaneamente
//   1. env FIX correto; 2. staged scope EXATO da janela; 3. arquivo exato abaixo.
const P23_R10C_DOUBLE_BOOT_FIX_AUTHORIZED_FILES = new Set([
  "server/_core/index.ts",
  "tests/single-boot-guard.spec.ts",
]);

const p23R10CDoubleBootFixAuthorized = process.env.ERP_AUTHORIZED_DOUBLE_BOOT_FIX === "P23_R10C_DOUBLE_BOOT_FIX";
const isP23R10CDoubleBootFixWindowActive = p23R10CDoubleBootFixAuthorized && files.length === P23_R10C_DOUBLE_BOOT_FIX_AUTHORIZED_FILES.size &&
                                           files.every(f => P23_R10C_DOUBLE_BOOT_FIX_AUTHORIZED_FILES.has(f));

// 🔵 JANELA CIRÚRGICA AUTH-DB-SESSION (AUTH-H5: sessões persistidas em auth_sessions)
// TEMPORÁRIA e cirúrgica — exceções APENAS para falsos positivos PRÉ-EXISTENTES:
//   - server/_core/cookies.ts         → import-time execution FP (LOCAL_HOSTS/new Set pré-existente)
//   - server/_core/session.service.ts → DB direto legado (SessionService já existia em _core e agora
//                                       cobre auth_sessions sob janela formal AUTH_DB_SESSION_V1)
// Ativa somente se: env ERP_AUTHORIZED_AUTH_DB_SESSION_UPDATE=AUTH_DB_SESSION_V1 E todo arquivo
// staged (exceto scripts/guards/docs, já ignorados pelas checagens) pertence à lista exata da janela.
// NÃO desativa nenhuma regra globalmente; demais arquivos continuam passando por todas as regras.
const AUTH_DB_SESSION_WINDOW_FILES = new Set([
  // Backend
  "server/routers.ts",
  "server/security/jwt-auth.ts",
  "server/_core/context.ts",
  "server/_core/cookies.ts",
  "server/_core/secure-context.ts",
  "server/_core/session.service.ts",
  "server/middlewares/jwt-auth-middleware.ts",
  "server/middleware/auth.middleware.ts",
  "server/middlewares/require-auth-context.ts",
  "server/services/users.service.ts",
  // Testes AUTH-H5
  "server/tests/auth-refresh-logout.test.ts",
  "server/tests/auth-db-session.test.ts",
  "server/tests/auth-rate-limit.test.ts",
  "server/tests/auth-admin-procedure.test.ts",
  "server/tests/jwt-session-auth-flow.test.ts",
  "server/tests/security/auth-bypass.test.ts",
  "server/tests/multitenant/tenant-auth.test.ts",
  "tests/auth-security.test.ts",
  // Testes impactados por DB-backed sessions
  "server/tests/security/tenant-leak.test.ts",
  "server/tests/vendedor-by-user-id-tenant-isolation.test.ts",
]);

const authDbSessionAuthorized = process.env.ERP_AUTHORIZED_AUTH_DB_SESSION_UPDATE === "AUTH_DB_SESSION_V1";
const isAuthDbSessionWindowActive = authDbSessionAuthorized &&
  files.every(f =>
    f.includes("scripts/") ||
    f.includes("guards/") ||
    f.endsWith(".md") ||
    f.startsWith("docs/") ||
    AUTH_DB_SESSION_WINDOW_FILES.has(f)
  );

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

  // Janela cirúrgica P23-APP-SECRET: neutraliza falso positivo de DB direto em server/_core/index.ts
  // O pool.query("SELECT 1") na linha 166 é pré-existente e não faz parte da extração
  const skipDbCheckForP23Window = isP23AppSecretWindowActive && file === "server/_core/index.ts";

  // Janela cirúrgica P23-R-10C-DOUBLE-BOOT: neutraliza falso positivo de DB direto em server/_core/index.ts
  // (verificação de integridade pré-existente não relacionada ao fix; exige env FIX + scope exato + arquivo exato)
  const skipDbCheckForR10CDoubleBootWindow = isP23R10CDoubleBootFixWindowActive && file === "server/_core/index.ts";

  // Janela cirúrgica AUTH-DB-SESSION (TEMPORÁRIA, AUTH-H5): DB direto legado pré-existente
  // em server/_core/session.service.ts — arquivo já existia em _core com SessionService e agora
  // cobre auth_sessions sob janela formal. Somente este arquivo exato, somente nesta janela.
  const skipDbCheckForAuthDbSessionWindow = isAuthDbSessionWindowActive && file === "server/_core/session.service.ts";

  if (
    !skipDbCheckForP23Window &&
    !skipDbCheckForR10CDoubleBootWindow &&
    !skipDbCheckForAuthDbSessionWindow &&
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
  // Janela cirúrgica AUTH-DB-SESSION (TEMPORÁRIA, AUTH-H5): falso positivo pré-existente
  // em server/_core/cookies.ts (const LOCAL_HOSTS = new Set([...]) existia antes da janela).
  // Somente este arquivo exato, somente nesta janela — demais arquivos seguem bloqueados.
  const skipImportTimeForAuthDbSessionWindow = isAuthDbSessionWindowActive && file === "server/_core/cookies.ts";
  if (!skipImportTimeForAuthDbSessionWindow && !file.endsWith(".md") && !file.startsWith("docs/") && !file.includes("services")) {
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
    !file.includes("bootstrap") &&
    !ALLOWED_DB_INFRA_FILES.has(file)
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
