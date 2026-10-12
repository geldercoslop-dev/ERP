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

// Janela formal P7 - Schema pedidos numero unique por tenant
const P7_PEDIDOS_NUMERO_AUTHORIZED_FILES = [
  "drizzle/schema.ts",
  "drizzle/meta/_journal.json",
  "drizzle/0010_pedidos_numero_unique_por_tenant.sql",
];

// Janela formal P7-GUARD - Alteração dos guards para criar a janela P7
const P7_GUARD_WINDOW_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P21-TENANTS - Restore da master table tenants (migration 0009)
const P21_TENANTS_AUTHORIZED_FILES = [
  "drizzle/schema.ts",
  "drizzle/meta/_journal.json",
  "drizzle/0009_migration_1791761270681.sql",
  "drizzle/meta/0009_snapshot.json",
];

// Janela formal P21-TENANTS-WINDOW - Guard files for tenants restore migration
const P21_TENANTS_GUARD_WINDOW_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P24D - FK física users/vendedores -> tenants (migration 0011)
const P24D_TENANT_FKS_AUTHORIZED_FILES = [
  "drizzle/schema.ts",
  "drizzle/meta/_journal.json",
  "drizzle/0011_tenant_fks_users_vendedores.sql",
  "drizzle/meta/0011_snapshot.json",
];

// Janela formal P24D-WINDOW - Guard files for tenant FKs migration
const P24D_TENANT_FK_GUARD_WINDOW_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-CORE - Core audit stub removal
const P23_CORE_AUTHORIZED_FILES = [
  "server/db/core.ts",
  "scripts/architecture-contract-guard.mjs",
  "scripts/guardrail-check.js",
];

/**
 * Verifica se arquivo tem autorização P23-CORE para remoção de audit stubs
 * Janela histórica ENCERRADA no commit 2884615ea.
 * Requer variável ERP_AUTHORIZED_CORE_UPDATE=P23_CORE_AUDIT_STUB_REMOVAL
 * Permite somente a lista exata de arquivos do commit 2884615ea.
 */
