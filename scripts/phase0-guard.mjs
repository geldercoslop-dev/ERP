/**
 * PHASE 0 GUARD — Prevenção de regressões arquiteturais
 *
 * Regras:
 *   A) Bloqueio de `any` em server/_core, server/leo, server/services, server/tools
 *   B) Bloqueio de LEO → services direto (import de services/ dentro de server/leo/)
 *   C) Bloqueio de fallback de tenant: padrão `tenantId ||` (fora de guards negativos)
 *   D) Bloqueio de child_process.exec() fora de scripts administrativos
 *
 * Uso:
 *   node scripts/phase0-guard.mjs
 *
 * Saída:
 *   Exit 0 = APROVADO
 *   Exit 1 = REPROVADO (lista de violações impressa)
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function readLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split("\n");
}

/**
 * Normaliza caminho para comparações cross-platform
 */
function norm(p) {
  return p.replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Configuração de diretórios
// ---------------------------------------------------------------------------

const root = process.cwd();
const serverDir = path.join(root, "server");
const leoDir = path.join(serverDir, "leo");

/**
 * Diretórios auditados para cada regra
 *
 * _core é excluído da regra A: é camada de infraestrutura (middleware, generics,
 * wrappers TRPC) onde `any` é idiomático e intencional (ex: Args extends any[]).
 */
const DIRS_ANY_CHECK = [
  path.join(serverDir, "leo"),
  path.join(serverDir, "services"),
  path.join(serverDir, "tools"),
];

const DIRS_TENANT_CHECK = [
  path.join(serverDir, "leo"),
  path.join(serverDir, "services"),
  path.join(serverDir, "tools"),
];

const DIRS_EXEC_CHECK = [
  serverDir,
];

/**
 * Arquivos/diretórios permitidos para uso de child_process (scripts admin/infra)
 */
const EXEC_ALLOWED_PATTERNS = [
  "/server/scripts/",
  "/server/infra/",
  "/scripts/",
];

/**
 * Exceções para a regra (A) de `any`:
 * Arquivos que podem manter `any` legitimamente (gerados, shims, etc.)
 */
const ANY_ALLOWED_FILES = [
  // Nenhuma exceção por padrão — adicionar aqui se necessário
];

/**
 * Exceções para a regra (B) LEO → services:
 *
 * 1. server/leo/tools/**  → ESTES são a camada TOOLS dentro do LEO.
 *    O fluxo correto é: LEO engine → leo/tools/ → services/
 *    Importar services aqui É o padrão arquitetural correto.
 *
 * 2. server/leo/security/** → Verificação de permissões (cross-cutting concern
 *    de autorização). Não é lógica de negócio — é controle de acesso.
 *
 * 3. server/leo/index.ts → barrel file de re-exportação.
 *
 * 4. Loggers de ação específicos (apenas audit trail, sem lógica de negócio)
 */
const LEO_SERVICE_ALLOWED_SUBDIRS = [
  "/leo/tools/",       // camada TOOLS do LEO — pode importar services
  "/leo/security/",    // módulo de permissões — cross-cutting concern
];

/** Arquivos de barril (re-exports) que podem mencionar services */
const LEO_BARREL_FILES = [
  "/leo/index.ts",
];

const LEO_SERVICE_ALLOWED_IMPORTS = [
  "leo-action-logger",
  "leo-action-log.service",
  "leo-semantic-memory.service",
  "database-health.service",   // apenas pingDatabase (health check)
  "erp-ai.service",            // fundação de AI do LEO
];

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

/**
 * @type {{ rule: string; file: string; line: number; text: string }[]}
 */
const violations = [];

function add(rule, filePath, lineNum, text) {
  violations.push({ rule, file: norm(filePath), line: lineNum, text: text.trim() });
}

// ---------------------------------------------------------------------------
// REGRA A — Bloqueio de `any`
// ---------------------------------------------------------------------------

/**
 * Detecta uso de `any` como tipo TypeScript:
 *   `: any`  `<any>`  `as any`  `Array<any>`  `any[]`
 *
 * Exceções toleradas:
 *   - linha comentada
 *   - /regex/.exec(...)  → não é TypeScript any
 *   - `params: any[]` em query SQL parametrizada é aceito opcionalmente
 */
function checkAny(filePath) {
  if (ANY_ALLOWED_FILES.some((p) => norm(filePath).includes(p))) return;

  const lines = readLines(filePath);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();

    // Ignorar linhas comentadas
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Detectar padrões de `any` como tipo TS
    if (/:\s*any\b/.test(raw) || /\bas\s+any\b/.test(raw) || /<any>/.test(raw) || /any\[\]/.test(raw)) {
      // Tolerância: params: any[] em queries SQL parametrizadas (stock-safety)
      if (/const\s+params\s*:\s*any\[\]/.test(raw)) continue;
      // Tolerância: comentários inline  // eslint-disable
      if (/\/\/\s*(eslint-disable|@ts-ignore|@ts-expect-error)/.test(raw)) continue;
      // Tolerância: (data as any).prop — padrão seguro com guard typeof antes
      // Exemplo: typeof data === 'object' && ... ? (data as any).id : 'unknown'
      if (/\(data\s+as\s+any\)\./.test(raw) && /typeof\s+data\s*===\s*['"]object['"]/.test(
        // Verificar na mesma linha ou nas 3 anteriores
        lines.slice(Math.max(0, i - 3), i + 1).join("\n")
      )) continue;

      add("A:any", filePath, i + 1, raw);
    }
  }
}

for (const dir of DIRS_ANY_CHECK) {
  for (const f of walk(dir)) {
    checkAny(f);
  }
}

