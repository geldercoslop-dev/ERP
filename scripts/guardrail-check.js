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
  // C3.5-B11-B — autorização temporária schema job_execution_log
  "drizzle/schema.ts",
  "drizzle/0002_lucky_bloodstorm.sql",
  "drizzle/meta/0002_snapshot.json",
  "drizzle/meta/_journal.json",
];

// Arquivos permitidos da C3.1 (remoção de DB direto do _core)
const C3_1_ALLOWED_FILES = [
  "server/_core/domain-audit.ts",
  "server/_core/oauth.ts",
  "server/_core/ownership.ts",
  "server/_core/sdk.ts",
  "server/_core/service-actor.ts",
];

// Padrões de DB que NÃO podem estar no diff staged dos arquivos C3.1
const DB_PATTERNS = [
  "db.",
  "getDb(",
  "db_conn",
  'import "../db',
  "import './db",
  'from "../db',
  'from "./db',
  "tx.insert",
  "tx.select",
  "tx.update",
  "tx.delete",
  "tx.execute",
  "connection.query",
  "conn.query",
  "pool.query",
  "db.query",
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

function isOnlyC3_1AllowedFiles(violations) {
  // Se não há violações, retorna true
  if (violations.length === 0) return true;

  // Verifica se todas as violações são arquivos C3.1 permitidos
  return violations.every(file => C3_1_ALLOWED_FILES.includes(file));
}

function checkC3_1DiffForDBPatterns(files) {
  // Verifica apenas os arquivos C3.1
  const c3_1Files = files.filter(f => C3_1_ALLOWED_FILES.includes(f));
  
  if (c3_1Files.length === 0) return { hasDBPattern: false, file: null };

  for (const file of c3_1Files) {
    try {
      const diff = execSync(`git diff --cached "${file}"`).toString();
      
      // Verifica apenas linhas ADICIONADAS (começam com +), não removidas
      const addedLines = diff.split('\n')
        .filter(line => line.startsWith('+') && !line.startsWith('+++'))
        .map(line => line.substring(1)); // Remove o prefixo +
      
      const addedContent = addedLines.join('\n');
      
      for (const pattern of DB_PATTERNS) {
        if (addedContent.includes(pattern)) {
          return { hasDBPattern: true, file, pattern };
        }
      }
    } catch (e) {
      console.error(`Erro ao verificar diff de ${file}`);
      return { hasDBPattern: true, file, pattern: "ERROR" };
    }
  }

  return { hasDBPattern: false, file: null };
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

function isRbacTypingCleanupAllowed(files) {
  const rbacFile = "server/security/rbac.ts";
  if (!files.includes(rbacFile)) return false;
  try {
    const diff = execSync(`git diff --cached -- "${rbacFile}"`).toString();
    if (!diff.trim()) return true;
    const lines = diff.split('\n');
    const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const removals = lines.filter(l => l.startsWith('-') && !l.startsWith('---'));

    const forbidden = additions.find(l => 
      l.match(/db\.|getDb|getPool|query\(|execute\(|bypass|resource:|action:|const|let|var|if|return|switch|case|this\./) ||
      (l.trim().length > 1 && !l.includes('PermissionContext') && !l.match(/^\+\s*(\w+\?: number;|}|\]|,|\[|\s*)$/))
    );

    if (forbidden) {
      console.error(`\n🚫 RBAC BLOQUEADO — alteração proibida detectada: ${forbidden.trim()}`);
      return false;
    }

    const isCleanup = removals.some(l => l.includes('any')) && additions.some(l => l.includes('PermissionContext'));
    if (isCleanup) {
      console.log("\n✔ RBAC Typing Cleanup detectado e validado");
      return true;
    }
    console.error("\n🚫 RBAC BLOQUEADO — alteração deve remover 'any' e usar 'PermissionContext'");
    return false;
  } catch (e) {
    console.error("\nErro ao verificar diff de rbac.ts");
    return false;
  }
}

function main() {
  const files = getChangedFiles();

  const violations = checkBlocked(files);

  if (violations.length > 0) {
    // Verifica se são apenas os arquivos permitidos de schema
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

    // Verifica se são apenas os arquivos permitidos da C3.1
    if (isOnlyC3_1AllowedFiles(violations)) {
      console.log("\n📋 Arquivos C3.1 detectados:");
      violations.forEach(f => console.log(" - " + f));
      console.log();

      // Verifica se o diff contém padrões de DB
      const dbCheck = checkC3_1DiffForDBPatterns(files);
      
      if (dbCheck.hasDBPattern) {
        console.error("\n🚫 C3.1 BLOQUEADO — padrão de DB detectado no diff\n");
        console.error(`Arquivo: ${dbCheck.file}`);
        console.error(`Padrão: ${dbCheck.pattern}`);
        console.error("\nC3.1 deve REMOVER DB direto, não adicionar.\n");
        process.exit(1);
      }

      console.log("✔ Guardrail OK — arquivos C3.1 validados (sem DB no diff)");
      return;
    }

    // Verifica exceção para RBAC typing cleanup
    if (violations.length === 1 && violations[0] === "server/security/rbac.ts") {
      if (isRbacTypingCleanupAllowed(files)) {
        console.log("✔ Guardrail OK — server/security/rbac.ts permitido apenas para RBAC typing cleanup\n");
        return;
      } else {
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