function isP23_CoreAuthorizedUpdate(filePath) {
  const authorizedValue = "P23_CORE_AUDIT_STUB_REMOVAL";
  const envValue = process.env.ERP_AUTHORIZED_CORE_UPDATE;
  const authorizedCommit = "2884615ea";

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Verifica se o commit atual é o autorizado para esta janela histórica
  let currentCommit = "";
  try {
    currentCommit = execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) { /* ignore */ }

  if (currentCommit !== authorizedCommit) {
    return { 
      authorized: false, 
      reason: `P23-CORE window CLOSED. Authorized only for commit ${authorizedCommit}. Current: ${currentCommit}`
    };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_CORE_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-CORE HISTORICAL window (LOCKED): ERP_AUTHORIZED_CORE_UPDATE=" + authorizedValue + " (core audit stub removal)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

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
 * Verifica se arquivo tem autorização P7 para unique composta pedidos (tenant_id, numero)
 * Requer variável ERP_AUTHORIZED_SCHEMA_FIX=P7_PEDIDOS_NUMERO_TENANT_UNIQUE
 * Permite somente os 3 arquivos específicos da P7
 */
function isP7AuthorizedSchemaUpdate(filePath) {
  const authorizedValue = "P7_PEDIDOS_NUMERO_TENANT_UNIQUE";
  const envValue = process.env.ERP_AUTHORIZED_SCHEMA_FIX;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P7_PEDIDOS_NUMERO_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P7 formal window: ERP_AUTHORIZED_SCHEMA_FIX=" + authorizedValue + " (pedidos numero unique por tenant)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P7-GUARD para alteração dos próprios guards
 * Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P7_PEDIDOS_NUMERO_TENANT_UNIQUE_GUARD_WINDOW
 * Permite somente os 2 guards
 */
function isP7GuardWindowAuthorized(filePath) {
  const authorizedValue = "P7_PEDIDOS_NUMERO_TENANT_UNIQUE_GUARD_WINDOW";
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
  if (P7_GUARD_WINDOW_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P7-GUARD formal window: ERP_AUTHORIZED_GUARD_UPDATE=" + authorizedValue + " (guard window creation)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P21-TENANTS para restore da master table tenants
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P21_TENANTS_RESTORE
 * Permite somente os 4 arquivos específicos da migration 0009 tenants
 */
function isP21TenantsAuthorizedSchemaUpdate(filePath) {
  const authorizedValue = "P21_TENANTS_RESTORE";
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
  if (P21_TENANTS_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P21-TENANTS formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=" + authorizedValue + " (tenants master table restore)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P21-TENANTS-WINDOW para alterar os guards
 * Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P21_TENANTS_GUARD_WINDOW
 * Permite somente os 2 guards
 */
function isP21TenantsGuardWindowAuthorized(filePath) {
  const authorizedValue = "P21_TENANTS_GUARD_WINDOW";
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
  if (P21_TENANTS_GUARD_WINDOW_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P21-TENANTS-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=" + authorizedValue + " (guard update for tenants restore)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P24D para FK física users/vendedores -> tenants
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P24D_TENANT_FKS
 * Permite somente os 4 arquivos específicos da migration 0011 tenant fks
 */
function isP24DTenantFksAuthorizedSchemaUpdate(filePath) {
  const authorizedValue = "P24D_TENANT_FKS";
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
  if (P24D_TENANT_FKS_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P24D formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=" + authorizedValue + " (tenant fks users/vendedores -> tenants)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P24D-WINDOW para alterar os guards
 * Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P24D_TENANT_FK_GUARD_WINDOW
 * Permite somente os 2 guards
 */
function isP24DTenantFkGuardWindowAuthorized(filePath) {
  const authorizedValue = "P24D_TENANT_FK_GUARD_WINDOW";
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
  if (P24D_TENANT_FK_GUARD_WINDOW_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P24D-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=" + authorizedValue + " (guard update for tenant fks migration)"
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

// Janela formal P23-R-05B - Drizzle quarantine cleanup
const P23_R05B_DRIZZLE_QUARANTINE_CLEANUP_AUTHORIZED_FILES = [
  "drizzle/quarantine-20260330/schema-leo-memory.ts",
  "drizzle/quarantine-20260330/schema-semantic-memory.ts",
  "server/leo/memory/leo-long-memory.ts",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R08E - Stock movements schema
const P23_R08E_STOCK_MOVEMENTS_AUTHORIZED_FILES = [
  "drizzle/schema.ts",
  "drizzle/meta/_journal.json",
  "drizzle/0009_create_stock_movements.sql",
];

// Janela formal P23-R08E-WINDOW - Guard files for stock movements
const P23_R08E_STOCK_MOVEMENTS_WINDOW_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-APP-SECRET-WINDOW - App Secret middleware extraction
const P23_APP_SECRET_MIDDLEWARE_EXTRACTION_AUTHORIZED_FILES = [
  "server/_core/index.ts",
  "server/security/app-secret-middleware.ts",
  "server/tests/security-app-secret.test.ts",
];

// Janela formal P23-APP-SECRET-WINDOW - Guard files for app secret middleware
const P23_APP_SECRET_MIDDLEWARE_WINDOW_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-08E-07C-PACKAGE - Remove obsolete test:login script from package.json
const P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT_AUTHORIZED_FILES = [
  "package.json",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-08I-04E - Remove obsolete load token script from package.json
const P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL_AUTHORIZED_FILES = [
  "package.json",
  "scripts/get-token.ts",
  "tests/load/access_token.txt",
  "THROW_GENERIC_MAPPING_REPORT.md",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09B-FIX - Remove dead fix:vendedor script from package.json
const P23_R09B_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT_AUTHORIZED_FILES = [
  "package.json",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09F - Remove dead db:push:prod script from package.json
const P23_R09F_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT_AUTHORIZED_FILES = [
  "package.json",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09G-AUTH - Harden hard test shutdown endpoint and script
const P23_R09G_HARD_TEST_SHUTDOWN_HARDENING_AUTHORIZED_FILES = [
  "server/_core/index.ts",
  "server/scripts/hard-test-shutdown.mjs",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09H - Remove hard test shutdown script alias from package.json
const P23_R09H_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS_AUTHORIZED_FILES = [
  "package.json",
  "server/scripts/hard-test-shutdown.mjs",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09J - Remove dead validate final script from package.json
const P23_R09J_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT_AUTHORIZED_FILES = [
  "package.json",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09K2 - Harden db push env gate in drizzle-wrapper
const P23_R09K2_DB_WRAPPER_HARDENING_AUTHORIZED_FILES = [
  "scripts/db/drizzle-wrapper.mjs",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09K3 - Remove raw db:push alias from package.json
const P23_R09K3_REMOVE_DB_PUSH_ALIAS_AUTHORIZED_FILES = [
  "package.json",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09M - Remove seed:admin alias from package.json
const P23_R09M_REMOVE_SEED_ADMIN_ALIAS_AUTHORIZED_FILES = [
  "package.json",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09O - Remove legacy seed-admin.ts script (deletion only)
const P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT_AUTHORIZED_FILES = [
  "server/scripts/seed-admin.ts",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Janela formal P23-R-09Q - Clean dead references to seed:admin (docs + dead text only)
const P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES_AUTHORIZED_FILES = [
  "docs/AUTH-DB.md",
  "docs/RELATORIO_HARDENING.md",
  "docs/operations/CHECKLIST_TESTE_OPERACIONAL.md",
  "docs/operations/CONFIGURAR_BANCO_2MIN.md",
  "docs/operations/PLANO_TESTE_OPERACIONAL_EMPRESA.md",
  "docs/BRIEFING_PARA_ROADMAP.md",
  "client/src/INTEGRATION_README.md",
  "server/scripts/seed-massa-teste.ts",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Padrões de lógica proibidos em diffs de seed-massa-teste.ts (janela R09Q permite só texto morto)
const P23_R09Q_SEED_MASSA_FORBIDDEN_PATTERNS = [
  "import",
  "getDb",
  "DEFAULT_TENANT_ID",
  "getAllVendedores",
  "vendedorId",
  "createCliente",
  "createProduto",
  "await",
  "bootstrap",
  "tenant",
  "process.env",
  "db.",
];

// Padrões proibidos em linhas ADICIONADAS nos arquivos autorizados R09Q (sem novo comando/credencial)
const P23_R09Q_FORBIDDEN_ADDITION_PATTERNS = [
  "seed:admin",
  "seed-admin",
  "npm run seed",
  "pnpm run seed",
  "npx tsx",
  "admin123",
  "admin/admin",
  "vendedor123",
];

// Janela formal P23-R-09R - Weak credential cleanup (auth-detection/reset/bats/load-test)
const P23_R09R_WEAK_CREDENTIAL_CLEANUP_AUTHORIZED_FILES = [
  "server/_core/auth-detection.ts",
  "server/scripts/reset-admin-password.ts",
  "INSTALAR_CORRIGIDO.bat",
  "INSTALAR_CORRIGIDO - Copia.bat",
  "util/test/load-test.ts",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Padrões proibidos em linhas ADICIONADAS em TODOS os arquivos R09R (sem nova credencial/comando perigoso)
const P23_R09R_FORBIDDEN_ADDITION_PATTERNS = [
  "admin123",
  "vendedor123",
  "admin/admin",
  "123456",
  "smart-auth",
  "smartAuth",
  "seed:admin",
  "seed-admin",
  "npm run seed",
  "pnpm run seed",
  "npx tsx",
];

// Padrões extras proibidos em linhas ADICIONADAS por arquivo R09R (mecânica de credencial insegura)
const P23_R09R_FILE_SPECIFIC_FORBIDDEN_PATTERNS = {
  "server/_core/auth-detection.ts": [
    "INSERT INTO",
    "bcrypt.hash",
    "Password = \"",
    "Password = '",
    "password = \"",
    "password = '",
  ],
  "server/scripts/reset-admin-password.ts": [
    "INSERT INTO",
    "LIKE",
    "Senha:",
    "[1,",
    "tenantId: 1",
    "Password = \"",
    "Password = '",
    "password = \"",
    "password = '",
  ],
  "INSTALAR_CORRIGIDO.bat": [
    "admin123",
    "admin/",
    "admin@",
    " admin",
    "admin ",
    "senha",
    "password",
    "PASSWORD",
    "seed",
    "reset",
    "tsx",
  ],
  "INSTALAR_CORRIGIDO - Copia.bat": [
    "admin123",
    "admin/",
    "admin@",
    " admin",
    "admin ",
    "senha",
    "password",
    "PASSWORD",
    "seed",
    "reset",
    "tsx",
  ],
  "util/test/load-test.ts": [
    "PASSWORD=admin",
    "PASSWORD=123",
    "PASSWORD=test",
    "PASSWORD=senha",
    "password=admin",
  ],
};

// Padrões de mount do router smart-auth — bloqueio permanente em qualquer arquivo (router dormente com credencial fraca)
const P23_R09R_SMART_AUTH_MOUNT_PATTERNS = [
  "smart-auth",
  "smartAuth",
  "smartAuthRouter",
];

// Janela formal P23-R-09S - Seed massa lockdown (gate forte em seed-massa-teste.ts + correção de docs operacionais)
const P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES = [
  "server/scripts/seed-massa-teste.ts",
  "docs/operations/CHECKLIST_TESTE_OPERACIONAL.md",
  "docs/operations/PLANO_TESTE_OPERACIONAL_EMPRESA.md",
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Padrões proibidos em linhas ADICIONADAS em TODOS os arquivos R09S não-guard (sem nova credencial/seed legado/reset perigoso)
const P23_R09S_FORBIDDEN_ADDITION_PATTERNS = [
  "admin123",
  "admin/admin",
  "vendedor123",
  "seed:admin",
  "seed-admin",
  "reset-admin-password",
];

// Padrões proibidos em linhas ADICIONADAS de seed-massa-teste.ts (lockdown não pode reintroduzir lógica insegura)
const P23_R09S_SEED_MASSA_FORBIDDEN_PATTERNS = [
  "DEFAULT_TENANT_ID",
  "getAllVendedores",
  "tenantId ?? 1",
  "tenantId || 1",
  "tenantId = 1",
  "tenantId: 1",
  "vendedorId ?? 1",
  "vendedorId || 1",
  "vendedorId = 1",
  "vendedorId: 1",
];

// Padrões proibidos em linhas ADICIONADAS dos docs operacionais R09S (sem nova instrução de execução direta/legado)
const P23_R09S_DOCS_FORBIDDEN_PATTERNS = [
  "npx tsx",
  "pnpm exec tsx",
  "pnpm run seed",
  "npm run seed",
  "DEFAULT_TENANT_ID",
];

// Mapa de padrões específicos por arquivo R09S
const P23_R09S_FILE_SPECIFIC_FORBIDDEN_PATTERNS = {
  "server/scripts/seed-massa-teste.ts": P23_R09S_SEED_MASSA_FORBIDDEN_PATTERNS,
  "docs/operations/CHECKLIST_TESTE_OPERACIONAL.md": P23_R09S_DOCS_FORBIDDEN_PATTERNS,
  "docs/operations/PLANO_TESTE_OPERACIONAL_EMPRESA.md": P23_R09S_DOCS_FORBIDDEN_PATTERNS,
};

// Janela formal P23-R-09T - ENV_RULES seed-massa dead ref cleanup
// Dois valores distintos na mesma variável ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP:
//   AUTH  (P23_R09T_ENV_RULES_SEED_MASSA_AUTH)    → fase AUTH: permite SOMENTE os 2 guards
//   CLEAN (P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP) → fase CLEAN: permite SOMENTE ENV_RULES.md
const P23_R09T_ENV_RULES_SEED_MASSA_AUTH_VALUE = "P23_R09T_ENV_RULES_SEED_MASSA_AUTH";
const P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_VALUE = "P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP";

// Fase AUTH: somente os guards podem ser alterados
const P23_R09T_AUTH_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Fase CLEAN: alvo único — ENV_RULES.md (guards ficam BLOQUEADOS sob o valor CLEAN)
const P23_R09T_CLEANUP_AUTHORIZED_FILES = [
  "server/_core/env/ENV_RULES.md",
];

// União (claiming): arquivos sob tutela da janela R09T em qualquer valor
const P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_AUTHORIZED_FILES = P23_R09T_CLEANUP_AUTHORIZED_FILES.concat(P23_R09T_AUTH_AUTHORIZED_FILES);

// Único conteúdo permitido em linhas REMOVIDAS do diff de ENV_RULES.md sob R09T (dead ref do seed massa)
const P23_R09T_ALLOWED_REMOVAL_PATTERN = "server/scripts/seed-massa-teste.ts";

// Janela formal P23-R-09U - vendedores.list multi-tenant isolation fix
// Dois valores distintos na mesma variável ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX:
//   AUTH (P23_R09U_VENDEDORES_LIST_TENANT_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R09U_VENDEDORES_LIST_TENANT_FIX)  → fase FIX: permite SOMENTE service + router + teste autorizado
const P23_R09U_VENDEDORES_LIST_TENANT_AUTH_VALUE = "P23_R09U_VENDEDORES_LIST_TENANT_AUTH";
const P23_R09U_VENDEDORES_LIST_TENANT_FIX_VALUE = "P23_R09U_VENDEDORES_LIST_TENANT_FIX";

// Fase AUTH: somente os guards podem ser alterados
const P23_R09U_AUTH_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Fase FIX: alvo do fluxo ativo — service + router + teste de isolamento autorizado
// (guards, server/db/*, baseline, schema e package.json ficam BLOQUEADOS sob o valor FIX)
const P23_R09U_FIX_AUTHORIZED_FILES = [
  "server/services/users.service.ts",
  "server/routers.ts",
  "server/tests/vendedores-list-tenant-isolation.test.ts",
];

// União (claiming): arquivos sob tutela da janela R09U em qualquer valor
const P23_R09U_VENDEDORES_LIST_TENANT_FIX_AUTHORIZED_FILES = P23_R09U_FIX_AUTHORIZED_FILES.concat(P23_R09U_AUTH_AUTHORIZED_FILES);

// Janela formal P23-R-09W - vendedores mutation (update/delete/senha) multi-tenant fix
// Dois valores distintos na mesma variável ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX:
//   AUTH (P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R09W_VENDEDORES_MUTATION_TENANT_FIX)  → fase FIX: permite SOMENTE service + router + teste autorizado
const P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH_VALUE = "P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH";
const P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_VALUE = "P23_R09W_VENDEDORES_MUTATION_TENANT_FIX";

// Fase AUTH: somente os guards podem ser alterados
const P23_R09W_AUTH_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Fase FIX: alvo do fluxo ativo — service + router + teste de isolamento de mutações autorizado
// (guards, server/db/*, baseline, schema, package.json e financeiro.router.ts ficam BLOQUEADOS sob o valor FIX)
const P23_R09W_FIX_AUTHORIZED_FILES = [
  "server/services/users.service.ts",
  "server/routers.ts",
  "server/tests/vendedores-mutation-tenant-isolation.test.ts",
];

// União (claiming): arquivos sob tutela da janela R09W em qualquer valor
const P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_AUTHORIZED_FILES = P23_R09W_FIX_AUTHORIZED_FILES.concat(P23_R09W_AUTH_AUTHORIZED_FILES);

// Janela formal P23-R-09X - hardening de getVendedorById com tenantId obrigatório
// Dois valores distintos na mesma variável ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING:
//   AUTH (P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R09X_VENDEDOR_BY_ID_TENANT_FIX)  → fase FIX: permite SOMENTE service + router + ownership + service-actor + teste autorizado
// FORA DO ESCOPO R09X: getVendedorByNome, financeiro semantic bug, getVendedorByUserId, getUserById,
//   server/db/core.ts, financeiro.router.ts, leo/**, tools/**, baseline, schema, package.json, frontend/**
const P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH_VALUE = "P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH";
const P23_R09X_VENDEDOR_BY_ID_TENANT_FIX_VALUE = "P23_R09X_VENDEDOR_BY_ID_TENANT_FIX";

// Fase AUTH: somente os guards podem ser alterados
const P23_R09X_AUTH_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Fase FIX: alvo do fluxo ativo — service + router + ownership + service-actor + teste autorizado
// (guards, server/db/*, financeiro.router.ts, leo/**, tools/**, baseline, schema e package.json ficam BLOQUEADOS sob o valor FIX)
const P23_R09X_FIX_AUTHORIZED_FILES = [
  "server/services/users.service.ts",
  "server/routers.ts",
  "server/_core/ownership.ts",
  "server/_core/service-actor.ts",
  "server/tests/vendedor-by-id-tenant-isolation.test.ts",
];

// União (claiming): arquivos sob tutela da janela R09X em qualquer valor
const P23_R09X_VENDEDOR_BY_ID_TENANT_HARDENING_AUTHORIZED_FILES = P23_R09X_FIX_AUTHORIZED_FILES.concat(P23_R09X_AUTH_AUTHORIZED_FILES);

// Janela formal P23-R-09Y - hardening completo de lookups por nome + permissões Leo multi-tenant
// Dois valores distintos na mesma variável ERP_AUTHORIZED_NAME_PERMISSION_TENANT_HARDENING:
//   AUTH (P23_R09Y_NAME_PERMISSION_TENANT_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R09Y_NAME_PERMISSION_TENANT_FIX)  → fase FIX: permite SOMENTE db/core + service + router + users.tool + leo-permissions + teste autorizado
// FORA DO ESCOPO R09Y: server/leo/index.ts, financeiro.router.ts, server/_core/**, baseline, schema, package.json,
//   frontend/**, server/db/index.ts, getVendedorByUserId, getVendedorById do core, getAllVendedores do core, financeiro semantic bug
const P23_R09Y_NAME_PERMISSION_TENANT_AUTH_VALUE = "P23_R09Y_NAME_PERMISSION_TENANT_AUTH";
const P23_R09Y_NAME_PERMISSION_TENANT_FIX_VALUE = "P23_R09Y_NAME_PERMISSION_TENANT_FIX";

// Fase AUTH: somente os guards podem ser alterados
const P23_R09Y_AUTH_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Fase FIX: alvo da cadeia por nome — db/core + service + router + users.tool + leo-permissions + teste autorizado
// (guards, leo/index.ts, _core/**, financeiro.router.ts, baseline, schema, package.json, db/index.ts e frontend/** ficam BLOQUEADOS sob o valor FIX)
const P23_R09Y_FIX_AUTHORIZED_FILES = [
  "server/db/core.ts",
  "server/services/users.service.ts",
  "server/routers.ts",
  "server/tools/users.tool.ts",
  "server/leo/security/leo-permissions.ts",
  "server/tests/name-permission-tenant-isolation.test.ts",
];

// União (claiming): arquivos sob tutela da janela R09Y em qualquer valor
const P23_R09Y_NAME_PERMISSION_TENANT_HARDENING_AUTHORIZED_FILES = P23_R09Y_FIX_AUTHORIZED_FILES.concat(P23_R09Y_AUTH_AUTHORIZED_FILES);

// Janela formal P23-R-09Z - hardening de vendedor por userId + cadeia de login/identidade
// Dois valores distintos na mesma variável ERP_AUTHORIZED_VENDEDOR_USER_TENANT_HARDENING:
//   AUTH (P23_R09Z_VENDEDOR_USER_TENANT_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R09Z_VENDEDOR_USER_TENANT_FIX)  → fase FIX: permite SOMENTE service + router + service-actor + tenant-ownership + core-bootstrap + db/core + db/index + teste autorizado
// FORA DO ESCOPO R09Z: financeiro.router.ts, server/tools/**, server/leo/**, drizzle/schema.ts, drizzle/migrations/**,
//   package.json, frontend/**, tenant-validation.service.ts, check-tenant-baseline.json
const P23_R09Z_VENDEDOR_USER_TENANT_AUTH_VALUE = "P23_R09Z_VENDEDOR_USER_TENANT_AUTH";
const P23_R09Z_VENDEDOR_USER_TENANT_FIX_VALUE = "P23_R09Z_VENDEDOR_USER_TENANT_FIX";

// Fase AUTH: somente os guards podem ser alterados
const P23_R09Z_AUTH_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Fase FIX: alvo da cadeia de vendedor por userId — service + router + service-actor + tenant-ownership + core-bootstrap + db/core + db/index + teste autorizado
// (guards, financeiro.router.ts, tools/**, leo/**, schema, migrations, package.json, frontend/**, tenant-validation.service.ts e baseline ficam BLOQUEADOS sob o valor FIX)
const P23_R09Z_FIX_AUTHORIZED_FILES = [
  "server/services/users.service.ts",
  "server/routers.ts",
  "server/_core/service-actor.ts",
  "server/_core/tenant-ownership.ts",
  "server/services/core-bootstrap.service.ts",
  "server/db/core.ts",
  "server/db/index.ts",
  "server/tests/vendedor-by-user-id-tenant-isolation.test.ts",
];

// União (claiming): arquivos sob tutela da janela R09Z em qualquer valor
const P23_R09Z_VENDEDOR_USER_TENANT_HARDENING_AUTHORIZED_FILES = P23_R09Z_FIX_AUTHORIZED_FILES.concat(P23_R09Z_AUTH_AUTHORIZED_FILES);

// Janela formal P23-R-10B - Arquitetura JWT de sessão (auth.login → JWT → client → createContext → revalidação DB)
// Dois valores distintos na mesma variável ERP_AUTHORIZED_JWT_SESSION_ARCHITECTURE:
//   AUTH (P23_R10B_JWT_SESSION_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R10B_JWT_SESSION_FIX)  → fase FIX: permite SOMENTE routers + jwt-auth + context + smart-auth + authStore + auth.service + teste autorizado
// FORA DO ESCOPO R10B: drizzle/schema.ts, drizzle/migrations/**, session.service.ts, jwt-hardening.ts,
//   jwt-auth-middleware.ts, sdk.ts, oauth.ts, service-actor.ts, tenant-ownership.ts, server/db/**,
//   users.service.ts, check-tenant-baseline.json, package.json
// Formatos de sessão u:<id>, v:<id>, v:<tenant>:<id>, "admin-session" e "vendedor-session" permanecem
// inválidos como autenticação — esta janela NÃO autoriza reintroduzi-los em nenhum arquivo.
const P23_R10B_JWT_SESSION_AUTH_VALUE = "P23_R10B_JWT_SESSION_AUTH";
const P23_R10B_JWT_SESSION_FIX_VALUE = "P23_R10B_JWT_SESSION_FIX";

// Fase AUTH: somente os guards podem ser alterados
const P23_R10B_AUTH_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
];

// Fase FIX: alvo do fluxo de sessão JWT — router + jwt-auth + context + smart-auth + client auth + teste autorizado
// (guards, session.service.ts, jwt-hardening.ts, jwt-auth-middleware.ts, sdk.ts, oauth.ts, service-actor.ts,
//  tenant-ownership.ts, server/db/**, users.service.ts, schema, migrations, baseline e package.json ficam BLOQUEADOS sob o valor FIX)
// P23-R-10B-AUTH2: extensão mínima — AppShell.tsx (caller vivo de impersonateVendedor)
// e teste R09Z congelado (L1/L4/L6/L7 precisam de expectativa JWT).
const P23_R10B_FIX_AUTHORIZED_FILES = [
  "server/routers.ts",
  "server/security/jwt-auth.ts",
  "server/_core/context.ts",
  "server/routers/smart-auth.ts",
  "client/src/store/authStore.ts",
  "client/src/services/auth.service.ts",
  "server/tests/jwt-session-auth-flow.test.ts",
  "client/src/components/layout/AppShell.tsx",
  "server/tests/vendedor-by-user-id-tenant-isolation.test.ts",
];

// União (claiming): arquivos sob tutela da janela R10B em qualquer valor
const P23_R10B_JWT_SESSION_ARCHITECTURE_AUTHORIZED_FILES = P23_R10B_FIX_AUTHORIZED_FILES.concat(P23_R10B_AUTH_AUTHORIZED_FILES);

// Janela formal P23-R-10C-DOUBLE-BOOT - Correção do double-boot (autoexecução de startServer em _core/index.ts)
// Dois valores distintos na mesma variável ERP_AUTHORIZED_DOUBLE_BOOT_FIX:
//   AUTH (P23_R10C_DOUBLE_BOOT_AUTH) → fase AUTH: permite SOMENTE os 3 guards
//   FIX  (P23_R10C_DOUBLE_BOOT_FIX)  → fase FIX: permite SOMENTE server/_core/index.ts + teste autorizado
// FORA DO ESCOPO R10C-DOUBLE-BOOT: server/index.ts, server/cluster.ts, server/_core/** (exceto index.ts),
//   tests/** (exceto single-boot-guard.spec.ts), client/**, server/security/**, server/db/**, schema,
//   migrations, baseline, package.json, lockfile
const P23_R10C_DOUBLE_BOOT_AUTH_VALUE = "P23_R10C_DOUBLE_BOOT_AUTH";
const P23_R10C_DOUBLE_BOOT_FIX_VALUE = "P23_R10C_DOUBLE_BOOT_FIX";

// Fase AUTH: somente os 3 guards podem ser alterados
const P23_R10C_DOUBLE_BOOT_AUTH_AUTHORIZED_FILES = [
  "scripts/guardrail-check.js",
  "scripts/architecture-contract-guard.mjs",
  "scripts/anti-regress-check.js",
];

// Fase FIX: alvo do fix — server/_core/index.ts + teste autorizado
// (guards, server/index.ts, cluster.ts, _core/**, tests/**, client/**, security/**, db/**,
//  schema, migrations, baseline, package.json e lockfile ficam BLOQUEADOS sob o valor FIX)
const P23_R10C_DOUBLE_BOOT_FIX_AUTHORIZED_FILES = [
  "server/_core/index.ts",
  "tests/single-boot-guard.spec.ts",
];

// União (claiming): arquivos sob tutela da janela R10C-DOUBLE-BOOT em qualquer valor
const P23_R10C_DOUBLE_BOOT_AUTHORIZED_FILES = P23_R10C_DOUBLE_BOOT_FIX_AUTHORIZED_FILES.concat(P23_R10C_DOUBLE_BOOT_AUTH_AUTHORIZED_FILES);

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

/**
 * Verifica se arquivo tem autorização P23-R-05B para limpeza de drizzle quarantine
 * Requer variável ERP_AUTHORIZED_DRIZZLE_QUARANTINE_CLEANUP=P23_R05B_REMOVE_QUARANTINE_20260330
 * Permite somente os 5 arquivos específicos da P23-R-05B:
 *   - drizzle/quarantine-20260330/schema-leo-memory.ts
 *   - drizzle/quarantine-20260330/schema-semantic-memory.ts
 *   - server/leo/memory/leo-long-memory.ts
 *   - scripts/guardrail-check.js
 *   - scripts/architecture-contract-guard.mjs
 */
function isP23_R05BAuthorizedDrizzleQuarantineCleanup(filePath) {
  const authorizedValue = "P23_R05B_REMOVE_QUARANTINE_20260330";
  const envValue = process.env.ERP_AUTHORIZED_DRIZZLE_QUARANTINE_CLEANUP;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R05B_DRIZZLE_QUARANTINE_CLEANUP_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-05B formal window: ERP_AUTHORIZED_DRIZZLE_QUARANTINE_CLEANUP=" + authorizedValue + " (remove drizzle quarantine-20260330)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R08E para schema stock_movements
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_R08E_STOCK_MOVEMENTS_SCHEMA
 * Permite somente os 3 arquivos específicos da P23-R08E:
 *   - drizzle/schema.ts
 *   - drizzle/meta/_journal.json
 *   - drizzle/0009_create_stock_movements.sql
 */
function isP23_R08EAuthorizedStockMovementsSchemaUpdate(filePath) {
  const authorizedValue = "P23_R08E_STOCK_MOVEMENTS_SCHEMA";
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
  if (P23_R08E_STOCK_MOVEMENTS_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R08E formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=" + authorizedValue + " (stock movements schema)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R08E-WINDOW para alterar os guards
 * Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P23_R08E_STOCK_MOVEMENTS_WINDOW
 * Permite somente os 2 arquivos de guard:
 *   - scripts/guardrail-check.js
 *   - scripts/architecture-contract-guard.mjs
 */
function isP23_R08EStockMovementsWindowAuthorized(filePath) {
  const authorizedValue = "P23_R08E_STOCK_MOVEMENTS_WINDOW";
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
  if (P23_R08E_STOCK_MOVEMENTS_WINDOW_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R08E-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=" + authorizedValue + " (guard update for stock movements)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-APP-SECRET para extração do middleware
 * Requer variável ERP_AUTHORIZED_CORE_SECURITY_UPDATE=P23_APP_SECRET_MIDDLEWARE_EXTRACTION
 * Permite somente os 3 arquivos específicos da extração:
 *   - server/_core/index.ts
 *   - server/security/app-secret-middleware.ts
 *   - server/tests/security-app-secret.test.ts
 */
function isP23_AppSecretMiddlewareExtractionAuthorized(filePath) {
  const authorizedValue = "P23_APP_SECRET_MIDDLEWARE_EXTRACTION";
  const envValue = process.env.ERP_AUTHORIZED_CORE_SECURITY_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_APP_SECRET_MIDDLEWARE_EXTRACTION_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-APP-SECRET formal window: ERP_AUTHORIZED_CORE_SECURITY_UPDATE=" + authorizedValue + " (app secret middleware extraction)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-APP-SECRET-WINDOW para alterar os guards
 * Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P23_APP_SECRET_MIDDLEWARE_WINDOW
 * Permite somente os 2 arquivos de guard:
 *   - scripts/guardrail-check.js
 *   - scripts/architecture-contract-guard.mjs
 */
function isP23_AppSecretMiddlewareWindowAuthorized(filePath) {
  const authorizedValue = "P23_APP_SECRET_MIDDLEWARE_WINDOW";
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
  if (P23_APP_SECRET_MIDDLEWARE_WINDOW_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-APP-SECRET-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=" + authorizedValue + " (guard update for app secret middleware)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-08E-07C-PACKAGE para remover test:login script
 * Requer variável ERP_AUTHORIZED_PACKAGE_UPDATE=P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT
 * Permite somente:
 *   - package.json (apenas para remover "test:login": "tsx scripts/test-login.js")
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_RemoveObsoleteTestLoginScriptAuthorized(filePath) {
  const authorizedValue = "P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT";
  const envValue = process.env.ERP_AUTHORIZED_PACKAGE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT_AUTHORIZED_FILES.includes(filePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de test:login
    if (filePath === "package.json") {
      try {
        const diff = execSync('git diff --cached package.json').toString();
        
        const lines = diff.split('\n');
        let hasTestLoginRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
          }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Permitir apenas a remoção exata de test:login
            if (line === '-    "test:login": "tsx scripts/test-login.js",') {
              hasTestLoginRemoval = true;
            } else {
              // Bloquear qualquer outra alteração
              return { authorized: false, reason: 'package.json diff can only contain removal of test:login script. Found: ' + line };
            }
          }
        }
        
        if (!hasTestLoginRemoval) {
          return { authorized: false, reason: 'package.json diff must contain removal of test:login script' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check package.json diff' };
      }
    }
    
    return {
      authorized: true,
      reason: "P23-R-08E-07C-PACKAGE formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=" + authorizedValue + " (remove obsolete test:login script)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-08I-04E para remover load token script
 * Requer variável ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL
 * Permite somente:
 *   - package.json (apenas para remover "get-token": "tsx scripts/get-token.ts")
 *   - scripts/get-token.ts (remoção)
 *   - tests/load/access_token.txt (remoção)
 *   - THROW_GENERIC_MAPPING_REPORT.md (apenas para remover referência a tests/load)
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R08ILoadTokenScriptRemovalAuthorized(filePath) {
  const authorizedValue = "P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL";
  const envValue = process.env.ERP_AUTHORIZED_PACKAGE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL_AUTHORIZED_FILES.includes(filePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de get-token
    if (filePath === "package.json") {
      try {
        const diff = execSync('git diff --cached package.json').toString();
        
        const lines = diff.split('\n');
        let hasGetTokenRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
          }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Permitir apenas a remoção exata de get-token
            if (line === '-    "get-token": "tsx scripts/get-token.ts",') {
              hasGetTokenRemoval = true;
            } else {
              // Bloquear qualquer outra alteração
              return { authorized: false, reason: 'package.json diff can only contain removal of get-token script. Found: ' + line };
            }
          }
        }
        
        if (!hasGetTokenRemoval) {
          return { authorized: false, reason: 'package.json diff must contain removal of get-token script' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check package.json diff' };
      }
    }
    
    // Se for THROW_GENERIC_MAPPING_REPORT.md, precisa verificar que o diff contém apenas a remoção da referência a tests/load
    if (filePath === "THROW_GENERIC_MAPPING_REPORT.md") {
      try {
        const diff = execSync('git diff --cached THROW_GENERIC_MAPPING_REPORT.md').toString();
        
        const lines = diff.split('\n');
        let hasTestsLoadRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
          }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Bloquear qualquer adição
            if (line.startsWith('+')) {
              return { authorized: false, reason: 'THROW_GENERIC_MAPPING_REPORT.md diff can only contain removal of tests/load reference. Found addition: ' + line };
            }
            // Permitir apenas a remoção exata da referência a tests/load
            // Git diff mostra deletions com prefixo '-' ou '--' (contexto)
            if (line === '-`tests/load/` - 10 ocorrências' || line === '-- `tests/load/` - 10 ocorrências' || line === '- `tests/load/` - 10 ocorrências' || line === '-- `tests/load/` - 10 ocorrências') {
              hasTestsLoadRemoval = true;
            } else {
              // Bloquear qualquer outra remoção
              return { authorized: false, reason: 'THROW_GENERIC_MAPPING_REPORT.md diff can only contain removal of tests/load reference. Found unexpected removal: ' + line };
            }
          }
        }
        
        if (!hasTestsLoadRemoval) {
          return { authorized: false, reason: 'THROW_GENERIC_MAPPING_REPORT.md diff must contain removal of tests/load reference' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check THROW_GENERIC_MAPPING_REPORT.md diff' };
      }
    }
    
    // Se for scripts/get-token.ts, precisa verificar que o status é D (deleted)
    if (filePath === "scripts/get-token.ts") {
      try {
        const status = execSync('git diff --cached --name-status -- scripts/get-token.ts').toString().trim();
        if (!status.startsWith('D')) {
          return { authorized: false, reason: 'scripts/get-token.ts must have status D (deleted). Found: ' + status };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check scripts/get-token.ts status' };
      }
    }
    
    // Se for tests/load/access_token.txt, precisa verificar que o status é D (deleted)
    if (filePath === "tests/load/access_token.txt") {
      try {
        const status = execSync('git diff --cached --name-status -- tests/load/access_token.txt').toString().trim();
        if (!status.startsWith('D')) {
          return { authorized: false, reason: 'tests/load/access_token.txt must have status D (deleted). Found: ' + status };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check tests/load/access_token.txt status' };
      }
    }
    
    return {
      authorized: true,
      reason: "P23-R-08I-04E formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=" + authorizedValue + " (remove obsolete load token script)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09B-FIX para remover fix:vendedor script
 * Requer variável ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT
 * Permite somente:
 *   - package.json (apenas para remover "fix:vendedor": "node server/scripts/fix-vendedor.js")
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09BRemoveDeadFixVendedorScriptAuthorized(filePath) {
  const authorizedValue = "P23_R09_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT";
  const envValue = process.env.ERP_AUTHORIZED_PACKAGE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09B_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT_AUTHORIZED_FILES.includes(filePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de fix:vendedor
    if (filePath === "package.json") {
      try {
        const diff = execSync('git diff --cached package.json').toString();
        
        const lines = diff.split('\n');
        let hasFixVendedorRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
          }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Permitir apenas a remoção exata de fix:vendedor
            if (line === '-    "fix:vendedor": "node server/scripts/fix-vendedor.js",') {
              hasFixVendedorRemoval = true;
            } else {
              // Bloquear qualquer outra alteração
              return { authorized: false, reason: 'package.json diff can only contain removal of fix:vendedor script. Found: ' + line };
            }
          }
        }
        
        if (!hasFixVendedorRemoval) {
          return { authorized: false, reason: 'package.json diff must contain removal of fix:vendedor script' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check package.json diff' };
      }
    }
    
    return {
      authorized: true,
      reason: "P23-R-09B-FIX formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=" + authorizedValue + " (remove dead fix:vendedor script)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09F para remover db:push:prod script
 * Requer variável ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT
 * Permite somente:
 *   - package.json (apenas para remover "db:push:prod": "node server/scripts/db-push-prod.js")
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09FRemoveDeadDbPushProdScriptAuthorized(filePath) {
  const authorizedValue = "P23_R09_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT";
  const envValue = process.env.ERP_AUTHORIZED_PACKAGE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09F_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT_AUTHORIZED_FILES.includes(filePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de db:push:prod
    if (filePath === "package.json") {
      try {
        const diff = execSync('git diff --cached package.json').toString();
        
        const lines = diff.split('\n');
        let hasDbPushProdRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
          }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Permitir apenas a remoção exata de db:push:prod
            if (line === '-    "db:push:prod": "node server/scripts/db-push-prod.js",') {
              hasDbPushProdRemoval = true;
            } else {
              // Bloquear qualquer outra alteração
              return { authorized: false, reason: 'package.json diff can only contain removal of db:push:prod script. Found: ' + line };
            }
          }
        }
        
        if (!hasDbPushProdRemoval) {
          return { authorized: false, reason: 'package.json diff must contain removal of db:push:prod script' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check package.json diff' };
      }
    }
    
    return {
      authorized: true,
      reason: "P23-R-09F formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=" + authorizedValue + " (remove dead db:push:prod script)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09G-AUTH para hardening do hard test shutdown
 * Requer variável ERP_AUTHORIZED_CORE_UPDATE=P23_R09_HARD_TEST_SHUTDOWN_HARDENING
 * Permite somente:
 *   - server/_core/index.ts (hardening do endpoint /api/__hard-test/shutdown)
 *   - server/scripts/hard-test-shutdown.mjs (hardening do script)
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09GHardTestShutdownHardeningAuthorized(filePath) {
  const authorizedValue = "P23_R09_HARD_TEST_SHUTDOWN_HARDENING";
  const envValue = process.env.ERP_AUTHORIZED_CORE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09G_HARD_TEST_SHUTDOWN_HARDENING_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-09G-AUTH formal window: ERP_AUTHORIZED_CORE_UPDATE=" + authorizedValue + " (harden hard test shutdown)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09H para remover test:hard-shutdown script alias
 * Requer variável ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS
 * Permite somente:
 *   - package.json (apenas para remover "test:hard-shutdown": "node server/scripts/hard-test-shutdown.mjs")
 *   - server/scripts/hard-test-shutdown.mjs (apenas para atualizar comentário de uso)
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09HRemoveHardTestShutdownScriptAliasAuthorized(filePath) {
  const authorizedValue = "P23_R09_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS";
  const envValue = process.env.ERP_AUTHORIZED_PACKAGE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09H_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS_AUTHORIZED_FILES.includes(filePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de test:hard-shutdown
    if (filePath === "package.json") {
      try {
        const diff = execSync('git diff --cached package.json').toString();
        
        const lines = diff.split('\n');
        let hasHardTestShutdownRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
                   }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Permitir apenas a remoção exata de test:hard-shutdown
            if (line === '-    "test:hard-shutdown": "node server/scripts/hard-test-shutdown.mjs",') {
              hasHardTestShutdownRemoval = true;
            } else {
              // Bloquear qualquer outra alteração
              return { authorized: false, reason: 'package.json diff can only contain removal of test:hard-shutdown script. Found: ' + line };
            }
          }
        }
        
        if (!hasHardTestShutdownRemoval) {
          return { authorized: false, reason: 'package.json diff must contain removal of test:hard-shutdown script' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check package.json diff' };
      }
    }
    
    return {
      authorized: true,
      reason: "P23-R-09H-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=" + authorizedValue + " (remove hard test shutdown package alias)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09J para remover validate:final script morto
 * Requer variável ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT
 * Permite somente:
 *   - package.json (apenas para remover "validate:final": "node FINAL-VALIDATION-REAL.mjs")
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09JRemoveDeadValidateFinalScriptAuthorized(filePath) {
  const authorizedValue = "P23_R09_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT";
  const envValue = process.env.ERP_AUTHORIZED_PACKAGE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09J_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT_AUTHORIZED_FILES.includes(filePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de validate:final
    if (filePath === "package.json") {
      try {
        const diff = execSync('git diff --cached package.json').toString();
        
        const lines = diff.split('\n');
        let hasValidateFinalRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
          }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Permitir apenas a remoção exata de validate:final
            if (line === '-    "validate:final": "node FINAL-VALIDATION-REAL.mjs",') {
              hasValidateFinalRemoval = true;
            } else {
              // Bloquear qualquer outra alteração
              return { authorized: false, reason: 'package.json diff can only contain removal of validate:final script. Found: ' + line };
            }
          }
        }
        
        if (!hasValidateFinalRemoval) {
          return { authorized: false, reason: 'package.json diff must contain removal of validate:final script' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check package.json diff' };
      }
    }
    
    return {
      authorized: true,
      reason: "P23-R-09J-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=" + authorizedValue + " (remove dead validate final script)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09K2 para hardening do db push env gate
 * Requer variável ERP_AUTHORIZED_DB_WRAPPER_HARDENING=P23_R09K_DB_PUSH_ENV_GATE
 * Permite somente:
 *   - scripts/db/drizzle-wrapper.mjs (hardening)
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09K2DbWrapperHardeningAuthorized(filePath) {
  const authorizedValue = "P23_R09K_DB_PUSH_ENV_GATE";
  const envValue = process.env.ERP_AUTHORIZED_DB_WRAPPER_HARDENING;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09K2_DB_WRAPPER_HARDENING_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-09K2-AUTH formal window: ERP_AUTHORIZED_DB_WRAPPER_HARDENING=" + authorizedValue + " (harden db push env gate)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09K3 para remover o alias cru db:push
 * Requer variável ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09K_REMOVE_DB_PUSH_ALIAS
 * Permite somente:
 *   - package.json (apenas para remover "db:push": "node scripts/db/drizzle-wrapper.mjs push")
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09K3RemoveRawDbPushAliasAuthorized(filePath) {
  const authorizedValue = "P23_R09K_REMOVE_DB_PUSH_ALIAS";
  const envValue = process.env.ERP_AUTHORIZED_PACKAGE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09K3_REMOVE_DB_PUSH_ALIAS_AUTHORIZED_FILES.includes(filePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção do alias db:push
    if (filePath === "package.json") {
      try {
        const diff = execSync('git diff --cached package.json').toString();
        
        const lines = diff.split('\n');
        let hasDbPushRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
          }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Permitir apenas a remoção exata do alias db:push
            if (line === '-    "db:push": "node scripts/db/drizzle-wrapper.mjs push",') {
              hasDbPushRemoval = true;
            } else {
              // Bloquear qualquer outra alteração
              return { authorized: false, reason: 'package.json diff can only contain removal of db:push alias. Found: ' + line };
            }
          }
        }
        
        if (!hasDbPushRemoval) {
          return { authorized: false, reason: 'package.json diff must contain removal of db:push alias' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check package.json diff' };
      }
    }
    
    return {
      authorized: true,
      reason: "P23-R-09K3-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=" + authorizedValue + " (remove raw db push alias)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09M para remover o alias seed:admin
 * Requer variável ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09M_REMOVE_SEED_ADMIN_ALIAS
 * Permite somente:
 *   - package.json (apenas para remover "seed:admin": "tsx server/scripts/seed-admin.ts")
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09MRemoveSeedAdminAliasAuthorized(filePath) {
  const authorizedValue = "P23_R09M_REMOVE_SEED_ADMIN_ALIAS";
  const envValue = process.env.ERP_AUTHORIZED_PACKAGE_UPDATE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09M_REMOVE_SEED_ADMIN_ALIAS_AUTHORIZED_FILES.includes(filePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção do alias seed:admin
    if (filePath === "package.json") {
      try {
        const diff = execSync('git diff --cached package.json').toString();
        
        const lines = diff.split('\n');
        let hasSeedAdminRemoval = false;
        
        for (const line of lines) {
          // Ignorar linhas de cabeçalho do diff
          if (line.startsWith('diff --git') || 
              line.startsWith('index ') || 
              line.startsWith('---') || 
              line.startsWith('+++') || 
              line.startsWith('@@')) {
            continue;
          }
          
          // Verificar linhas de alteração
          if (line.startsWith('+') || line.startsWith('-')) {
            // Permitir apenas a remoção exata do alias seed:admin
            if (line === '-    "seed:admin": "tsx server/scripts/seed-admin.ts",') {
              hasSeedAdminRemoval = true;
            } else {
              // Bloquear qualquer outra alteração
              return { authorized: false, reason: 'package.json diff can only contain removal of seed:admin alias. Found: ' + line };
            }
          }
        }
        
        if (!hasSeedAdminRemoval) {
          return { authorized: false, reason: 'package.json diff must contain removal of seed:admin alias' };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check package.json diff' };
      }
    }
    
    return {
      authorized: true,
      reason: "P23-R-09M-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=" + authorizedValue + " (remove seed admin alias)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09O para remover o script legado seed-admin.ts
 * Requer variável ERP_AUTHORIZED_SCRIPT_REMOVAL=P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT
 * Permite somente:
 *   - server/scripts/seed-admin.ts (apenas deleção total do arquivo — status D)
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09ORemoveLegacySeedAdminScriptAuthorized(filePath) {
  const authorizedValue = "P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT";
  const envValue = process.env.ERP_AUTHORIZED_SCRIPT_REMOVAL;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT_AUTHORIZED_FILES.includes(filePath)) {
    // Para seed-admin.ts: permitir somente deleção total (status D no staged)
    if (filePath === "server/scripts/seed-admin.ts") {
      try {
        const status = execSync('git diff --cached --name-status -- server/scripts/seed-admin.ts').toString().trim();
        if (!status.startsWith('D')) {
          return { authorized: false, reason: 'server/scripts/seed-admin.ts must be fully deleted (staged status D). Modifications, partial edits or new content are forbidden. Found: ' + status };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check seed-admin.ts staged status' };
      }
    }

    return {
      authorized: true,
      reason: "P23-R-09O-AUTH formal window: ERP_AUTHORIZED_SCRIPT_REMOVAL=" + authorizedValue + " (remove legacy seed-admin script)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09Q para limpeza de referências mortas a seed:admin
 * Requer variável ERP_AUTHORIZED_DOC_SEED_ADMIN_CLEANUP=P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES
 * Permite somente:
 *   - docs listados (apenas limpeza textual — sem novo comando/credencial em linhas adicionadas)
 *   - client/src/INTEGRATION_README.md (idem)
 *   - server/scripts/seed-massa-teste.ts (apenas comentário/warning morto — sem tocar lógica)
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09QCleanDeadSeedAdminReferencesAuthorized(filePath) {
  const authorizedValue = "P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES";
  const envValue = process.env.ERP_AUTHORIZED_DOC_SEED_ADMIN_CLEANUP;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES_AUTHORIZED_FILES.includes(filePath)) {
    // Guard files: não exigem checagem de diff (janela formal referencia a si mesma)
    if (filePath === "scripts/guardrail-check.js" || filePath === "scripts/architecture-contract-guard.mjs") {
      return {
        authorized: true,
        reason: "P23-R-09Q-AUTH formal window: ERP_AUTHORIZED_DOC_SEED_ADMIN_CLEANUP=" + authorizedValue + " (clean dead seed-admin references)"
      };
    }

    try {
      const diff = execSync('git diff --cached ' + filePath).toString();
      const lines = diff.split("\n");

      for (const line of lines) {
        const isAdded = line.startsWith("+") && !line.startsWith("+++");
        const isRemoved = line.startsWith("-") && !line.startsWith("---");
        if (!isAdded && !isRemoved) continue;

        // Para seed-massa-teste.ts: linhas alteradas NÃO podem tocar lógica
        if (filePath === "server/scripts/seed-massa-teste.ts") {
          for (const pattern of P23_R09Q_SEED_MASSA_FORBIDDEN_PATTERNS) {
            if (line.includes(pattern)) {
              return { authorized: false, reason: "seed-massa-teste.ts diff can only touch dead text (comment/warning). Logic lines forbidden. Found pattern '" + pattern + "' in line: " + line };
            }
          }
        }

        // Linhas adicionadas não podem conter novo comando seed ou nova credencial
        if (isAdded) {
          for (const pattern of P23_R09Q_FORBIDDEN_ADDITION_PATTERNS) {
            if (line.includes(pattern)) {
              return { authorized: false, reason: "P23-R-09Q allows only cleanup of dead references. New seed command or credential forbidden in added line: " + line };
            }
          }
        }
      }
    } catch (error) {
      return { authorized: false, reason: "Failed to check staged diff for " + filePath };
    }

    return {
      authorized: true,
      reason: "P23-R-09Q-AUTH formal window: ERP_AUTHORIZED_DOC_SEED_ADMIN_CLEANUP=" + authorizedValue + " (clean dead seed-admin references)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09R para remoção/gate de credenciais fracas vivas
 * Requer variável ERP_AUTHORIZED_WEAK_CREDENTIAL_CLEANUP=P23_R09R_WEAK_CREDENTIAL_CLEANUP
 * Permite somente:
 *   - server/_core/auth-detection.ts (remover/gatear hardcode admin123 — sem nova mecânica de credencial)
 *   - server/scripts/reset-admin-password.ts (remover ou gate forte — ENV/tenant explícito, sem plaintext)
 *   - INSTALAR_CORRIGIDO*.bat (apenas remover anúncio de credencial fraca — sem novas credenciais/comandos)
 *   - util/test/load-test.ts (apenas trocar exemplo de credencial por placeholder seguro)
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 */
function isP23_R09RWeakCredentialCleanupAuthorized(filePath) {
  const authorizedValue = "P23_R09R_WEAK_CREDENTIAL_CLEANUP";
  const envValue = process.env.ERP_AUTHORIZED_WEAK_CREDENTIAL_CLEANUP;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09R_WEAK_CREDENTIAL_CLEANUP_AUTHORIZED_FILES.includes(filePath)) {
    // Guard files: não exigem checagem de diff (janela formal referencia a si mesma)
    if (filePath === "scripts/guardrail-check.js" || filePath === "scripts/architecture-contract-guard.mjs") {
      return {
        authorized: true,
        reason: "P23-R-09R-AUTH formal window: ERP_AUTHORIZED_WEAK_CREDENTIAL_CLEANUP=" + authorizedValue + " (weak credential cleanup)"
      };
    }

    try {
      const diff = execSync('git diff --cached -- "' + filePath + '"').toString();
      const lines = diff.split("\n");
      const fileSpecificPatterns = P23_R09R_FILE_SPECIFIC_FORBIDDEN_PATTERNS[filePath] || [];

      for (const line of lines) {
        const isAdded = line.startsWith("+") && !line.startsWith("+++");
        if (!isAdded) continue;

        // Linhas adicionadas não podem conter nova credencial/comando perigoso/mount smart-auth
        for (const pattern of P23_R09R_FORBIDDEN_ADDITION_PATTERNS) {
          if (line.includes(pattern)) {
            return { authorized: false, reason: "P23-R-09R allows only weak credential cleanup. New credential/dangerous reference forbidden in added line: " + line };
          }
        }

        // Regras específicas por arquivo (mecânica de credencial insegura)
        for (const pattern of fileSpecificPatterns) {
          if (line.includes(pattern)) {
            return { authorized: false, reason: "P23-R-09R file rule violation for " + filePath + ". Forbidden pattern '" + pattern + "' in added line: " + line };
          }
        }
      }
    } catch (error) {
      return { authorized: false, reason: "Failed to check staged diff for " + filePath };
    }

    return {
      authorized: true,
      reason: "P23-R-09R-AUTH formal window: ERP_AUTHORIZED_WEAK_CREDENTIAL_CLEANUP=" + authorizedValue + " (weak credential cleanup)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09S para lockdown do seed-massa-teste.ts
 * Requer variável ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN=P23_R09S_SEED_MASSA_LOCKDOWN
 * Permite somente:
 *   - server/scripts/seed-massa-teste.ts (gate forte: falha por padrão, sem DEFAULT_TENANT_ID/getAllVendedores/ids hardcoded)
 *   - docs/operations/CHECKLIST_TESTE_OPERACIONAL.md (corrigir/remover orientação de execução direta)
 *   - docs/operations/PLANO_TESTE_OPERACIONAL_EMPRESA.md (corrigir/remover orientação de execução direta)
 *   - scripts/guardrail-check.js (janela formal)
 *   - scripts/architecture-contract-guard.mjs (janela formal)
 * Janela fail-closed: com a variável correta definida, qualquer arquivo fora da lista é bloqueado.
 */
function isP23_R09SSeedMassaLockdownAuthorized(filePath) {
  const authorizedValue = "P23_R09S_SEED_MASSA_LOCKDOWN";
  const envValue = process.env.ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES.includes(filePath)) {
    // Guard files: não exigem checagem de diff (janela formal referencia a si mesma)
    if (filePath === "scripts/guardrail-check.js" || filePath === "scripts/architecture-contract-guard.mjs") {
      return {
        authorized: true,
        reason: "P23-R-09S-AUTH formal window: ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN=" + authorizedValue + " (seed massa lockdown)"
      };
    }

    try {
      const diff = execSync('git diff --cached -- "' + filePath + '"').toString();
      const lines = diff.split("\n");
      const fileSpecificPatterns = P23_R09S_FILE_SPECIFIC_FORBIDDEN_PATTERNS[filePath] || [];

      for (const line of lines) {
        const isAdded = line.startsWith("+") && !line.startsWith("+++");
        if (!isAdded) continue;

        // Linhas adicionadas não podem conter nova credencial/seed legado/reset perigoso
        for (const pattern of P23_R09S_FORBIDDEN_ADDITION_PATTERNS) {
          if (line.includes(pattern)) {
            return { authorized: false, reason: "P23-R-09S allows only seed-massa lockdown. New dangerous reference forbidden in added line: " + line };
          }
        }

        // Regras específicas por arquivo (lógica insegura no seed / instrução de execução direta nos docs)
        for (const pattern of fileSpecificPatterns) {
          if (line.includes(pattern)) {
            return { authorized: false, reason: "P23-R-09S file rule violation for " + filePath + ". Forbidden pattern '" + pattern + "' in added line: " + line };
          }
        }
      }
    } catch (error) {
      return { authorized: false, reason: "Failed to check staged diff for " + filePath };
    }

    return {
      authorized: true,
      reason: "P23-R-09S-AUTH formal window: ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN=" + authorizedValue + " (seed massa lockdown)"
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09T para cleanup da dead ref em ENV_RULES.md
 * Variável ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP com 2 valores distintos:
 *   =P23_R09T_ENV_RULES_SEED_MASSA_AUTH    → fase AUTH: permite SOMENTE os 2 guards
 *   =P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP → fase CLEAN: permite SOMENTE ENV_RULES.md
 *     (gate forte: zero adições; EXATAMENTE 1 remoção contendo a referência a seed-massa-teste.ts)
 * Guards NÃO são autorizados sob o valor CLEAN — a janela CLEAN é de alvo único.
 * Janela fail-closed: com qualquer valor válido definido, arquivo fora do escopo é bloqueado.
 */
function isP23_R09TEnvRulesSeedMassaCleanupAuthorized(filePath) {
  const envValue = process.env.ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (ENV_RULES.md permanece bloqueado na fase AUTH)
  if (envValue === P23_R09T_ENV_RULES_SEED_MASSA_AUTH_VALUE) {
    if (P23_R09T_AUTH_AUTHORIZED_FILES.includes(filePath)) {
      return {
        authorized: true,
        reason: "P23-R-09T-AUTH formal window: ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP=" + P23_R09T_ENV_RULES_SEED_MASSA_AUTH_VALUE + " (guards only — ENV_RULES.md locked)"
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de CLEAN: bloqueia
  if (envValue !== P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_VALUE) {
    return { authorized: false };
  }

  // Valor CLEAN: permite SOMENTE ENV_RULES.md (guards ficam bloqueados sob o valor CLEAN)
  if (P23_R09T_CLEANUP_AUTHORIZED_FILES.includes(filePath)) {
    try {
      const diff = execSync('git diff --cached -- "' + filePath + '"').toString();
      const lines = diff.split("\n");
      let deadRefRemovals = 0;

      for (const line of lines) {
        const isAdded = line.startsWith("+") && !line.startsWith("+++");
        const isRemoved = line.startsWith("-") && !line.startsWith("---");

        // R09T: nenhuma linha adicionada é permitida em ENV_RULES.md
        if (isAdded) {
          return { authorized: false, reason: "P23-R-09T permite somente remoção da dead ref em ENV_RULES.md. Linha adicionada proibida: " + line };
        }

        if (isRemoved) {
          // Única remoção permitida: a linha que referencia server/scripts/seed-massa-teste.ts
          if (!line.includes(P23_R09T_ALLOWED_REMOVAL_PATTERN)) {
            return { authorized: false, reason: "P23-R-09T permite remover somente a referência a " + P23_R09T_ALLOWED_REMOVAL_PATTERN + " em ENV_RULES.md. Remoção proibida: " + line };
          }
          deadRefRemovals++;
        }
      }

      if (deadRefRemovals !== 1) {
        return { authorized: false, reason: "P23-R-09T exige exatamente 1 remoção da referência a " + P23_R09T_ALLOWED_REMOVAL_PATTERN + " em ENV_RULES.md. Remoções da dead ref detectadas: " + deadRefRemovals };
      }
    } catch (error) {
      return { authorized: false, reason: "Failed to check staged diff for " + filePath };
    }

    return {
      authorized: true,
      reason: "P23-R-09T-CLEAN formal window: ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP=" + P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_VALUE + " (ENV_RULES seed-massa dead ref cleanup)"
    };
  }

  // Arquivo fora do escopo do valor ativo (inclui guards sob CLEAN e ENV_RULES sob AUTH): bloqueia
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09U para o fix de isolamento multi-tenant do vendedores.list
 * Variável ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX com 2 valores distintos:
 *   =P23_R09U_VENDEDORES_LIST_TENANT_AUTH → fase AUTH: permite SOMENTE os 2 guards
 *   =P23_R09U_VENDEDORES_LIST_TENANT_FIX  → fase FIX: permite SOMENTE users.service.ts + routers.ts + teste autorizado
 * Guards NÃO são autorizados sob o valor FIX — escopos mutuamente exclusivos.
 * Janela fail-closed: com qualquer valor válido definido, arquivo fora do escopo é bloqueado.
 */
function isP23_R09UVendedoresListTenantFixAuthorized(filePath) {
  const envValue = process.env.ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (service/router/teste bloqueados na fase AUTH)
  if (envValue === P23_R09U_VENDEDORES_LIST_TENANT_AUTH_VALUE) {
    if (P23_R09U_AUTH_AUTHORIZED_FILES.includes(filePath)) {
      return {
        authorized: true,
        reason: "P23-R-09U-AUTH formal window: ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX=" + P23_R09U_VENDEDORES_LIST_TENANT_AUTH_VALUE + " (guards only — fix targets locked)"
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R09U_VENDEDORES_LIST_TENANT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE service + router + teste autorizado (guards bloqueados sob FIX)
  if (P23_R09U_FIX_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-09U-FIX formal window: ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX=" + P23_R09U_VENDEDORES_LIST_TENANT_FIX_VALUE + " (vendedores.list tenant isolation fix)"
    };
  }

  // Arquivo fora do escopo do valor ativo: bloqueia
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09W para o fix de isolamento multi-tenant das mutações de vendedor
 * Variável ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX com 2 valores distintos:
 *   =P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH → fase AUTH: permite SOMENTE os 2 guards
 *   =P23_R09W_VENDEDORES_MUTATION_TENANT_FIX  → fase FIX: permite SOMENTE users.service.ts + routers.ts + teste autorizado
 * Guards NÃO são autorizados sob o valor FIX — escopos mutuamente exclusivos.
 * Janela fail-closed: com qualquer valor válido definido, arquivo fora do escopo é bloqueado.
 */
function isP23_R09WVendedoresMutationTenantFixAuthorized(filePath) {
  const envValue = process.env.ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (service/router/teste bloqueados na fase AUTH)
  if (envValue === P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH_VALUE) {
    if (P23_R09W_AUTH_AUTHORIZED_FILES.includes(filePath)) {
      return {
        authorized: true,
        reason: "P23-R-09W-AUTH formal window: ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX=" + P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH_VALUE + " (guards only — fix targets locked)"
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE service + router + teste autorizado (guards bloqueados sob FIX)
  if (P23_R09W_FIX_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-09W-FIX formal window: ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX=" + P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_VALUE + " (vendedores mutation tenant isolation fix)"
    };
  }

  // Arquivo fora do escopo do valor ativo: bloqueia
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09X para o hardening de getVendedorById com tenant obrigatório
 * Variável ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING com 2 valores distintos:
 *   =P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH → fase AUTH: permite SOMENTE os 2 guards
 *   =P23_R09X_VENDEDOR_BY_ID_TENANT_FIX  → fase FIX: permite SOMENTE users.service.ts + routers.ts + ownership.ts + service-actor.ts + teste autorizado
 * Guards NÃO são autorizados sob o valor FIX — escopos mutuamente exclusivos.
 * Janela fail-closed: com qualquer valor válido definido, arquivo fora do escopo é bloqueado.
 */
function isP23_R09XVendedorByIdTenantHardeningAuthorized(filePath) {
  const envValue = process.env.ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (service/router/ownership/actor/teste bloqueados na fase AUTH)
  if (envValue === P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH_VALUE) {
    if (P23_R09X_AUTH_AUTHORIZED_FILES.includes(filePath)) {
      return {
        authorized: true,
        reason: "P23-R-09X-AUTH formal window: ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING=" + P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH_VALUE + " (guards only — fix targets locked)"
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R09X_VENDEDOR_BY_ID_TENANT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE service + router + ownership + actor + teste autorizado (guards bloqueados sob FIX)
  if (P23_R09X_FIX_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-09X-FIX formal window: ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING=" + P23_R09X_VENDEDOR_BY_ID_TENANT_FIX_VALUE + " (getVendedorById tenant hardening)"
    };
  }

  // Arquivo fora do escopo do valor ativo: bloqueia
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09Y para o hardening de lookups por nome + permissões Leo multi-tenant
 * Variável ERP_AUTHORIZED_NAME_PERMISSION_TENANT_HARDENING com 2 valores distintos:
 *   =P23_R09Y_NAME_PERMISSION_TENANT_AUTH → fase AUTH: permite SOMENTE os 2 guards
 *   =P23_R09Y_NAME_PERMISSION_TENANT_FIX  → fase FIX: permite SOMENTE db/core.ts + users.service.ts + routers.ts + users.tool.ts + leo-permissions.ts + teste autorizado
 * Guards NÃO são autorizados sob o valor FIX — escopos mutuamente exclusivos.
 * Janela fail-closed: com qualquer valor válido definido, arquivo fora do escopo é bloqueado.
 */
function isP23_R09YNamePermissionTenantHardeningAuthorized(filePath) {
  const envValue = process.env.ERP_AUTHORIZED_NAME_PERMISSION_TENANT_HARDENING;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (db/core/service/router/tool/leo/teste bloqueados na fase AUTH)
  if (envValue === P23_R09Y_NAME_PERMISSION_TENANT_AUTH_VALUE) {
    if (P23_R09Y_AUTH_AUTHORIZED_FILES.includes(filePath)) {
      return {
        authorized: true,
        reason: "P23-R-09Y-AUTH formal window: ERP_AUTHORIZED_NAME_PERMISSION_TENANT_HARDENING=" + P23_R09Y_NAME_PERMISSION_TENANT_AUTH_VALUE + " (guards only — fix targets locked)"
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R09Y_NAME_PERMISSION_TENANT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE db/core + service + router + tool + leo-permissions + teste autorizado (guards bloqueados sob FIX)
  if (P23_R09Y_FIX_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-09Y-FIX formal window: ERP_AUTHORIZED_NAME_PERMISSION_TENANT_HARDENING=" + P23_R09Y_NAME_PERMISSION_TENANT_FIX_VALUE + " (name/permission tenant hardening)"
    };
  }

  // Arquivo fora do escopo do valor ativo: bloqueia
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-09Z para o hardening de vendedor por userId + cadeia de login/identidade
 * Variável ERP_AUTHORIZED_VENDEDOR_USER_TENANT_HARDENING com 2 valores distintos:
 *   =P23_R09Z_VENDEDOR_USER_TENANT_AUTH → fase AUTH: permite SOMENTE os 2 guards
 *   =P23_R09Z_VENDEDOR_USER_TENANT_FIX  → fase FIX: permite SOMENTE service + router + service-actor + tenant-ownership + core-bootstrap + db/core + db/index + teste autorizado
 * Guards NÃO são autorizados sob o valor FIX — escopos mutuamente exclusivos.
 * Janela fail-closed: com qualquer valor válido definido, arquivo fora do escopo é bloqueado.
 */
function isP23_R09ZVendedorUserTenantHardeningAuthorized(filePath) {
  const envValue = process.env.ERP_AUTHORIZED_VENDEDOR_USER_TENANT_HARDENING;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (service/router/_core/db e teste bloqueados na fase AUTH)
  if (envValue === P23_R09Z_VENDEDOR_USER_TENANT_AUTH_VALUE) {
    if (P23_R09Z_AUTH_AUTHORIZED_FILES.includes(filePath)) {
      return {
        authorized: true,
        reason: "P23-R-09Z-AUTH formal window: ERP_AUTHORIZED_VENDEDOR_USER_TENANT_HARDENING=" + P23_R09Z_VENDEDOR_USER_TENANT_AUTH_VALUE + " (guards only — fix targets locked)"
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R09Z_VENDEDOR_USER_TENANT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE service + router + service-actor + tenant-ownership + core-bootstrap + db/core + db/index + teste autorizado (guards bloqueados sob FIX)
  if (P23_R09Z_FIX_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-09Z-FIX formal window: ERP_AUTHORIZED_VENDEDOR_USER_TENANT_HARDENING=" + P23_R09Z_VENDEDOR_USER_TENANT_FIX_VALUE + " (vendedor-by-userid/login/identity tenant hardening)"
    };
  }

  // Arquivo fora do escopo do valor ativo: bloqueia
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-10B para a arquitetura JWT de sessão
 * Variável ERP_AUTHORIZED_JWT_SESSION_ARCHITECTURE com 2 valores distintos:
 *   =P23_R10B_JWT_SESSION_AUTH → fase AUTH: permite SOMENTE os 2 guards
 *   =P23_R10B_JWT_SESSION_FIX  → fase FIX: permite SOMENTE routers + jwt-auth + context + smart-auth + authStore + auth.service + teste autorizado
 * Guards NÃO são autorizados sob o valor FIX — escopos mutuamente exclusivos.
 * Janela fail-closed: com qualquer valor válido definido, arquivo fora do escopo é bloqueado.
 */
function isP23_R10BJwtSessionArchitectureAuthorized(filePath) {
  const envValue = process.env.ERP_AUTHORIZED_JWT_SESSION_ARCHITECTURE;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (router/jwt/context/smart-auth/client e teste bloqueados na fase AUTH)
  if (envValue === P23_R10B_JWT_SESSION_AUTH_VALUE) {
    if (P23_R10B_AUTH_AUTHORIZED_FILES.includes(filePath)) {
      return {
        authorized: true,
        reason: "P23-R-10B-AUTH formal window: ERP_AUTHORIZED_JWT_SESSION_ARCHITECTURE=" + P23_R10B_JWT_SESSION_AUTH_VALUE + " (guards only — fix targets locked)"
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R10B_JWT_SESSION_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE routers + jwt-auth + context + smart-auth + authStore + auth.service + teste autorizado (guards bloqueados sob FIX)
  if (P23_R10B_FIX_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-10B-FIX formal window: ERP_AUTHORIZED_JWT_SESSION_ARCHITECTURE=" + P23_R10B_JWT_SESSION_FIX_VALUE + " (JWT session architecture — login/context/impersonation fix)"
    };
  }

  // Arquivo fora do escopo do valor ativo: bloqueia
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-R-10C-DOUBLE-BOOT para o fix do double-boot
 * Variável ERP_AUTHORIZED_DOUBLE_BOOT_FIX com 2 valores distintos:
 *   =P23_R10C_DOUBLE_BOOT_AUTH → fase AUTH: permite SOMENTE os 3 guards
 *   =P23_R10C_DOUBLE_BOOT_FIX  → fase FIX: permite SOMENTE server/_core/index.ts + tests/single-boot-guard.spec.ts
 * Guards NÃO são autorizados sob o valor FIX — escopos mutuamente exclusivos.
 * Janela fail-closed: com qualquer valor válido definido, arquivo fora do escopo é bloqueado.
 */
function isP23_R10CDoubleBootFixAuthorized(filePath) {
  const envValue = process.env.ERP_AUTHORIZED_DOUBLE_BOOT_FIX;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 3 guards (alvo do fix bloqueado na fase AUTH)
  if (envValue === P23_R10C_DOUBLE_BOOT_AUTH_VALUE) {
    if (P23_R10C_DOUBLE_BOOT_AUTH_AUTHORIZED_FILES.includes(filePath)) {
      return {
        authorized: true,
        reason: "P23-R-10C-DOUBLE-BOOT-AUTH formal window: ERP_AUTHORIZED_DOUBLE_BOOT_FIX=" + P23_R10C_DOUBLE_BOOT_AUTH_VALUE + " (guards only — fix targets locked)"
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R10C_DOUBLE_BOOT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE server/_core/index.ts + teste autorizado (guards bloqueados sob FIX)
  if (P23_R10C_DOUBLE_BOOT_FIX_AUTHORIZED_FILES.includes(filePath)) {
    return {
      authorized: true,
      reason: "P23-R-10C-DOUBLE-BOOT-FIX formal window: ERP_AUTHORIZED_DOUBLE_BOOT_FIX=" + P23_R10C_DOUBLE_BOOT_FIX_VALUE + " (double-boot startServer fix)"
    };
  }

  // Arquivo fora do escopo do valor ativo: bloqueia
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

  // P23-CORE check: if core update is authorized, allow these specific files
  // Janela histórica restrita ao commit 2884615ea
  const allP23CoreAuthorizedFiles = files.length > 0 && files.every(f => P23_CORE_AUTHORIZED_FILES.includes(f));
  if (allP23CoreAuthorizedFiles) {
    const p23_coreCheck = isP23_CoreAuthorizedUpdate(files[0]);
    if (p23_coreCheck.authorized) {
      console.log("\n📋 Arquivos P23-CORE detectados:");
      files.forEach(f => console.log(" - " + f));
      console.log(`\n✔ Guardrail OK — ${p23_coreCheck.reason}\n`);
      return;
    }
  }

  // P23-R-05B check: if guard files are modified with P23-R-05B window active, allow them
  const p23_r05bGuardFilesInChanges = files.filter(f => 
    f === "scripts/guardrail-check.js" || f === "scripts/architecture-contract-guard.mjs"
  );
  if (p23_r05bGuardFilesInChanges.length > 0) {
    const p23_r05bCheck = isP23_R05BAuthorizedDrizzleQuarantineCleanup(p23_r05bGuardFilesInChanges[0]);
    if (p23_r05bCheck.authorized) {
      // If guard files are authorized by P23-R-05B, remove them from files for further checks
      const nonGuardFiles = files.filter(f => f !== "scripts/guardrail-check.js" && f !== "scripts/architecture-contract-guard.mjs");
      if (nonGuardFiles.length === 0) {
        console.log("\n📋 Arquivos P23-R-05B guard files detectados:");
        p23_r05bGuardFilesInChanges.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_r05bCheck.reason + "\n");
        return;
      }
      // Continue checking non-guard files
      files.length = 0;
      files.push(...nonGuardFiles);
    }
  }

  // P24D-WINDOW check: if guard files are modified with P24D-WINDOW window active, allow them
  // IMPORTANTE: P24D-WINDOW vem antes de P21-TENANTS-WINDOW/P7-GUARD-WINDOW — a janela mais nova reivindica os guards primeiro
  const p24dWindowFilesInChanges = files.filter(f => P24D_TENANT_FK_GUARD_WINDOW_AUTHORIZED_FILES.includes(f));
  if (p24dWindowFilesInChanges.length > 0) {
    const p24dWindowCheck = isP24DTenantFkGuardWindowAuthorized(p24dWindowFilesInChanges[0]);
    if (p24dWindowCheck.authorized) {
      // Validate ALL guard files individually to ensure strict security
      for (const file of p24dWindowFilesInChanges) {
        const check = isP24DTenantFkGuardWindowAuthorized(file);
        if (!check.authorized) {
          console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
          console.error("Arquivo não autorizado: " + file + "\n");
          console.error("BLOQUEADO — guard update requer ERP_AUTHORIZED_GUARD_UPDATE=P24D_TENANT_FK_GUARD_WINDOW\n");
          process.exit(1);
        }
      }
      // If all changed files are authorized by P24D-WINDOW, allow them
      const nonP24dWindowFiles = files.filter(f => !P24D_TENANT_FK_GUARD_WINDOW_AUTHORIZED_FILES.includes(f));
      if (nonP24dWindowFiles.length === 0) {
        console.log("\n📋 Arquivos P24D-WINDOW detectados:");
        p24dWindowFilesInChanges.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p24dWindowCheck.reason + "\n");
        return;
      }
      // If there are other files besides the authorized ones, continue checking
      // But remove the authorized files from the list since they're already authorized
      files.length = 0;
      files.push(...nonP24dWindowFiles);
    }
  }

  // P21-TENANTS-WINDOW check: if guard files are modified with P21-TENANTS-WINDOW window active, allow them
  // IMPORTANTE: P21-TENANTS-WINDOW vem antes de P7-GUARD-WINDOW — a janela mais nova reivindica os guards primeiro
  const p21TenantsWindowFilesInChanges = files.filter(f => P21_TENANTS_GUARD_WINDOW_AUTHORIZED_FILES.includes(f));
  if (p21TenantsWindowFilesInChanges.length > 0) {
    const p21TenantsWindowCheck = isP21TenantsGuardWindowAuthorized(p21TenantsWindowFilesInChanges[0]);
    if (p21TenantsWindowCheck.authorized) {
      // Validate ALL guard files individually to ensure strict security
      for (const file of p21TenantsWindowFilesInChanges) {
        const check = isP21TenantsGuardWindowAuthorized(file);
        if (!check.authorized) {
          console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
          console.error("Arquivo não autorizado: " + file + "\n");
          console.error("BLOQUEADO — guard update requer ERP_AUTHORIZED_GUARD_UPDATE=P21_TENANTS_GUARD_WINDOW\n");
          process.exit(1);
        }
      }
      // If all changed files are authorized by P21-TENANTS-WINDOW, allow them
      const nonP21TenantsWindowFiles = files.filter(f => !P21_TENANTS_GUARD_WINDOW_AUTHORIZED_FILES.includes(f));
      if (nonP21TenantsWindowFiles.length === 0) {
        console.log("\n📋 Arquivos P21-TENANTS-WINDOW detectados:");
        p21TenantsWindowFilesInChanges.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p21TenantsWindowCheck.reason + "\n");
        return;
      }
      // If there are other files besides the authorized ones, continue checking
      // But remove the authorized files from the list since they're already authorized
      files.length = 0;
      files.push(...nonP21TenantsWindowFiles);
    }
  }

  // P7-GUARD-WINDOW check: if the 2 guard scripts are modified, require guard-update authorization variable
  // IMPORTANTE: P7-GUARD-WINDOW vem antes de R10C-DOUBLE-BOOT — a janela mais nova reivindica os guards primeiro
  const p7GuardWindowFilesInChanges = files.filter(f => P7_GUARD_WINDOW_AUTHORIZED_FILES.includes(f));
  if (p7GuardWindowFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p7GuardWindowFilesInChanges) {
      const check = isP7GuardWindowAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        console.error("BLOQUEADO — guard update requer ERP_AUTHORIZED_GUARD_UPDATE=P7_PEDIDOS_NUMERO_TENANT_UNIQUE_GUARD_WINDOW\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P7-GUARD-WINDOW, allow them
    const nonP7GuardWindowFiles = files.filter(f => !P7_GUARD_WINDOW_AUTHORIZED_FILES.includes(f));
    if (nonP7GuardWindowFiles.length === 0) {
      console.log("\n📋 Arquivos P7-GUARD-WINDOW detectados:");
      p7GuardWindowFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P7-GUARD-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=" + process.env.ERP_AUTHORIZED_GUARD_UPDATE + " (guard window creation)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonP7GuardWindowFiles);
  }

  // P23-R-10C-DOUBLE-BOOT check: if double-boot fix scope files or guard files are modified, require authorization variable
  // IMPORTANTE: R10C-DOUBLE-BOOT vem antes de R10B/R09Z/R09Y/R09X/R09W/R09U — reivindica guards e arquivos do fix primeiro
  // (server/_core/index.ts está também no claim de janelas anteriores: a janela mais nova reivindica primeiro)
  const p23_r10cDoubleBootFilesInChanges = files.filter(f => P23_R10C_DOUBLE_BOOT_AUTHORIZED_FILES.includes(f));

  // Janela R10C-DOUBLE-BOOT é fail-closed POR VALOR:
  //   AUTH → somente os 3 guards (qualquer outro arquivo bloqueado)
  //   FIX  → somente server/_core/index.ts + teste autorizado (guards e qualquer outro arquivo bloqueados)
  const p23_r10cEnvValue = process.env.ERP_AUTHORIZED_DOUBLE_BOOT_FIX;
  if (p23_r10cEnvValue === P23_R10C_DOUBLE_BOOT_AUTH_VALUE) {
    const p23_r10cOutsideFiles = files.filter(f => !P23_R10C_DOUBLE_BOOT_AUTH_AUTHORIZED_FILES.includes(f));
    if (p23_r10cOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-10C-DOUBLE-BOOT AUTH:\n");
      p23_r10cOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-10C-DOUBLE-BOOT AUTH permite somente: " + P23_R10C_DOUBLE_BOOT_AUTH_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }
  if (p23_r10cEnvValue === P23_R10C_DOUBLE_BOOT_FIX_VALUE) {
    const p23_r10cOutsideFiles = files.filter(f => !P23_R10C_DOUBLE_BOOT_FIX_AUTHORIZED_FILES.includes(f));
    if (p23_r10cOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-10C-DOUBLE-BOOT FIX:\n");
      p23_r10cOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-10C-DOUBLE-BOOT FIX permite somente: " + P23_R10C_DOUBLE_BOOT_FIX_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r10cDoubleBootFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r10cDoubleBootFilesInChanges) {
      const check = isP23_R10CDoubleBootFixAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — double-boot fix requer ERP_AUTHORIZED_DOUBLE_BOOT_FIX=P23_R10C_DOUBLE_BOOT_FIX\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-10C-DOUBLE-BOOT, allow them
    const nonR10CDoubleBootFiles = files.filter(f => !P23_R10C_DOUBLE_BOOT_AUTHORIZED_FILES.includes(f));
    if (nonR10CDoubleBootFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-10C-DOUBLE-BOOT detectados:");
      p23_r10cDoubleBootFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-10C-DOUBLE-BOOT formal window: ERP_AUTHORIZED_DOUBLE_BOOT_FIX=" + p23_r10cEnvValue + " (double-boot startServer fix)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR10CDoubleBootFiles);
  }

  // P23-R-10B check: if JWT session architecture scope files or guard files are modified, require authorization variable
  // IMPORTANTE: R10B vem antes de R09Z/R09Y/R09X/R09W/R09U — reivindica guards e arquivos do fix primeiro
  // (routers.ts está também no claim de janelas anteriores: a janela mais nova reivindica primeiro)
  const p23_r10bJwtSessionFilesInChanges = files.filter(f => P23_R10B_JWT_SESSION_ARCHITECTURE_AUTHORIZED_FILES.includes(f));

  // Janela R10B é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo bloqueado)
  //   FIX  → somente routers + jwt-auth + context + smart-auth + authStore + auth.service + teste autorizado
  //   (guards, session.service.ts, jwt-hardening.ts, sdk.ts, oauth.ts, server/db/**, users.service.ts,
  //    schema, migrations, baseline e package.json bloqueados)
  const p23_r10bEnvValue = process.env.ERP_AUTHORIZED_JWT_SESSION_ARCHITECTURE;
  if (p23_r10bEnvValue === P23_R10B_JWT_SESSION_AUTH_VALUE) {
    const p23_r10bOutsideFiles = files.filter(f => !P23_R10B_AUTH_AUTHORIZED_FILES.includes(f));
    if (p23_r10bOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-10B AUTH:\n");
      p23_r10bOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-10B AUTH permite somente: " + P23_R10B_AUTH_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }
  if (p23_r10bEnvValue === P23_R10B_JWT_SESSION_FIX_VALUE) {
    const p23_r10bOutsideFiles = files.filter(f => !P23_R10B_FIX_AUTHORIZED_FILES.includes(f));
    if (p23_r10bOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-10B FIX:\n");
      p23_r10bOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-10B FIX permite somente: " + P23_R10B_FIX_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r10bJwtSessionFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r10bJwtSessionFilesInChanges) {
      const check = isP23_R10BJwtSessionArchitectureAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — JWT session architecture requer ERP_AUTHORIZED_JWT_SESSION_ARCHITECTURE=P23_R10B_JWT_SESSION_FIX\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-10B, allow them
    const nonR10BFiles = files.filter(f => !P23_R10B_JWT_SESSION_ARCHITECTURE_AUTHORIZED_FILES.includes(f));
    if (nonR10BFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-10B detectados:");
      p23_r10bJwtSessionFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-10B formal window: ERP_AUTHORIZED_JWT_SESSION_ARCHITECTURE=" + p23_r10bEnvValue + " (JWT session architecture — login/context/impersonation fix)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR10BFiles);
  }

  // P23-R-09Z check: if vendedor-by-userId/login/identity scope files or guard files are modified, require authorization variable
  // IMPORTANTE: R09Z vem antes de R09Y/R09X/R09W/R09U — reivindica guards e arquivos do fix primeiro
  // (users.service.ts, routers.ts, service-actor.ts, tenant-ownership.ts e db/core.ts estão também no claim de janelas anteriores: a janela mais nova reivindica primeiro)
  const p23_r09zVendedorUserFilesInChanges = files.filter(f => P23_R09Z_VENDEDOR_USER_TENANT_HARDENING_AUTHORIZED_FILES.includes(f));

  // Janela R09Z é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo bloqueado)
  //   FIX  → somente service + router + service-actor + tenant-ownership + core-bootstrap + db/core + db/index + teste autorizado
  //   (guards, financeiro.router.ts, tools/**, leo/**, schema, migrations, package.json, frontend/**, tenant-validation.service.ts, baseline bloqueados)
  const p23_r09zEnvValue = process.env.ERP_AUTHORIZED_VENDEDOR_USER_TENANT_HARDENING;
  if (p23_r09zEnvValue === P23_R09Z_VENDEDOR_USER_TENANT_AUTH_VALUE) {
    const p23_r09zOutsideFiles = files.filter(f => !P23_R09Z_AUTH_AUTHORIZED_FILES.includes(f));
    if (p23_r09zOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09Z AUTH:\n");
      p23_r09zOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09Z AUTH permite somente: " + P23_R09Z_AUTH_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }
  if (p23_r09zEnvValue === P23_R09Z_VENDEDOR_USER_TENANT_FIX_VALUE) {
    const p23_r09zOutsideFiles = files.filter(f => !P23_R09Z_FIX_AUTHORIZED_FILES.includes(f));
    if (p23_r09zOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09Z FIX:\n");
      p23_r09zOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09Z FIX permite somente: " + P23_R09Z_FIX_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r09zVendedorUserFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09zVendedorUserFilesInChanges) {
      const check = isP23_R09ZVendedorUserTenantHardeningAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — vendedor-by-userId/login/identity hardening requer ERP_AUTHORIZED_VENDEDOR_USER_TENANT_HARDENING=P23_R09Z_VENDEDOR_USER_TENANT_FIX\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09Z, allow them
    const nonR09ZFiles = files.filter(f => !P23_R09Z_VENDEDOR_USER_TENANT_HARDENING_AUTHORIZED_FILES.includes(f));
    if (nonR09ZFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09Z detectados:");
      p23_r09zVendedorUserFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09Z formal window: ERP_AUTHORIZED_VENDEDOR_USER_TENANT_HARDENING=" + p23_r09zEnvValue + " (vendedor-by-userid/login/identity tenant hardening)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09ZFiles);
  }

  // P23-R-09Y check: if name/permission hardening scope files or guard files are modified, require authorization variable
  // IMPORTANTE: R09Y vem antes de R09X/R09W/R09U/R09T/R09S/R09R/R09Q — reivindica guards e arquivos do fix primeiro
  // (users.service.ts, routers.ts e db/core.ts estão também no claim de janelas anteriores: a janela mais nova reivindica primeiro)
  const p23_r09yNamePermissionFilesInChanges = files.filter(f => P23_R09Y_NAME_PERMISSION_TENANT_HARDENING_AUTHORIZED_FILES.includes(f));

  // Janela R09Y é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo bloqueado)
  //   FIX  → somente db/core + service + router + tool + leo-permissions + teste autorizado
  //   (guards, leo/index, _core/**, financeiro.router, baseline, schema, package.json, db/index, frontend/** bloqueados)
  const p23_r09yEnvValue = process.env.ERP_AUTHORIZED_NAME_PERMISSION_TENANT_HARDENING;
  if (p23_r09yEnvValue === P23_R09Y_NAME_PERMISSION_TENANT_AUTH_VALUE) {
    const p23_r09yOutsideFiles = files.filter(f => !P23_R09Y_AUTH_AUTHORIZED_FILES.includes(f));
    if (p23_r09yOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09Y AUTH:\n");
      p23_r09yOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09Y AUTH permite somente: " + P23_R09Y_AUTH_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }
  if (p23_r09yEnvValue === P23_R09Y_NAME_PERMISSION_TENANT_FIX_VALUE) {
    const p23_r09yOutsideFiles = files.filter(f => !P23_R09Y_FIX_AUTHORIZED_FILES.includes(f));
    if (p23_r09yOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09Y FIX:\n");
      p23_r09yOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09Y FIX permite somente: " + P23_R09Y_FIX_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r09yNamePermissionFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09yNamePermissionFilesInChanges) {
      const check = isP23_R09YNamePermissionTenantHardeningAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — name/permission tenant hardening requer ERP_AUTHORIZED_NAME_PERMISSION_TENANT_HARDENING=P23_R09Y_NAME_PERMISSION_TENANT_FIX\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09Y, allow them
    const nonR09YFiles = files.filter(f => !P23_R09Y_NAME_PERMISSION_TENANT_HARDENING_AUTHORIZED_FILES.includes(f));
    if (nonR09YFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09Y detectados:");
      p23_r09yNamePermissionFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09Y formal window: ERP_AUTHORIZED_NAME_PERMISSION_TENANT_HARDENING=" + p23_r09yEnvValue + " (name/permission tenant hardening)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09YFiles);
  }

  // P23-R-09X check: if vendedor-by-id hardening scope files or guard files are modified, require authorization variable
  // IMPORTANTE: R09X vem antes de R09W/R09U/R09T/R09S/R09R/R09Q — reivindica guards e arquivos do fix primeiro
  // (users.service.ts e routers.ts estão também no claim da R09W/R09U: a janela mais nova reivindica primeiro)
  const p23_r09xVendedorFilesInChanges = files.filter(f => P23_R09X_VENDEDOR_BY_ID_TENANT_HARDENING_AUTHORIZED_FILES.includes(f));

  // Janela R09X é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo bloqueado)
  //   FIX  → somente service + router + ownership + service-actor + teste autorizado
  //   (guards, db/core, financeiro.router, leo/**, tools/**, baseline, schema, package.json bloqueados)
  const p23_r09xEnvValue = process.env.ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING;
  if (p23_r09xEnvValue === P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH_VALUE) {
    const p23_r09xOutsideFiles = files.filter(f => !P23_R09X_AUTH_AUTHORIZED_FILES.includes(f));
    if (p23_r09xOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09X AUTH:\n");
      p23_r09xOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09X AUTH permite somente: " + P23_R09X_AUTH_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }
  if (p23_r09xEnvValue === P23_R09X_VENDEDOR_BY_ID_TENANT_FIX_VALUE) {
    const p23_r09xOutsideFiles = files.filter(f => !P23_R09X_FIX_AUTHORIZED_FILES.includes(f));
    if (p23_r09xOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09X FIX:\n");
      p23_r09xOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09X FIX permite somente: " + P23_R09X_FIX_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r09xVendedorFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09xVendedorFilesInChanges) {
      const check = isP23_R09XVendedorByIdTenantHardeningAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — vendedor-by-id tenant hardening requer ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING=P23_R09X_VENDEDOR_BY_ID_TENANT_FIX\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09X, allow them
    const nonR09XFiles = files.filter(f => !P23_R09X_VENDEDOR_BY_ID_TENANT_HARDENING_AUTHORIZED_FILES.includes(f));
    if (nonR09XFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09X detectados:");
      p23_r09xVendedorFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09X formal window: ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING=" + p23_r09xEnvValue + " (getVendedorById tenant hardening)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09XFiles);
  }

  // P23-R-09W check: if vendedores mutation fix scope files or guard files are modified, require authorization variable
  // IMPORTANTE: R09W vem antes de R09U/R09T/R09S/R09R/R09Q — reivindica guards e arquivos do fix primeiro
  // (users.service.ts e routers.ts estão também no claim da R09U: a janela mais nova reivindica primeiro)
  const p23_r09wVendedoresFilesInChanges = files.filter(f => P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_AUTHORIZED_FILES.includes(f));

  // Janela R09W é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo bloqueado)
  //   FIX  → somente service + router + teste autorizado (guards, db/core, baseline, schema, package.json, financeiro.router bloqueados)
  const p23_r09wEnvValue = process.env.ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX;
  if (p23_r09wEnvValue === P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH_VALUE) {
    const p23_r09wOutsideFiles = files.filter(f => !P23_R09W_AUTH_AUTHORIZED_FILES.includes(f));
    if (p23_r09wOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09W AUTH:\n");
      p23_r09wOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09W AUTH permite somente: " + P23_R09W_AUTH_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }
  if (p23_r09wEnvValue === P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_VALUE) {
    const p23_r09wOutsideFiles = files.filter(f => !P23_R09W_FIX_AUTHORIZED_FILES.includes(f));
    if (p23_r09wOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09W FIX:\n");
      p23_r09wOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09W FIX permite somente: " + P23_R09W_FIX_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r09wVendedoresFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09wVendedoresFilesInChanges) {
      const check = isP23_R09WVendedoresMutationTenantFixAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — vendedores mutation tenant fix requer ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX=P23_R09W_VENDEDORES_MUTATION_TENANT_FIX\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09W, allow them
    const nonR09WFiles = files.filter(f => !P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_AUTHORIZED_FILES.includes(f));
    if (nonR09WFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09W detectados:");
      p23_r09wVendedoresFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09W formal window: ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX=" + p23_r09wEnvValue + " (vendedores mutation tenant isolation fix)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09WFiles);
  }

  // P23-R-09U check: if vendedores.list fix scope files or guard files are modified, require authorization variable
  // IMPORTANTE: R09U vem antes de R09T/R09S/R09R/R09Q — reivindica guards e arquivos do fix primeiro
  const p23_r09uVendedoresFilesInChanges = files.filter(f => P23_R09U_VENDEDORES_LIST_TENANT_FIX_AUTHORIZED_FILES.includes(f));

  // Janela R09U é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo bloqueado)
  //   FIX  → somente service + router + teste autorizado (guards, db/core, baseline, schema, package.json bloqueados)
  const p23_r09uEnvValue = process.env.ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX;
  if (p23_r09uEnvValue === P23_R09U_VENDEDORES_LIST_TENANT_AUTH_VALUE) {
    const p23_r09uOutsideFiles = files.filter(f => !P23_R09U_AUTH_AUTHORIZED_FILES.includes(f));
    if (p23_r09uOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09U AUTH:\n");
      p23_r09uOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09U AUTH permite somente: " + P23_R09U_AUTH_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }
  if (p23_r09uEnvValue === P23_R09U_VENDEDORES_LIST_TENANT_FIX_VALUE) {
    const p23_r09uOutsideFiles = files.filter(f => !P23_R09U_FIX_AUTHORIZED_FILES.includes(f));
    if (p23_r09uOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09U FIX:\n");
      p23_r09uOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09U FIX permite somente: " + P23_R09U_FIX_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r09uVendedoresFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09uVendedoresFilesInChanges) {
      const check = isP23_R09UVendedoresListTenantFixAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — vendedores.list tenant fix requer ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX=P23_R09U_VENDEDORES_LIST_TENANT_FIX\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09U, allow them
    const nonR09UFiles = files.filter(f => !P23_R09U_VENDEDORES_LIST_TENANT_FIX_AUTHORIZED_FILES.includes(f));
    if (nonR09UFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09U detectados:");
      p23_r09uVendedoresFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09U formal window: ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX=" + p23_r09uEnvValue + " (vendedores.list tenant isolation fix)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09UFiles);
  }

  // P23-R-09T check: if ENV_RULES.md or guard files are modified, require authorization variable
  // IMPORTANTE: R09T vem antes de R09S/R09R/R09Q — reivindica ENV_RULES.md e guards primeiro
  const p23_r09tEnvRulesFilesInChanges = files.filter(f => P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_AUTHORIZED_FILES.includes(f));

  // Janela R09T é fail-closed POR VALOR:
  //   AUTH  → somente os 2 guards (ENV_RULES.md e qualquer outro arquivo bloqueados)
  //   CLEAN → somente ENV_RULES.md (guards e qualquer outro arquivo bloqueados)
  const p23_r09tEnvValue = process.env.ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP;
  if (p23_r09tEnvValue === P23_R09T_ENV_RULES_SEED_MASSA_AUTH_VALUE) {
    const p23_r09tOutsideFiles = files.filter(f => !P23_R09T_AUTH_AUTHORIZED_FILES.includes(f));
    if (p23_r09tOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09T AUTH:\n");
      p23_r09tOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09T AUTH permite somente: " + P23_R09T_AUTH_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }
  if (p23_r09tEnvValue === P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_VALUE) {
    const p23_r09tOutsideFiles = files.filter(f => !P23_R09T_CLEANUP_AUTHORIZED_FILES.includes(f));
    if (p23_r09tOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09T CLEAN:\n");
      p23_r09tOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09T CLEAN permite somente: " + P23_R09T_CLEANUP_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r09tEnvRulesFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09tEnvRulesFilesInChanges) {
      const check = isP23_R09TEnvRulesSeedMassaCleanupAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — ENV_RULES seed-massa dead ref cleanup requer ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP=P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09T, allow them
    const nonR09TFiles = files.filter(f => !P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_AUTHORIZED_FILES.includes(f));
    if (nonR09TFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09T detectados:");
      p23_r09tEnvRulesFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09T formal window: ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP=" + p23_r09tEnvValue + " (ENV_RULES seed-massa dead ref cleanup)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09TFiles);
  }

  // P23-R-09S check: if seed-massa lockdown scope files or guard files are modified, require authorization variable
  // IMPORTANTE: R09S vem antes de R09R/R09Q — reivindica seed-massa-teste.ts, docs operacionais e guards primeiro
  const p23_r09sLockdownFilesInChanges = files.filter(f => P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES.includes(f));

  // Janela R09S é fail-closed: com a variável correta definida, somente arquivos da lista são permitidos
  if (process.env.ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN === "P23_R09S_SEED_MASSA_LOCKDOWN") {
    const p23_r09sOutsideFiles = files.filter(f => !P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES.includes(f));
    if (p23_r09sOutsideFiles.length > 0) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos fora do escopo da janela P23-R-09S:\n");
      p23_r09sOutsideFiles.forEach(f => console.error(" - " + f));
      console.error("\nP23-R-09S permite somente: " + P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES.join(", ") + "\n");
      process.exit(1);
    }
  }

  if (p23_r09sLockdownFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09sLockdownFilesInChanges) {
      const check = isP23_R09SSeedMassaLockdownAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("BLOQUEADO — Seed massa lockdown requer ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN=P23_R09S_SEED_MASSA_LOCKDOWN\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09S, allow them
    const nonR09SFiles = files.filter(f => !P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES.includes(f));
    if (nonR09SFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09S detectados:");
      p23_r09sLockdownFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09S-AUTH formal window: ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN=P23_R09S_SEED_MASSA_LOCKDOWN (seed massa lockdown)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09SFiles);
  }

  // P23-R-09R check: if weak-credential scope files or guard files are modified for cleanup, require authorization variable
  const p23_r09rWeakCredFilesInChanges = files.filter(f => P23_R09R_WEAK_CREDENTIAL_CLEANUP_AUTHORIZED_FILES.includes(f));
  if (p23_r09rWeakCredFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09rWeakCredFilesInChanges) {
      const check = isP23_R09RWeakCredentialCleanupAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Weak credential cleanup requer ERP_AUTHORIZED_WEAK_CREDENTIAL_CLEANUP=P23_R09R_WEAK_CREDENTIAL_CLEANUP\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09R, allow them
    const nonR09RFiles = files.filter(f => !P23_R09R_WEAK_CREDENTIAL_CLEANUP_AUTHORIZED_FILES.includes(f));
    if (nonR09RFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09R detectados:");
      p23_r09rWeakCredFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09R-AUTH formal window: ERP_AUTHORIZED_WEAK_CREDENTIAL_CLEANUP=P23_R09R_WEAK_CREDENTIAL_CLEANUP (weak credential cleanup)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09RFiles);
  }

  // P23-R-09R: bloqueio permanente de mount do router smart-auth em qualquer arquivo
  // (router dormente que invoca credencial fraca hardcoded — montagem exige fase própria futura)
  for (const file of files) {
    if (file === "scripts/guardrail-check.js" || file === "scripts/architecture-contract-guard.mjs") continue;
    try {
      const diff = execSync('git diff --cached -- "' + file + '"').toString();
      const lines = diff.split("\n");
      for (const line of lines) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          for (const pattern of P23_R09R_SMART_AUTH_MOUNT_PATTERNS) {
            if (line.includes(pattern)) {
              console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
              console.error("Arquivo não autorizado: " + file + "\n");
              console.error("Motivo: P23-R-09R blocks smart-auth router mount/reference in added line (dormant weak-credential path): " + line + "\n");
              process.exit(1);
            }
          }
        }
      }
    } catch (error) {
      // Ignore diff errors here; other checks handle file-level failures
    }
  }

  // P23-R-09Q check: if authorized dead-reference files or guard files are modified for cleanup, require authorization variable
  const p23_r09qDeadRefFilesInChanges = files.filter(f => P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES_AUTHORIZED_FILES.includes(f));
  if (p23_r09qDeadRefFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09qDeadRefFilesInChanges) {
      const check = isP23_R09QCleanDeadSeedAdminReferencesAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Dead seed-admin references cleanup requer ERP_AUTHORIZED_DOC_SEED_ADMIN_CLEANUP=P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09Q, allow them
    const nonR09QFiles = files.filter(f => !P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES_AUTHORIZED_FILES.includes(f));
    if (nonR09QFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09Q detectados:");
      p23_r09qDeadRefFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09Q-AUTH formal window: ERP_AUTHORIZED_DOC_SEED_ADMIN_CLEANUP=P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES (clean dead seed-admin references)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09QFiles);
  }

  // P23-R-09O check: if legacy seed-admin.ts or guard files are modified for script removal, require authorization variable
  const p23_r09oSeedAdminFilesInChanges = files.filter(f => P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT_AUTHORIZED_FILES.includes(f));
  if (p23_r09oSeedAdminFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09oSeedAdminFilesInChanges) {
      const check = isP23_R09ORemoveLegacySeedAdminScriptAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Legacy seed-admin script removal requer ERP_AUTHORIZED_SCRIPT_REMOVAL=P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09O, allow them
    const nonR09OFiles = files.filter(f => !P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT_AUTHORIZED_FILES.includes(f));
    if (nonR09OFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09O detectados:");
      p23_r09oSeedAdminFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09O-AUTH formal window: ERP_AUTHORIZED_SCRIPT_REMOVAL=P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT (remove legacy seed-admin script)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the authorized files from the list since they're already authorized
    files.length = 0;
    files.push(...nonR09OFiles);
  }

  // P23-R-09M check: if package.json or guard files are modified for seed:admin alias removal, require authorization variable
  const p23_r09mSeedAdminFilesInChanges = files.filter(f => P23_R09M_REMOVE_SEED_ADMIN_ALIAS_AUTHORIZED_FILES.includes(f));
  if (p23_r09mSeedAdminFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09mSeedAdminFilesInChanges) {
      const check = isP23_R09MRemoveSeedAdminAliasAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Seed admin alias removal requer ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09M_REMOVE_SEED_ADMIN_ALIAS\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09M, allow them
    const nonSeedAdminFiles = files.filter(f => !P23_R09M_REMOVE_SEED_ADMIN_ALIAS_AUTHORIZED_FILES.includes(f));
    if (nonSeedAdminFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09M detectados:");
      p23_r09mSeedAdminFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09M-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09M_REMOVE_SEED_ADMIN_ALIAS (remove seed admin alias)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonSeedAdminFiles);
  }

  // P23-R-09K3 check: if package.json or guard files are modified for db:push alias removal, require authorization variable
  const p23_r09k3DbPushAliasFilesInChanges = files.filter(f => P23_R09K3_REMOVE_DB_PUSH_ALIAS_AUTHORIZED_FILES.includes(f));
  if (p23_r09k3DbPushAliasFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09k3DbPushAliasFilesInChanges) {
      const check = isP23_R09K3RemoveRawDbPushAliasAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Raw db push alias removal requer ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09K_REMOVE_DB_PUSH_ALIAS\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09K3, allow them
    const nonDbPushAliasFiles = files.filter(f => !P23_R09K3_REMOVE_DB_PUSH_ALIAS_AUTHORIZED_FILES.includes(f));
    if (nonDbPushAliasFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09K3 detectados:");
      p23_r09k3DbPushAliasFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09K3-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09K_REMOVE_DB_PUSH_ALIAS (remove raw db push alias)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonDbPushAliasFiles);
  }

  // P23-R-09K2 check: if drizzle-wrapper or guard files are modified for db push env gate hardening, require authorization variable
  const p23_r09k2DbWrapperFilesInChanges = files.filter(f => P23_R09K2_DB_WRAPPER_HARDENING_AUTHORIZED_FILES.includes(f));
  if (p23_r09k2DbWrapperFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09k2DbWrapperFilesInChanges) {
      const check = isP23_R09K2DbWrapperHardeningAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — DB wrapper hardening requer ERP_AUTHORIZED_DB_WRAPPER_HARDENING=P23_R09K_DB_PUSH_ENV_GATE\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09K2, allow them
    const nonDbWrapperFiles = files.filter(f => !P23_R09K2_DB_WRAPPER_HARDENING_AUTHORIZED_FILES.includes(f));
    if (nonDbWrapperFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09K2 detectados:");
      p23_r09k2DbWrapperFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09K2-AUTH formal window: ERP_AUTHORIZED_DB_WRAPPER_HARDENING=P23_R09K_DB_PUSH_ENV_GATE (harden db push env gate)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the wrapper/guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonDbWrapperFiles);
  }

  // P23-R-09J check: if package.json or guard files are modified for validate:final removal, require authorization variable
  const p23_r09jValidateFinalFilesInChanges = files.filter(f => P23_R09J_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT_AUTHORIZED_FILES.includes(f));
  if (p23_r09jValidateFinalFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09jValidateFinalFilesInChanges) {
      const check = isP23_R09JRemoveDeadValidateFinalScriptAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Validate final script removal requer ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09J, allow them
    const nonValidateFinalFiles = files.filter(f => !P23_R09J_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT_AUTHORIZED_FILES.includes(f));
    if (nonValidateFinalFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09J detectados:");
      p23_r09jValidateFinalFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09J-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT (remove dead validate final script)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonValidateFinalFiles);
  }

  // P23-R-09H check: if package.json, server/scripts/hard-test-shutdown.mjs, or guard files are modified for test:hard-shutdown removal, require authorization variable
  const p23_r09hHardTestShutdownFilesInChanges = files.filter(f => P23_R09H_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS_AUTHORIZED_FILES.includes(f));
  if (p23_r09hHardTestShutdownFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09hHardTestShutdownFilesInChanges) {
      const check = isP23_R09HRemoveHardTestShutdownScriptAliasAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Hard test shutdown script alias removal requer ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09H, allow them
    const nonHardTestShutdownFiles = files.filter(f => !P23_R09H_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS_AUTHORIZED_FILES.includes(f));
    if (nonHardTestShutdownFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09H detectados:");
      p23_r09hHardTestShutdownFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09H-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS (remove hard test shutdown package alias)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonHardTestShutdownFiles);
  }

  // P23-R-09G-AUTH check: if server/_core/index.ts or hard-test-shutdown.mjs are modified for hardening, require authorization variable
  const p23_r09gHardTestShutdownFilesInChanges = files.filter(f => P23_R09G_HARD_TEST_SHUTDOWN_HARDENING_AUTHORIZED_FILES.includes(f));
  if (p23_r09gHardTestShutdownFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09gHardTestShutdownFilesInChanges) {
      const check = isP23_R09GHardTestShutdownHardeningAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Hard test shutdown hardening requer ERP_AUTHORIZED_CORE_UPDATE=P23_R09_HARD_TEST_SHUTDOWN_HARDENING\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09G-AUTH, allow them
    const nonHardTestShutdownFiles = files.filter(f => !P23_R09G_HARD_TEST_SHUTDOWN_HARDENING_AUTHORIZED_FILES.includes(f));
    if (nonHardTestShutdownFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09G-AUTH detectados:");
      p23_r09gHardTestShutdownFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09G-AUTH formal window: ERP_AUTHORIZED_CORE_UPDATE=P23_R09_HARD_TEST_SHUTDOWN_HARDENING (harden hard test shutdown)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonHardTestShutdownFiles);
  }

  // P23-R-09F check: if package.json or guard files are modified for db:push:prod removal, require authorization variable
  const p23_r09fDbPushProdFilesInChanges = files.filter(f => P23_R09F_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT_AUTHORIZED_FILES.includes(f));
  if (p23_r09fDbPushProdFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09fDbPushProdFilesInChanges) {
      const check = isP23_R09FRemoveDeadDbPushProdScriptAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — db:push:prod script removal requer ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09F, allow them
    const nonDbPushProdFiles = files.filter(f => !P23_R09F_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT_AUTHORIZED_FILES.includes(f));
    if (nonDbPushProdFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09F detectados:");
      p23_r09fDbPushProdFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09F formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT (remove dead db:push:prod script)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonDbPushProdFiles);
  }

  // P23-R-09B-FIX check: if package.json or guard files are modified for fix:vendedor removal, require authorization variable
  const p23_r09bFixVendedorFilesInChanges = files.filter(f => P23_R09B_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT_AUTHORIZED_FILES.includes(f));
  if (p23_r09bFixVendedorFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r09bFixVendedorFilesInChanges) {
      const check = isP23_R09BRemoveDeadFixVendedorScriptAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Fix vendedor script removal requer ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-09B-FIX, allow them
    const nonFixVendedorFiles = files.filter(f => !P23_R09B_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT_AUTHORIZED_FILES.includes(f));
    if (nonFixVendedorFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-09B-FIX detectados:");
      p23_r09bFixVendedorFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-09B-FIX formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R09_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT (remove dead fix:vendedor script)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonFixVendedorFiles);
  }

  // P23-R-08I-04E check: if package.json, scripts/get-token.ts, tests/load/access_token.txt, or guard files are modified for load token removal, require authorization variable
  const p23_r08iLoadTokenFilesInChanges = files.filter(f => P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL_AUTHORIZED_FILES.includes(f));
  if (p23_r08iLoadTokenFilesInChanges.length > 0) {
    // Validate ALL files individually to ensure strict security
    for (const file of p23_r08iLoadTokenFilesInChanges) {
      const check = isP23_R08ILoadTokenScriptRemovalAuthorized(file);
      if (!check.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivo não autorizado: " + file + "\n");
        if (check.reason) {
          console.error("Motivo: " + check.reason + "\n");
        }
        console.error("DOC BLOQUEADO — Load token script removal requer ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL\n");
        process.exit(1);
      }
    }
    // If all changed files are authorized by P23-R-08I-04E, allow them
    const nonLoadTokenFiles = files.filter(f => !P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL_AUTHORIZED_FILES.includes(f));
    if (nonLoadTokenFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-08I-04E detectados:");
      p23_r08iLoadTokenFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — P23-R-08I-04E formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL (remove obsolete load token script)\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonLoadTokenFiles);
  }

  // P23-R-08E-07C-PACKAGE check: if package.json or guard files are modified for test:login removal, require authorization variable
  const p23_removeTestLoginFilesInChanges = files.filter(f => P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT_AUTHORIZED_FILES.includes(f));
  if (p23_removeTestLoginFilesInChanges.length > 0) {
    const p23_removeTestLoginCheck = isP23_RemoveObsoleteTestLoginScriptAuthorized(p23_removeTestLoginFilesInChanges[0]);
    if (!p23_removeTestLoginCheck.authorized) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos de package.json ou guard bloqueados modificados:\n");
      p23_removeTestLoginFilesInChanges.forEach(f => console.error(" - " + f));
      console.error("\nDOC BLOQUEADO — Package.json test:login removal requer ERP_AUTHORIZED_PACKAGE_UPDATE=P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT\n");
      process.exit(1);
    }
    // If all changed files are authorized by P23-R-08E-07C-PACKAGE, allow them
    const nonRemoveTestLoginFiles = files.filter(f => !P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT_AUTHORIZED_FILES.includes(f));
    if (nonRemoveTestLoginFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R-08E-07C-PACKAGE detectados:");
      p23_removeTestLoginFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — " + p23_removeTestLoginCheck.reason + "\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    // But remove the guard files from the list since they're already authorized
    files.length = 0;
    files.push(...nonRemoveTestLoginFiles);
  }

  // P23-APP-SECRET check: if app secret middleware extraction files are modified, require authorization variable
  const p23_appSecretFilesInChanges = files.filter(f => P23_APP_SECRET_MIDDLEWARE_EXTRACTION_AUTHORIZED_FILES.includes(f));
  if (p23_appSecretFilesInChanges.length > 0) {
    const p23_appSecretCheck = isP23_AppSecretMiddlewareExtractionAuthorized(p23_appSecretFilesInChanges[0]);
    if (!p23_appSecretCheck.authorized) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos de área congelada modificados:\n");
      p23_appSecretFilesInChanges.forEach(f => console.error(" - " + f));
      console.error("\nDOC BLOQUEADO — App Secret middleware extraction requer ERP_AUTHORIZED_CORE_SECURITY_UPDATE=P23_APP_SECRET_MIDDLEWARE_EXTRACTION\n");
      process.exit(1);
    }
    // If all changed files are authorized by P23-APP-SECRET, allow them
    const nonAppSecretFiles = files.filter(f => !P23_APP_SECRET_MIDDLEWARE_EXTRACTION_AUTHORIZED_FILES.includes(f));
    if (nonAppSecretFiles.length === 0) {
      console.log("\n📋 Arquivos P23-APP-SECRET detectados:");
      p23_appSecretFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — " + p23_appSecretCheck.reason + "\n");
      return;
    }
    // If there are other files besides the authorized ones, continue checking
    files.length = 0;
    files.push(...nonAppSecretFiles);
  }

  // P23-APP-SECRET-WINDOW check: if guard files are modified for app secret window, require guard window variable
  const p23_appSecretWindowGuardFilesInChanges = files.filter(f => P23_APP_SECRET_MIDDLEWARE_WINDOW_AUTHORIZED_FILES.includes(f));
  if (p23_appSecretWindowGuardFilesInChanges.length > 0) {
    const p23_appSecretWindowCheck = isP23_AppSecretMiddlewareWindowAuthorized(p23_appSecretWindowGuardFilesInChanges[0]);
    if (!p23_appSecretWindowCheck.authorized) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos de guard bloqueados modificados:\n");
      p23_appSecretWindowGuardFilesInChanges.forEach(f => console.error(" - " + f));
      console.error("\nDOC BLOQUEADO — Guard files requerem ERP_AUTHORIZED_GUARD_UPDATE=P23_APP_SECRET_MIDDLEWARE_WINDOW\n");
      process.exit(1);
    }
    // If guard files are authorized, remove them from files for further checks
    const nonGuardFiles = files.filter(f => !P23_APP_SECRET_MIDDLEWARE_WINDOW_AUTHORIZED_FILES.includes(f));
    if (nonGuardFiles.length === 0) {
      console.log("\n📋 Arquivos P23-APP-SECRET-WINDOW detectados:");
      p23_appSecretWindowGuardFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — " + p23_appSecretWindowCheck.reason + "\n");
      return;
    }
    // Continue checking non-guard files
    files.length = 0;
    files.push(...nonGuardFiles);
  }

  // P23-R08E-WINDOW check: if guard files are modified, require guard window variable
  const p23_r08eGuardFilesInChanges = files.filter(f => P23_R08E_STOCK_MOVEMENTS_WINDOW_AUTHORIZED_FILES.includes(f));
  if (p23_r08eGuardFilesInChanges.length > 0) {
    const p23_r08eWindowCheck = isP23_R08EStockMovementsWindowAuthorized(p23_r08eGuardFilesInChanges[0]);
    if (!p23_r08eWindowCheck.authorized) {
      console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
      console.error("Arquivos de guard bloqueados modificados:\n");
      p23_r08eGuardFilesInChanges.forEach(f => console.error(" - " + f));
      console.error("\nDOC BLOQUEADO — Guard files requerem ERP_AUTHORIZED_GUARD_UPDATE=P23_R08E_STOCK_MOVEMENTS_WINDOW\n");
      process.exit(1);
    }
    // If guard files are authorized, remove them from files for further checks
    const nonGuardFiles = files.filter(f => !P23_R08E_STOCK_MOVEMENTS_WINDOW_AUTHORIZED_FILES.includes(f));
    if (nonGuardFiles.length === 0) {
      console.log("\n📋 Arquivos P23-R08E-WINDOW detectados:");
      p23_r08eGuardFilesInChanges.forEach(f => console.log(" - " + f));
      console.log("\n✔ Guardrail OK — " + p23_r08eWindowCheck.reason + "\n");
      return;
    }
    // Continue checking non-guard files
    files.length = 0;
    files.push(...nonGuardFiles);
  }

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

    // P23-R-05B check: if guard files are in violations with P23-R-05B window active, allow them
    const p23_r05bGuardFilesInViolations = violations.filter(v =>
      v === "scripts/guardrail-check.js" || v === "scripts/architecture-contract-guard.mjs"
    );
    if (p23_r05bGuardFilesInViolations.length > 0) {
      const p23_r05bCheck = isP23_R05BAuthorizedDrizzleQuarantineCleanup(p23_r05bGuardFilesInViolations[0]);
      if (p23_r05bCheck.authorized) {
        // If guard files are authorized by P23-R-05B, remove them from violations for further checks
        const nonGuardViolations = violations.filter(v => v !== "scripts/guardrail-check.js" && v !== "scripts/architecture-contract-guard.mjs");
        if (nonGuardViolations.length === 0) {
          console.log("\n📋 Arquivos P23-R-05B guard files detectados:");
          p23_r05bGuardFilesInViolations.forEach(f => console.log(" - " + f));
          console.log("\n✔ Guardrail OK — " + p23_r05bCheck.reason + "\n");
          return;
        }
        violations.length = 0;
        violations.push(...nonGuardViolations);
      }
    }

    // P23-R08E authorized schema update: stock movements schema only
    // Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_R08E_STOCK_MOVEMENTS_SCHEMA
    // Permite somente drizzle/schema.ts, drizzle/meta/_journal.json, drizzle/0009_create_stock_movements.sql
    const allP23_R08E_Authorized = violations.every(v => P23_R08E_STOCK_MOVEMENTS_AUTHORIZED_FILES.includes(v));
    if (allP23_R08E_Authorized) {
      const p23_r08eCheck = isP23_R08EAuthorizedStockMovementsSchemaUpdate(violations[0]);
      if (p23_r08eCheck.authorized) {
        console.log("\n📋 Arquivos P23-R08E detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_r08eCheck.reason + "\n");
        return;
      }
    }

    // P23-APP-SECRET check: if app secret middleware files are in violations, require authorization variable
    const p23_appSecretFilesInViolations = violations.filter(v => P23_APP_SECRET_MIDDLEWARE_EXTRACTION_AUTHORIZED_FILES.includes(v));
    if (p23_appSecretFilesInViolations.length > 0) {
      const p23_appSecretCheck = isP23_AppSecretMiddlewareExtractionAuthorized(p23_appSecretFilesInViolations[0]);
      if (!p23_appSecretCheck.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivos de área congelada modificados:\n");
        p23_appSecretFilesInViolations.forEach(f => console.error(" - " + f));
        console.error("\nDOC BLOQUEADO — App Secret middleware extraction requer ERP_AUTHORIZED_CORE_SECURITY_UPDATE=P23_APP_SECRET_MIDDLEWARE_EXTRACTION\n");
        process.exit(1);
      }
      // If all violations are authorized by P23-APP-SECRET, allow them
      const nonAppSecretViolations = violations.filter(v => !P23_APP_SECRET_MIDDLEWARE_EXTRACTION_AUTHORIZED_FILES.includes(v));
      if (nonAppSecretViolations.length === 0) {
        console.log("\n📋 Arquivos P23-APP-SECRET detectados:");
        p23_appSecretFilesInViolations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_appSecretCheck.reason + "\n");
        return;
      }
      violations.length = 0;
      violations.push(...nonAppSecretViolations);
    }

    // P23-APP-SECRET-WINDOW check: if guard files are in violations with P23-APP-SECRET-WINDOW active, allow them
    const p23_appSecretWindowGuardFilesInViolations = violations.filter(v => P23_APP_SECRET_MIDDLEWARE_WINDOW_AUTHORIZED_FILES.includes(v));
    if (p23_appSecretWindowGuardFilesInViolations.length > 0) {
      const p23_appSecretWindowCheck = isP23_AppSecretMiddlewareWindowAuthorized(p23_appSecretWindowGuardFilesInViolations[0]);
      if (!p23_appSecretWindowCheck.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivos de guard bloqueados modificados:\n");
        p23_appSecretWindowGuardFilesInViolations.forEach(f => console.error(" - " + f));
        console.error("\nDOC BLOQUEADO — Guard files requerem ERP_AUTHORIZED_GUARD_UPDATE=P23_APP_SECRET_MIDDLEWARE_WINDOW\n");
        process.exit(1);
      }
      // If guard files are authorized by P23-APP-SECRET-WINDOW, remove them from violations for further checks
      const nonGuardViolations = violations.filter(v => !P23_APP_SECRET_MIDDLEWARE_WINDOW_AUTHORIZED_FILES.includes(v));
      if (nonGuardViolations.length === 0) {
        console.log("\n📋 Arquivos P23-APP-SECRET-WINDOW detectados:");
        p23_appSecretWindowGuardFilesInViolations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_appSecretWindowCheck.reason + "\n");
        return;
      }
      violations.length = 0;
      violations.push(...nonGuardViolations);
    }

    // P23-R08E-WINDOW check: if guard files are in violations, require guard window variable
    const p23_r08eGuardFilesInViolations = violations.filter(v => P23_R08E_STOCK_MOVEMENTS_WINDOW_AUTHORIZED_FILES.includes(v));
    if (p23_r08eGuardFilesInViolations.length > 0) {
      const p23_r08eWindowCheck = isP23_R08EStockMovementsWindowAuthorized(p23_r08eGuardFilesInViolations[0]);
      if (!p23_r08eWindowCheck.authorized) {
        console.error("\n🚫 VIOLAÇÃO DE ARQUITETURA DETECTADA\n");
        console.error("Arquivos de guard bloqueados modificados:\n");
        p23_r08eGuardFilesInViolations.forEach(f => console.error(" - " + f));
        console.error("\nDOC BLOQUEADO — Guard files requerem ERP_AUTHORIZED_GUARD_UPDATE=P23_R08E_STOCK_MOVEMENTS_WINDOW\n");
        process.exit(1);
      }
      // If guard files are authorized, remove them from violations for further checks
      const nonGuardViolations = violations.filter(v => !P23_R08E_STOCK_MOVEMENTS_WINDOW_AUTHORIZED_FILES.includes(v));
      if (nonGuardViolations.length === 0) {
        console.log("\n📋 Arquivos P23-R08E-WINDOW detectados:");
        p23_r08eGuardFilesInViolations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_r08eWindowCheck.reason + "\n");
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

    // P7 authorized schema update: pedidos numero unique por tenant
    // Requer variável ERP_AUTHORIZED_SCHEMA_FIX=P7_PEDIDOS_NUMERO_TENANT_UNIQUE
    // Verifica se todas as violações são dos arquivos P7 autorizados
    const allP7Authorized = violations.every(v => P7_PEDIDOS_NUMERO_AUTHORIZED_FILES.includes(v));
    if (allP7Authorized) {
      const p7Check = isP7AuthorizedSchemaUpdate(violations[0]);
      if (p7Check.authorized) {
        console.log("\n📋 Arquivos P7 detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p7Check.reason + "\n");
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

    // P23-R-05B authorized drizzle quarantine cleanup: remove quarantine-20260330
    // Requer variável ERP_AUTHORIZED_DRIZZLE_QUARANTINE_CLEANUP=P23_R05B_REMOVE_QUARANTINE_20260330
    // Permite somente os 5 arquivos específicos da P23-R-05B
    const allP23_R05B_Authorized = violations.every(v => P23_R05B_DRIZZLE_QUARANTINE_CLEANUP_AUTHORIZED_FILES.includes(v));
    if (allP23_R05B_Authorized) {
      const p23_r05bCheck = isP23_R05BAuthorizedDrizzleQuarantineCleanup(violations[0]);
      if (p23_r05bCheck.authorized) {
        console.log("\n📋 Arquivos P23-R-05B detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p23_r05bCheck.reason + "\n");
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

    // P21-TENANTS authorized schema update: restore da master table tenants
    // Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P21_TENANTS_RESTORE
    // Permite somente os 4 arquivos da migration 0009 tenants
    const allP21_Tenants_Authorized = violations.every(v => P21_TENANTS_AUTHORIZED_FILES.includes(v));
    if (allP21_Tenants_Authorized && violations.length > 0) {
      const p21TenantsCheck = isP21TenantsAuthorizedSchemaUpdate(violations[0]);
      if (p21TenantsCheck.authorized) {
        console.log("\n📋 Arquivos P21-TENANTS detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p21TenantsCheck.reason + "\n");
        return;
      }
    }

    // P21-TENANTS-WINDOW authorized guard update: guard files for tenants restore
    // Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P21_TENANTS_GUARD_WINDOW
    // Permite somente scripts/guardrail-check.js e scripts/architecture-contract-guard.mjs
    const allP21_TenantsWindow_Authorized = violations.every(v => P21_TENANTS_GUARD_WINDOW_AUTHORIZED_FILES.includes(v));
    if (allP21_TenantsWindow_Authorized && violations.length > 0) {
      const p21TenantsWindowCheck = isP21TenantsGuardWindowAuthorized(violations[0]);
      if (p21TenantsWindowCheck.authorized) {
        console.log("\n📋 Arquivos P21-TENANTS-WINDOW detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p21TenantsWindowCheck.reason + "\n");
        return;
      }
    }

    // P21-TENANTS mixed case: both drizzle files and guard files staged
    // Requires BOTH ERP_AUTHORIZED_SCHEMA_UPDATE and ERP_AUTHORIZED_GUARD_UPDATE
    const hasP21DrizzleFiles = violations.some(v => P21_TENANTS_AUTHORIZED_FILES.includes(v));
    const hasP21GuardFiles = violations.some(v => P21_TENANTS_GUARD_WINDOW_AUTHORIZED_FILES.includes(v));
    const onlyP21Files = violations.every(v =>
      P21_TENANTS_AUTHORIZED_FILES.includes(v) ||
      P21_TENANTS_GUARD_WINDOW_AUTHORIZED_FILES.includes(v)
    );
    if (hasP21DrizzleFiles && hasP21GuardFiles && onlyP21Files) {
      const p21TenantsCheck = isP21TenantsAuthorizedSchemaUpdate(violations.find(v => P21_TENANTS_AUTHORIZED_FILES.includes(v)));
      const p21TenantsWindowCheck = isP21TenantsGuardWindowAuthorized(violations.find(v => P21_TENANTS_GUARD_WINDOW_AUTHORIZED_FILES.includes(v)));
      if (p21TenantsCheck.authorized && p21TenantsWindowCheck.authorized) {
        console.log("\n📋 Arquivos P21-TENANTS + P21-TENANTS-WINDOW detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p21TenantsCheck.reason + " + " + p21TenantsWindowCheck.reason + "\n");
        return;
      }
    }

    // P24D authorized schema update: FK física users/vendedores -> tenants
    // Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P24D_TENANT_FKS
    // Permite somente os 4 arquivos da migration 0011 tenant fks
    const allP24D_TenantFks_Authorized = violations.every(v => P24D_TENANT_FKS_AUTHORIZED_FILES.includes(v));
    if (allP24D_TenantFks_Authorized && violations.length > 0) {
      const p24dTenantFksCheck = isP24DTenantFksAuthorizedSchemaUpdate(violations[0]);
      if (p24dTenantFksCheck.authorized) {
        console.log("\n📋 Arquivos P24D detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p24dTenantFksCheck.reason + "\n");
        return;
      }
    }

    // P24D-WINDOW authorized guard update: guard files for tenant fks migration
    // Requer variável ERP_AUTHORIZED_GUARD_UPDATE=P24D_TENANT_FK_GUARD_WINDOW
    // Permite somente scripts/guardrail-check.js e scripts/architecture-contract-guard.mjs
    const allP24D_Window_Authorized = violations.every(v => P24D_TENANT_FK_GUARD_WINDOW_AUTHORIZED_FILES.includes(v));
    if (allP24D_Window_Authorized && violations.length > 0) {
      const p24dWindowCheck = isP24DTenantFkGuardWindowAuthorized(violations[0]);
      if (p24dWindowCheck.authorized) {
        console.log("\n📋 Arquivos P24D-WINDOW detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p24dWindowCheck.reason + "\n");
        return;
      }
    }

    // P24D mixed case: both drizzle files and guard files staged
    // Requires BOTH ERP_AUTHORIZED_SCHEMA_UPDATE=P24D_TENANT_FKS and ERP_AUTHORIZED_GUARD_UPDATE=P24D_TENANT_FK_GUARD_WINDOW
    const hasP24DDrizzleFiles = violations.some(v => P24D_TENANT_FKS_AUTHORIZED_FILES.includes(v));
    const hasP24DGuardFiles = violations.some(v => P24D_TENANT_FK_GUARD_WINDOW_AUTHORIZED_FILES.includes(v));
    const onlyP24DFiles = violations.every(v =>
      P24D_TENANT_FKS_AUTHORIZED_FILES.includes(v) ||
      P24D_TENANT_FK_GUARD_WINDOW_AUTHORIZED_FILES.includes(v)
    );
    if (hasP24DDrizzleFiles && hasP24DGuardFiles && onlyP24DFiles) {
      const p24dTenantFksCheck = isP24DTenantFksAuthorizedSchemaUpdate(violations.find(v => P24D_TENANT_FKS_AUTHORIZED_FILES.includes(v)));
      const p24dWindowCheck = isP24DTenantFkGuardWindowAuthorized(violations.find(v => P24D_TENANT_FK_GUARD_WINDOW_AUTHORIZED_FILES.includes(v)));
      if (p24dTenantFksCheck.authorized && p24dWindowCheck.authorized) {
        console.log("\n📋 Arquivos P24D + P24D-WINDOW detectados:");
        violations.forEach(f => console.log(" - " + f));
        console.log("\n✔ Guardrail OK — " + p24dTenantFksCheck.reason + " + " + p24dWindowCheck.reason + "\n");
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
