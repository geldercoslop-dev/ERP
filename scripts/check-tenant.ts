import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { format } from 'node:util';

const writeOut = (...args: unknown[]): void => {
  process.stdout.write(format(...args) + "\n");
};

const writeErr = (...args: unknown[]): void => {
  process.stderr.write(format(...args) + "\n");
};
const ROOT = "server";
const BASELINE_FILE = "scripts/check-tenant-baseline.json";
const EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_SEGMENTS = new Set(["node_modules", "dist", "build", ".git"]);

type Finding = {
  file: string;
  line: number;
  message: string;
  excerpt: string;
};

function normalizeFilePath(file: string): string {
  return file.replace(/\\/g, "/");
}

function findingKey(finding: Pick<Finding, "file" | "message">): string {
  return `${normalizeFilePath(finding.file)}::${finding.message}`;
}

function loadBaseline(): Set<string> {
  try {
    const raw = readFileSync(BASELINE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_SEGMENTS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
      continue;
    }

    const ext = full.slice(full.lastIndexOf("."));
    if (EXTENSIONS.has(ext)) out.push(full);
  }
  return out;
}

function lineOf(source: string, index: number): number {
  if (index <= 0) return 1;
  return source.slice(0, index).split("\n").length;
}

function getLineText(source: string, line: number): string {
  const lines = source.split("\n");
  return (lines[line - 1] ?? "").trim();
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!modifiers?.some((m: ts.ModifierLike) => m.kind === kind);
}

function isTenantFirstParam(param: ts.ParameterDeclaration | undefined): boolean {
  if (!param) return false;
  if (!ts.isIdentifier(param.name)) return false;
  if (!param.name.text.startsWith("tenantId")) return false;
  if (param.questionToken) return false;
  return true;
}

function pushFindingFromNode(
  findings: Finding[],
  file: string,
  source: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  fnName: string
): void {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  findings.push({
    file,
    line,
    message: `Exported function '${fnName}' must start with tenantId as first required parameter`,
    excerpt: getLineText(source, line),
  });
}

function checkExportedFunctions(file: string, source: string): Finding[] {
  const findings: Finding[] = [];

  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
      const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
      if (!isExported && !isDefault) continue;

      if (!isTenantFirstParam(statement.parameters[0])) {
        const fnName = statement.name?.text ?? "default";
        pushFindingFromNode(findings, file, source, sourceFile, statement, fnName);
      }
      continue;
    }

    if (!ts.isVariableStatement(statement) || !hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      continue;
    }

    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;

      const isArrow = ts.isArrowFunction(decl.initializer);
      const isFnExpr = ts.isFunctionExpression(decl.initializer);
      if (!isArrow && !isFnExpr) continue;

      const params = decl.initializer.parameters;
      if (!isTenantFirstParam(params[0])) {
        pushFindingFromNode(findings, file, source, sourceFile, decl, decl.name.text);
      }
    }
  }

  return findings;
}

function isLeoFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  return normalized.startsWith("server/leo/") || normalized.includes("/server/leo/");
}

function isServiceImportPath(modulePath: string): boolean {
  const normalized = modulePath.replace(/\\/g, "/");
  if (normalized.includes("/services/")) return true;
  return normalized.startsWith("../services/") || normalized.startsWith("../../services/") || normalized.startsWith("../../../services/");
}

function checkLeoServiceImports(file: string, source: string): Finding[] {
  if (!isLeoFile(file)) return [];

  const findings: Finding[] = [];
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const modulePath = statement.moduleSpecifier.text;
    if (!isServiceImportPath(modulePath)) continue;

    const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
    findings.push({
      file,
      line,
      message: `Forbidden import in server/leo/**: '${modulePath}' (services import is not allowed)`,
      excerpt: getLineText(source, line),
    });
  }

  return findings;
}

function checkLeoDirectServiceAccess(file: string, source: string): Finding[] {
  if (!isLeoFile(file)) return [];

  const findings: Finding[] = [];
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const modulePath = statement.moduleSpecifier.text.replace(/\\/g, "/");
    const isForbiddenPath = modulePath.startsWith("../services/") || modulePath.startsWith("@/server/services/");
    if (!isForbiddenPath) continue;

    const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
    findings.push({
      file,
      line,
      message: "LEO layer cannot access services directly",
      excerpt: getLineText(source, line),
    });
  }

  return findings;
}

function checkFallbacks(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const checks = [
    {
      regex: /\btenantId\s*\|\|/g,
      message: "Forbidden tenant fallback: tenantId ||",
    },
    {
      regex: /process\.env\.TENANT_ID/g,
      message: "Forbidden tenant fallback: process.env.TENANT_ID",
    },
    {
      regex: /\bDEFAULT_TENANT_ID\b/g,
      message: "Forbidden tenant fallback: DEFAULT_TENANT_ID",
    },
  ];

  for (const check of checks) {
    let match: RegExpExecArray | null = null;
    while ((match = check.regex.exec(source)) !== null) {
      const line = lineOf(source, match.index);
      findings.push({
        file,
        line,
        message: check.message,
        excerpt: getLineText(source, line),
      });
    }
  }

  return findings;
}

function main(): void {
  const baseline = loadBaseline();
  const files = walk(ROOT);
  const findings: Finding[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    findings.push(...checkExportedFunctions(file, source));
    findings.push(...checkLeoServiceImports(file, source));
    findings.push(...checkLeoDirectServiceAccess(file, source));
    findings.push(...checkFallbacks(file, source));
  }

  const regressions = findings.filter((finding) => !baseline.has(findingKey(finding)));

  if (regressions.length === 0) {
    writeOut("[check-tenant] OK - no tenant regressions found");
    return;
  }

  writeErr(`[check-tenant] FAIL - ${regressions.length} regression(s) found`);
  for (const f of regressions) {
    writeErr(`- ${f.file}:${f.line} ${f.message}`);
    writeErr(`  ${f.excerpt}`);
  }
  process.exit(1);
}

main();