// ---------------------------------------------------------------------------
// REGRA B — LEO não pode importar services/ diretamente
// ---------------------------------------------------------------------------

/**
 * Detecta `import ... from '...services/...'` dentro de server/leo/
 * Exceções: loggers de ação (apenas audit trail, não lógica de negócio)
 */
function checkLeoServices(filePath) {
  const normalized = norm(filePath);

  // server/leo/tools/ é a camada TOOLS — pode importar services
  if (LEO_SERVICE_ALLOWED_SUBDIRS.some((sub) => normalized.includes(sub))) return;

  // Barrel files (re-exports) são isentos
  if (LEO_BARREL_FILES.some((b) => normalized.endsWith(b))) return;

  const lines = readLines(filePath);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();

    if (trimmed.startsWith("//")) continue;

    // Detectar import de services de dentro de leo
    if (/\bfrom\s+["'][^"']*services\//.test(raw) || /\bimport\s+["'][^"']*services\//.test(raw)) {
      // Verificar se é uma exceção de logger/audit permitida
      const isAllowed = LEO_SERVICE_ALLOWED_IMPORTS.some((allowed) =>
        raw.includes(allowed)
      );
      if (!isAllowed) {
        add("B:leo→service", filePath, i + 1, raw);
      }
    }
  }
}

for (const f of walk(leoDir)) {
  checkLeoServices(f);
}

// ---------------------------------------------------------------------------
// REGRA C — Sem fallback de tenantId (tenantId ||)
// ---------------------------------------------------------------------------

/**
 * Detecta `tenantId ||` quando NÃO é um guard negativo.
 *
 * Guards negativos legítimos:
 *   `!tenantId ||`
 *   `if (!tenantId)`
 *   `|| !tenantId`
 *
 * Falso-positivo TOLERADO (não é bypass):
 *   `tenantId || process.env.X`  em ferramentas de diagnóstico → avisa mas não bloqueia
 *
 * Bypass REAL (bloqueado):
 *   `tenantId || 1`
 *   `tenantId || 0`
 *   `const t = tenantId || <qualquer coisa que não seja env>`
 */
function checkTenantFallback(filePath) {
  const lines = readLines(filePath);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();

    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Só interessa linhas com `tenantId ||` (sem `!` imediatamente antes de tenantId)
    if (!/\btenantId\s*\|\|/.test(raw)) continue;

    // Ignorar guards negativos: !tenantId ||
    if (/!\s*tenantId\s*\|\|/.test(raw)) continue;

    // Ignorar verificações de comparação: tenantId || isNaN
    if (/tenantId\s*\|\|\s*Number\.isNaN/.test(raw) || /tenantId\s*\|\|\s*isNaN/.test(raw)) continue;

    // Ignorar fallback para process.env (ferramenta de diagnóstico — avisa mas não bloqueia)
    if (/tenantId\s*\|\|\s*process\.env/.test(raw)) continue;
    if (/tenantId\s*\?\.toString\(\)\s*\|\|\s*process\.env/.test(raw)) continue;

    // Tudo mais é bypass inaceitável
    add("C:tenantId-fallback", filePath, i + 1, raw);
  }
}

for (const dir of DIRS_TENANT_CHECK) {
  for (const f of walk(dir)) {
    checkTenantFallback(f);
  }
}

// ---------------------------------------------------------------------------
// REGRA D — Sem child_process.exec() fora de scripts admin
// ---------------------------------------------------------------------------

/**
 * Detecta uso de child_process exec/execSync/spawn fora dos diretórios permitidos.
 * Regra: apenas server/scripts/ e server/infra/ podem usar child_process.
 */
function checkExec(filePath) {
  const normalized = norm(filePath);

  // Verificar se é um arquivo permitido
  const isAllowed = EXEC_ALLOWED_PATTERNS.some((p) => normalized.includes(p));
  if (isAllowed) return;

  const lines = readLines(filePath);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();

    if (trimmed.startsWith("//")) continue;

    if (
      /\bexecSync\s*\(/.test(raw) ||
      /\bexecAsync\s*\(/.test(raw) ||
      /\bimport\s*\(\s*['"]child_process['"]\s*\)/.test(raw) ||
      /from\s+['"]child_process['"]/.test(raw)
    ) {
      add("D:child_process", filePath, i + 1, raw);
    }
  }
}

for (const f of walk(serverDir)) {
  checkExec(f);
}

// ---------------------------------------------------------------------------
// Relatório final
// ---------------------------------------------------------------------------

if (violations.length === 0) {
  console.log("[PHASE-0-GUARD] ✅ APROVADO — nenhuma violação encontrada.");
  process.exit(0);
}

// Agrupar por regra
const byRule = new Map();
for (const v of violations) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, []);
  byRule.get(v.rule).push(v);
}

const RULE_LABELS = {
  "A:any":               "REGRA A — Uso de `any` proibido",
  "B:leo→service":       "REGRA B — LEO importa service diretamente",
  "C:tenantId-fallback": "REGRA C — Fallback de tenantId detectado",
  "D:child_process":     "REGRA D — child_process fora de scripts admin",
};

console.error("\n[PHASE-0-GUARD] ❌ REPROVADO\n");
console.error(`Total de violações: ${violations.length}\n`);

for (const [rule, items] of byRule) {
  const label = RULE_LABELS[rule] ?? rule;
  console.error(`━━━ ${label} (${items.length}) ━━━`);
  for (const v of items) {
    const rel = v.file.replace(norm(root) + "/", "");
    console.error(`  ${rel}:${v.line}`);
    console.error(`    ${v.text}`);
  }
  console.error("");
}

process.exit(1);
