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

// Arquivos permitidos da C3.1 (remoção de DB direto do _core)
const C3_1_ALLOWED_FILES = [
  "server/_core/domain-audit.ts",
  "server/_core/oauth.ts",
  "server/_core/ownership.ts",
  "server/_core/sdk.ts",
  "server/_core/service-actor.ts",
];

// Janela formal P23-B - Schema produto_skus autorizado
const P23_B_AUTHORIZED_FILES = [
  "drizzle/schema.ts",
  "drizzle/relations.ts",
  "shared/types/entities.d.ts",
  "drizzle/meta/_journal.json",
  "drizzle/0005_needy_microchip.sql",
  "drizzle/meta/0005_snapshot.json",
];

/**
 * Verifica se arquivo tem autorização P20.4 para update de caminho doc
 * Requer variável ERP_AUTHORIZED_FROZEN_DOC_UPDATE=P20_4_ENV_RULES_PATH_UPDATE
 */
function isP20_4AuthorizedFrozenDocUpdate(filePath) {
  const authorizedValue = "P20_4_ENV_RULES_PATH_UPDATE";
  const envValue = process.env.ERP_AUTHORIZED_FROZEN_DOC_UPDATE;
  
  if (filePath === "server/_core/env/ENV_RULES.md" && envValue === authorizedValue) {
    return { authorized: true, reason: "P20.4 formal window: ERP_AUTHORIZED_FROZEN_DOC_UPDATE=" + authorizedValue };
  }
  
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-B para schema produto_skus
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_B_PRODUCT_SKU_SCHEMA
 * Permite somente os 6 arquivos específicos da P23-B
 */
function isP23_BAuthorizedSchemaUpdate(filePath) {
  const authorizedValue = "P23_B_PRODUCT_SKU_SCHEMA";
  const envValue = process.env.ERP_AUTHORIZED_SCHEMA_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_B_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-B formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=" + authorizedValue + " (product sku schema)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-E para limpeza do journal Drizzle
 * Requer variável ERP_AUTHORIZED_JOURNAL_UPDATE=P23_E_REMOVE_ORPHAN_JOURNAL_ENTRY
 * Permite somente drizzle/meta/_journal.json
 */
function isP23_EAuthorizedJournalUpdate(filePath) {
  const authorizedValue = "P23_E_REMOVE_ORPHAN_JOURNAL_ENTRY";
  const envValue = process.env.ERP_AUTHORIZED_JOURNAL_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo é exatamente o journal
  if (filePath === "drizzle/meta/_journal.json") {
    return {
      authorized: true,
      reason: "P23-E formal window: ERP_AUTHORIZED_JOURNAL_UPDATE=" + authorizedValue + " (remove orphan drizzle journal entry)"
    };
  }

  // Arquivo fora do escopo: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-E para bootstrap DB-only migrate runner
 * Requer variável ERP_AUTHORIZED_BOOTSTRAP_UPDATE=P23_E_MIGRATE_RUNNER_DB_ONLY
 * Permite somente server/_core/bootstrap.ts e server/scripts/run-migrate.ts
 */
function isP23_EAuthorizedBootstrapUpdate(filePath) {
  const authorizedValue = "P23_E_MIGRATE_RUNNER_DB_ONLY";
  const envValue = process.env.ERP_AUTHORIZED_BOOTSTRAP_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (filePath === "server/_core/bootstrap.ts" || filePath === "server/scripts/run-migrate.ts") {
    return {
      authorized: true,
      reason: "P23-E formal window: ERP_AUTHORIZED_BOOTSTRAP_UPDATE=" + authorizedValue + " (migrate runner DB-only bootstrap)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-F para remover snapshot órfão
 * Requer variável ERP_AUTHORIZED_SNAPSHOT_CLEAN=P23_F_REMOVE_ORPHAN_0000_SNAPSHOT
 * Permite somente drizzle/meta/0000_snapshot.json
 */
function isP23_FAuthorizedSnapshotClean(filePath) {
  const authorizedValue = "P23_F_REMOVE_ORPHAN_0000_SNAPSHOT";
  const envValue = process.env.ERP_AUTHORIZED_SNAPSHOT_CLEAN;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo é exatamente o snapshot órfão 0000
  if (filePath === "drizzle/meta/0000_snapshot.json") {
    return {
      authorized: true,
      reason: "P23-F formal window: ERP_AUTHORIZED_SNAPSHOT_CLEAN=" + authorizedValue + " (remove orphan 0000 snapshot)"
    };
  }

  // Arquivo fora do escopo: bloqueia mesmo com variável correta
  return { authorized: false };
}

// Janela formal P23-G1 - Limpeza de types de produtoVariacoes autorizada
const P23_G1_AUTHORIZED_FILES = [
  "shared/types/entities.d.ts",
  "server/services/inventory.service.ts",
];

// Janela formal P23-G2.1-B - Schema sku_id em itens_pedido autorizado
const P23_G21_AUTHORIZED_FILES = [
  "drizzle/schema.ts",
  "drizzle/relations.ts",
  "drizzle/meta/_journal.json",
  "drizzle/0006_migration_1777933000000.sql",
  "drizzle/meta/0006_snapshot.json",
  "server/_core/migration-guard.ts",
];

// Janela formal P23-G2.2-B - Schema sku_id em pendencias autorizado
const P23_G22_AUTHORIZED_FILES = [
  "drizzle/schema.ts",
  "drizzle/relations.ts",
  "drizzle/meta/_journal.json",
  "drizzle/0007_add_sku_id_to_pendencias.sql",
  "drizzle/meta/0007_snapshot.json",
];

// Janela formal P23-SEC - Env log sanitize autorizado
const P23_SEC_AUTHORIZED_FILES = [
  "server/_core/env/bootstrapEnv.ts",
  "scripts/architecture-contract-guard.mjs",
  "scripts/guardrail-check.js",
];

// Janela formal P23-COUNTERS - Schema counters composite unique fix
const P23_COUNTERS_TENANT_UNIQUE_FIX_AUTHORIZED_FILES = [
  "drizzle/schema.ts",
  "drizzle/meta/_journal.json",
  "drizzle/0008_counters_tenant_unique_fix.sql",
  "drizzle/meta/0008_snapshot.json",
];

// Janela formal P23-COUNTERS-WINDOW - Guard files for counters migration
const P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

/**
 * Verifica se arquivo tem autorização P23-G1 para limpeza de types de product variations
 * Requer variável ERP_AUTHORIZED_TYPES_UPDATE=P23_G1_REMOVE_PRODUCT_VARIATIONS_TYPES
 * Permite somente:
 *   - shared/types/entities.d.ts
 *   - server/services/inventory.service.ts
 */
function isP23_G1AuthorizedTypesCleanup(filePath) {
  const authorizedValue = "P23_G1_REMOVE_PRODUCT_VARIATIONS_TYPES";
  const envValue = process.env.ERP_AUTHORIZED_TYPES_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_G1_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-G1 formal window: ERP_AUTHORIZED_TYPES_UPDATE=" + authorizedValue + " (remove obsolete product variations references)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-G2.1-B para adicionar sku_id em itens_pedido
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_G21_ADD_SKU_ID_TO_ITENS_PEDIDO
 * Permite somente os 6 arquivos específicos da P23-G2.1-B:
 *   - drizzle/schema.ts
 *   - drizzle/relations.ts
 *   - drizzle/meta/_journal.json
 *   - drizzle/0006_migration_1777933000000.sql
 *   - drizzle/meta/0006_snapshot.json
 *   - server/_core/migration-guard.ts
 */
function isP23_G21AuthorizedSchemaUpdate(filePath) {
  const authorizedValue = "P23_G21_ADD_SKU_ID_TO_ITENS_PEDIDO";
  const envValue = process.env.ERP_AUTHORIZED_SCHEMA_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_G21_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-G2.1-B formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=" + authorizedValue + " (add sku_id nullable to itens_pedido + migration guard prefix/hash)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-G2.2-B para adicionar sku_id em pendencias
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_G22_ADD_SKU_ID_TO_PENDENCIAS
 * Permite somente os 5 arquivos específicos da P23-G2.2-B:
 *   - drizzle/schema.ts
 *   - drizzle/relations.ts
 *   - drizzle/meta/_journal.json
 *   - drizzle/0007_add_sku_id_to_pendencias.sql
 *   - drizzle/meta/0007_snapshot.json
 */
function isP23_G22AuthorizedPendenciasSkuSchemaUpdate(filePath) {
  const authorizedValue = "P23_G22_ADD_SKU_ID_TO_PENDENCIAS";
  const envValue = process.env.ERP_AUTHORIZED_SCHEMA_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_G22_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-G2.2-B formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=" + authorizedValue + " (add sku_id nullable to pendencias)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-SEC para env log sanitize
 * Requer variável ERP_AUTHORIZED_CORE_ENV_UPDATE=P23_SEC_ENV_LOG_SANITIZE
 * Permite somente:
 *   - server/_core/env/bootstrapEnv.ts (sanitização de logs)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 *   - scripts/guardrail-check.js (janela formal)
 */
function isP23_SecAuthorizedCoreEnvUpdate(filePath) {
  const authorizedValue = "P23_SEC_ENV_LOG_SANITIZE";
  const envValue = process.env.ERP_AUTHORIZED_CORE_ENV_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_SEC_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-SEC formal window: ERP_AUTHORIZED_CORE_ENV_UPDATE=" + authorizedValue + " (env log sanitize)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-COUNTERS para schema counters composite unique fix
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_COUNTERS_TENANT_UNIQUE_FIX
 * Permite somente os 4 arquivos específicos da migration 0008:
 *   - drizzle/schema.ts
 *   - drizzle/meta/_journal.json
 *   - drizzle/0008_counters_tenant_unique_fix.sql
 *   - drizzle/meta/0008_snapshot.json
 */
function isP23_CountersTenantUniqueFixAuthorized(filePath) {
  const authorizedValue = "P23_COUNTERS_TENANT_UNIQUE_FIX";
  const envValue = process.env.ERP_AUTHORIZED_SCHEMA_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_COUNTERS_TENANT_UNIQUE_FIX_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-COUNTERS formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=" + authorizedValue + " (counters composite unique fix)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-COUNTERS-WINDOW para alterar os guards
 * Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P23_COUNTERS_TENANT_UNIQUE_WINDOW
 * Permite somente os 2 arquivos de guard:
 *   - scripts/guardrail-check.js
 *   - scripts/architecture-contract-guard.mjs
 */
function isP23_CountersTenantUniqueWindowAuthorized(filePath) {
  const authorizedValue = "P23_COUNTERS_TENANT_UNIQUE_WINDOW";
  const envValue = process.env.ERP_AUTHORIZED_GUARD_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-COUNTERS-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=" + authorizedValue + " (guard update for counters migration)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

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
    const files = output.split("\n").filter(Boolean);
    return files;
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

  // P23-COUNTERS-WINDOW check: if guard files are modified, require guard window variable
  const guardFilesInChanges = files.filter(f => P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(f));
  if (guardFilesInChanges.length > 0) {
    const p23_countersWindowCheck = isP23_CountersTenantUniqueWindowAuthorized(guardFilesInChanges[0]);
    if (!p23_countersWindowCheck.authorized) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos de guard bloqueados modificados:\n");
      guardFilesInChanges.forEach(f => console.error(" - " + f));
      console.error("\nDOC BLOQUEADO — Guard files requerem ERP_AUTHORIZED_GUARD_UPDATE=P23_COUNTERS_TENANT_UNIQUE_WINDOW\n");
      process.exit(1);
    }
    // If guard files are authorized, remove them from files for further checks
    const nonGuardFiles = files.filter(f => !P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(f));
    if (nonGuardFiles.length === 0) {
      console.log("\n📋 Arquivos P23-COUNTERS-WINDOW detectados:");
      guardFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — " + p23_countersWindowCheck.reason + "\n");
      return;
    }
    // Continue checking non-guard files
    files.length = 0;
    files.push(...nonGuardFiles);
  }

  // P23-E authorized bootstrap update: migrate runner DB-only bootstrap
  // Requer variável ERP_AUTHORIZED_BOOTSTRAP_UPDATE=P23_E_MIGRATE_RUNNER_DB_ONLY
  // Permite somente server/_core/bootstrap.ts e server/scripts/run-migrate.ts
  // Verifica ANTES do checkBlocked porque run-migrate.ts não está em BLOCKED_PATHS
  const p23_e_bootstrap_authorized_files = ["server/_core/bootstrap.ts", "server/scripts/run-migrate.ts"];
  const allP23_E_Bootstrap_Authorized = files.length > 0 && files.every(f => p23_e_bootstrap_authorized_files.includes(f));
  if (allP23_E_Bootstrap_Authorized) {
    const p23_e_bootstrapCheck = isP23_EAuthorizedBootstrapUpdate(files[0]);
    if (p23_e_bootstrapCheck.authorized) {
      console.log("\n📋 Arquivos P23-E bootstrap detectados:");
      files.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — " + p23_e_bootstrapCheck.reason + "\n");
      return;
    }
  }

  const violations = checkBlocked(files);

  if (violations.length > 0) {
    // P23-COUNTERS-WINDOW check: if guard files are in violations, require guard window variable
    const guardFilesInViolations = violations.filter(v => P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(v));
    if (guardFilesInViolations.length > 0) {
      const p23_countersWindowCheck = isP23_CountersTenantUniqueWindowAuthorized(guardFilesInViolations[0]);
      if (!p23_countersWindowCheck.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivos de guard bloqueados modificados:\n");
        guardFilesInViolations.forEach(f => console.error(" - " + f));
        console.error("\nDOC BLOQUEADO — Guard files requerem ERP_AUTHORIZED_GUARD_UPDATE=P23_COUNTERS_TENANT_UNIQUE_WINDOW\n");
        process.exit(1);
      }
      // If guard files are authorized, remove them from violations for further checks
      const nonGuardViolations = violations.filter(v => !P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(v));
      if (nonGuardViolations.length === 0) {
        console.log("\n📋 Arquivos P23-COUNTERS-WINDOW detectados:");
        guardFilesInViolations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_countersWindowCheck.reason + "\n");
        return;
      }
      violations.length = 0;
      violations.push(...nonGuardViolations);
    }

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

    // P20.4 authorized doc path update: ENV_RULES.md path reference only
    // Requer variável ERP_AUTHORIZED_FROZEN_DOC_UPDATE=P20_4_ENV_RULES_PATH_UPDATE
    if (violations.length === 1) {
      const p20_4Check = isP20_4AuthorizedFrozenDocUpdate(violations[0]);
      if (p20_4Check.authorized) {
        console.log("✔ Guardrail OK — " + violations[0] + " permitido por " + p20_4Check.reason + "\n");
        return;
      }
    }

    // P23-B authorized schema update: produto_skus schema only
    // Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_B_PRODUCT_SKU_SCHEMA
    // Verifica se todas as violações são dos arquivos P23-B autorizados
    const allP23_B_Authorized = violations.every(v => P23_B_AUTHORIZED_FILES.includes(v));
    if (allP23_B_Authorized) {
      const p23_bCheck = isP23_BAuthorizedSchemaUpdate(violations[0]);
      if (p23_bCheck.authorized) {
        console.log("\n📋 Arquivos P23-B detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_bCheck.reason + "\n");
        return;
      }
    }

    // P23-E authorized journal update: remove orphan drizzle journal entry only
    // Requer variável ERP_AUTHORIZED_JOURNAL_UPDATE=P23_E_REMOVE_ORPHAN_JOURNAL_ENTRY
    // Permite somente drizzle/meta/_journal.json
    if (violations.length === 1 && violations[0] === "drizzle/meta/_journal.json") {
      const p23_eCheck = isP23_EAuthorizedJournalUpdate(violations[0]);
      if (p23_eCheck.authorized) {
        console.log("\n✔ Guardrail OK — " + p23_eCheck.reason + "\n");
        return;
      }
    }

    // P23-E authorized bootstrap update: migrate runner DB-only bootstrap
    // Requer variável ERP_AUTHORIZED_BOOTSTRAP_UPDATE=P23_E_MIGRATE_RUNNER_DB_ONLY
    // Permite server/_core/bootstrap.ts e server/scripts/run-migrate.ts
    // Verifica se as violações contêm os arquivos P23-E autorizados
    const p23_e_bootstrap_authorized_files = ["server/_core/bootstrap.ts", "server/scripts/run-migrate.ts"];
    const hasP23_E_BootstrapFiles = violations.some(v => p23_e_bootstrap_authorized_files.includes(v));
    if (hasP23_E_BootstrapFiles) {
      // Verifica cada arquivo P23-E nas violações
      const p23_e_bootstrapViolations = violations.filter(v => p23_e_bootstrap_authorized_files.includes(v));
      const allP23_E_BootstrapAuthorized = p23_e_bootstrapViolations.every(v => {
        const check = isP23_EAuthorizedBootstrapUpdate(v);
        return check.authorized;
      });
      if (allP23_E_BootstrapAuthorized) {
        console.log("\n📋 Arquivos P23-E bootstrap detectados:");
        p23_e_bootstrapViolations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — P23-E formal window: ERP_AUTHORIZED_BOOTSTRAP_UPDATE=P23_E_MIGRATE_RUNNER_DB_ONLY (migrate runner DB-only bootstrap)\n");
        return;
      }
    }

    // P23-F authorized snapshot clean: remove orphan 0000_snapshot.json only
    // Requer variável ERP_AUTHORIZED_SNAPSHOT_CLEAN=P23_F_REMOVE_ORPHAN_0000_SNAPSHOT
    // Permite somente drizzle/meta/0000_snapshot.json
    if (violations.length === 1 && violations[0] === "drizzle/meta/0000_snapshot.json") {
      const p23_fCheck = isP23_FAuthorizedSnapshotClean(violations[0]);
      if (p23_fCheck.authorized) {
        console.log("\n✔ Guardrail OK — " + p23_fCheck.reason + "\n");
        return;
      }
    }

    // P23-G1 authorized types update: remove obsolete product variations references
    // Requer variável ERP_AUTHORIZED_TYPES_UPDATE=P23_G1_REMOVE_PRODUCT_VARIATIONS_TYPES
    // Permite somente shared/types/entities.d.ts e server/services/inventory.service.ts
    const allP23_G1_Authorized = violations.every(v => P23_G1_AUTHORIZED_FILES.includes(v));
    if (allP23_G1_Authorized) {
      const p23_g1Check = isP23_G1AuthorizedTypesCleanup(violations[0]);
      if (p23_g1Check.authorized) {
        console.log("\n📋 Arquivos P23-G1 detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_g1Check.reason + "\n");
        return;
      }
    }

    // P23-G2.1-B authorized schema update: add sku_id nullable to itens_pedido
    // Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_G21_ADD_SKU_ID_TO_ITENS_PEDIDO
    // Permite somente os 6 arquivos específicos da P23-G2.1-B
    const allP23_G21_Authorized = violations.every(v => P23_G21_AUTHORIZED_FILES.includes(v));
    if (allP23_G21_Authorized) {
      const p23_g21Check = isP23_G21AuthorizedSchemaUpdate(violations[0]);
      if (p23_g21Check.authorized) {
        console.log("\n📋 Arquivos P23-G2.1-B detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_g21Check.reason + "\n");
        return;
      }
    }

    // P23-G2.2-B authorized schema update: add sku_id nullable to pendencias
    // Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_G22_ADD_SKU_ID_TO_PENDENCIAS
    // Permite somente os 5 arquivos específicos da P23-G2.2-B
    const allP23_G22_Authorized = violations.every(v => P23_G22_AUTHORIZED_FILES.includes(v));
    if (allP23_G22_Authorized) {
      const p23_g22Check = isP23_G22AuthorizedPendenciasSkuSchemaUpdate(violations[0]);
      if (p23_g22Check.authorized) {
        console.log("\n📋 Arquivos P23-G2.2-B detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_g22Check.reason + "\n");
        return;
      }
    }

    // P23-SEC authorized core env update: env log sanitize
    // Requer variável ERP_AUTHORIZED_CORE_ENV_UPDATE=P23_SEC_ENV_LOG_SANITIZE
    // Permite somente server/_core/env/bootstrapEnv.ts, scripts/architecture-contract-guard.mjs e scripts/guardrail-check.js
    const allP23_Sec_Authorized = violations.every(v => P23_SEC_AUTHORIZED_FILES.includes(v));
    if (allP23_Sec_Authorized) {
      const p23_secCheck = isP23_SecAuthorizedCoreEnvUpdate(violations[0]);
      if (p23_secCheck.authorized) {
        console.log("\n📋 Arquivos P23-SEC detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_secCheck.reason + "\n");
        return;
      }
    }

    // P23-COUNTERS authorized schema update: counters composite unique fix
    // Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_COUNTERS_TENANT_UNIQUE_FIX
    // Permite somente os 4 arquivos específicos da migration 0008
    const allP23_Counters_Authorized = violations.every(v => P23_COUNTERS_TENANT_UNIQUE_FIX_AUTHORIZED_FILES.includes(v));
    if (allP23_Counters_Authorized) {
      const p23_countersCheck = isP23_CountersTenantUniqueFixAuthorized(violations[0]);
      if (p23_countersCheck.authorized) {
        console.log("\n📋 Arquivos P23-COUNTERS detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_countersCheck.reason + "\n");
        return;
      }
    }

    // P23-COUNTERS-WINDOW authorized guard update: guard files for counters migration
    // Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P23_COUNTERS_TENANT_UNIQUE_WINDOW
    // Permite somente scripts/guardrail-check.js e scripts/architecture-contract-guard.mjs
    const allP23_CountersWindow_Authorized = violations.every(v => P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(v));
    if (allP23_CountersWindow_Authorized) {
      const p23_countersWindowCheck = isP23_CountersTenantUniqueWindowAuthorized(violations[0]);
      if (p23_countersWindowCheck.authorized) {
        console.log("\n📋 Arquivos P23-COUNTERS-WINDOW detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_countersWindowCheck.reason + "\n");
        return;
      }
    }

    // P23-COUNTERS mixed case: both drizzle files and guard files staged
    // Requires BOTH ERP_AUTHORIZED_SCHEMA_UPDATE and ERP_AUTHORIZED_GUARD_UPDATE
    const hasDrizzleFiles = violations.some(v => P23_COUNTERS_TENANT_UNIQUE_FIX_AUTHORIZED_FILES.includes(v));
    const hasGuardFiles = violations.some(v => P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(v));
    const onlyCountersOrGuardFiles = violations.every(v => 
      P23_COUNTERS_TENANT_UNIQUE_FIX_AUTHORIZED_FILES.includes(v) || 
      P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(v)
    );
    if (hasDrizzleFiles && hasGuardFiles && onlyCountersOrGuardFiles) {
      const p23_countersCheck = isP23_CountersTenantUniqueFixAuthorized(violations.find(v => P23_COUNTERS_TENANT_UNIQUE_FIX_AUTHORIZED_FILES.includes(v)));
      const p23_countersWindowCheck = isP23_CountersTenantUniqueWindowAuthorized(violations.find(v => P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(v)));
      if (p23_countersCheck.authorized && p23_countersWindowCheck.authorized) {
        console.log("\n📋 Arquivos P23-COUNTERS + P23-COUNTERS-WINDOW detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_countersCheck.reason + " + " + p23_countersWindowCheck.reason + "\n");
        return;
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
