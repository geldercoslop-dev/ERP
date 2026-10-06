#!/usr/bin/env node

/**
 * ARCHITECTURE CONTRACT GUARD
 * 
 * Protege áreas congeladas do sistema:
 * BASE + INFRA + SCHEMA + TYPES + GUARD = ESTÁVEL
 * 
 * Evolução deve seguir para domínio (PEDIDOS e outros).
 * Base/infra/schema/types/guard só podem ser alterados com fase autorizada.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();

// Áreas congeladas - não podem ser alteradas sem fase autorizada
const FROZEN_PATTERNS = [
  'server/_core/',
  'server/bootstrap/',
  'server/config/',
  'server/security/',
  'server/db/',
  'drizzle/',
  'migrations/',
  'shared/',
  '.env',
  '.env.',
  'docker-compose',
  'package.json',
  'pnpm-lock.yaml',
];

// Exceções permitidas mesmo em áreas congeladas
const EXCEPTIONS = [
  'drizzle/relations.ts',
  'shared/types/entities.ts',
  'scripts/architecture-contract-guard.mjs',
  'scripts/drizzle-schema-guard.mjs',
  'scripts/guardrail-check.js',
  'scripts/anti-regress-check.js',
  '.github/workflows/ci.yml',
  '.husky/pre-commit',
  '.husky/pre-push',
  'docs/',
  'package.json',
];

// Janela controlada C3.1 - arquivos _core autorizados para remoção de DB direto
const AUTHORIZED_C3_CORE_FILES = [
  'server/_core/domain-audit.ts',
  'server/_core/oauth.ts',
  'server/_core/ownership.ts',
  'server/_core/sdk.ts',
  'server/_core/service-actor.ts',
];

// Janela formal P23-B - Schema produto_skus autorizado
const P23_B_AUTHORIZED_FILES = [
  'drizzle/schema.ts',
  'drizzle/relations.ts',
  'shared/types/entities.d.ts',
  'drizzle/meta/_journal.json',
  'drizzle/0005_needy_microchip.sql',
  'drizzle/meta/0005_snapshot.json',
];

// Áreas permitidas para evolução (domínio)
const ALLOWED_PATTERNS = [
  'server/services/',
  'server/api/',
  'server/cache/',
  'server/concurrency/',
  'client/',
  'tests/',
  'docs/',
  'scripts/',
];

/**
 * Obtém arquivos alterados (staged ou todos)
 */
function getChangedFiles(staged = true) {
  try {
    const cmd = staged 
      ? 'git diff --cached --name-only --diff-filter=ACM'
      : 'git diff --name-only --diff-filter=ACM';
    const output = execSync(cmd, { encoding: 'utf-8', cwd: ROOT });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Se não for repo git ou não houver mudanças, retorna vazio
    return [];
  }
}

/**
 * Verifica se arquivo tem autorização P20.4 para update de caminho doc
 * Requer variável ERP_AUTHORIZED_FROZEN_DOC_UPDATE=P20_4_ENV_RULES_PATH_UPDATE
 */
function isP20_4AuthorizedFrozenDocUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P20_4_ENV_RULES_PATH_UPDATE';
  const envValue = process.env.ERP_AUTHORIZED_FROZEN_DOC_UPDATE;
  
  if (relativePath === 'server/_core/env/ENV_RULES.md' && envValue === authorizedValue) {
    return { authorized: true, reason: 'P20.4 formal window: ERP_AUTHORIZED_FROZEN_DOC_UPDATE=' + authorizedValue };
  }
  
  return { authorized: false };
}

/**
 * Verifica se arquivo tem autorização P23-B para schema produto_skus
 * Requer variável ERP_AUTHORIZED_SCHEMA_UPDATE=P23_B_PRODUCT_SKU_SCHEMA
 * Permite somente os 6 arquivos específicos da P23-B
 */
function isP23_BAuthorizedSchemaUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_B_PRODUCT_SKU_SCHEMA';
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
  if (P23_B_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-B formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=' + authorizedValue + ' (product sku schema)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_E_REMOVE_ORPHAN_JOURNAL_ENTRY';
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
  if (relativePath === 'drizzle/meta/_journal.json') {
    return {
      authorized: true,
      reason: 'P23-E formal window: ERP_AUTHORIZED_JOURNAL_UPDATE=' + authorizedValue + ' (remove orphan drizzle journal entry)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_E_MIGRATE_RUNNER_DB_ONLY';
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
  if (relativePath === 'server/_core/bootstrap.ts' || relativePath === 'server/scripts/run-migrate.ts') {
    return {
      authorized: true,
      reason: 'P23-E formal window: ERP_AUTHORIZED_BOOTSTRAP_UPDATE=' + authorizedValue + ' (migrate runner DB-only bootstrap)'
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

// Janela formal P23-G1 - Limpeza de types de produtoVariacoes autorizada
const P23_G1_AUTHORIZED_FILES = [
  'shared/types/entities.d.ts',
  'server/services/inventory.service.ts',
];

// Janela formal P23-G2.1-B - Schema sku_id em itens_pedido autorizado
const P23_G21_AUTHORIZED_FILES = [
  'drizzle/schema.ts',
  'drizzle/relations.ts',
  'drizzle/meta/_journal.json',
  'drizzle/0006_migration_1777933000000.sql',
  'drizzle/meta/0006_snapshot.json',
  'server/_core/migration-guard.ts',
];

// Janela formal P23-G2.2-B - Schema sku_id em pendencias autorizado
const P23_G22_AUTHORIZED_FILES = [
  'drizzle/schema.ts',
  'drizzle/relations.ts',
  'drizzle/meta/_journal.json',
  'drizzle/0007_add_sku_id_to_pendencias.sql',
  'drizzle/meta/0007_snapshot.json',
];

// Janela formal P23-SEC - Env log sanitize autorizado
const P23_SEC_AUTHORIZED_FILES = [
  'server/_core/env/bootstrapEnv.ts',
  'scripts/architecture-contract-guard.mjs',
  'scripts/guardrail-check.js',
];

// Janela formal P23-COUNTERS - Schema counters composite unique fix
const P23_COUNTERS_TENANT_UNIQUE_FIX_AUTHORIZED_FILES = [
  'drizzle/schema.ts',
  'drizzle/meta/_journal.json',
  'drizzle/0008_counters_tenant_unique_fix.sql',
  'drizzle/meta/0008_snapshot.json',
];

// Janela formal P23-COUNTERS-WINDOW - Guard files for counters migration
const P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES = [
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-05B - Drizzle quarantine cleanup
const P23_R05B_DRIZZLE_QUARANTINE_CLEANUP_AUTHORIZED_FILES = [
  'drizzle/quarantine-20260330/schema-leo-memory.ts',
  'drizzle/quarantine-20260330/schema-semantic-memory.ts',
  'server/leo/memory/leo-long-memory.ts',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R08E - Stock movements schema
const P23_R08E_STOCK_MOVEMENTS_AUTHORIZED_FILES = [
  'drizzle/schema.ts',
  'drizzle/meta/_journal.json',
  'drizzle/0009_create_stock_movements.sql',
];

// Janela formal P23-R08E-WINDOW - Guard files for stock movements
const P23_R08E_STOCK_MOVEMENTS_WINDOW_AUTHORIZED_FILES = [
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-APP-SECRET-WINDOW - App Secret middleware extraction
const P23_APP_SECRET_MIDDLEWARE_EXTRACTION_AUTHORIZED_FILES = [
  'server/_core/index.ts',
  'server/security/app-secret-middleware.ts',
  'server/tests/security-app-secret.test.ts',
];

// Janela formal P23-APP-SECRET-WINDOW - Guard files for app secret middleware
const P23_APP_SECRET_MIDDLEWARE_WINDOW_AUTHORIZED_FILES = [
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-08E-07C-PACKAGE - Remove obsolete test:login script from package.json
const P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT_AUTHORIZED_FILES = [
  'package.json',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-08I-04E - Remove obsolete load token script from package.json
const P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL_AUTHORIZED_FILES = [
  'package.json',
  'scripts/get-token.ts',
  'tests/load/access_token.txt',
  'THROW_GENERIC_MAPPING_REPORT.md',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09B-FIX - Remove dead fix:vendedor script from package.json
const P23_R09B_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT_AUTHORIZED_FILES = [
  'package.json',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09F - Remove dead db:push:prod script from package.json
const P23_R09F_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT_AUTHORIZED_FILES = [
  'package.json',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09G-AUTH - Harden hard test shutdown endpoint and script
const P23_R09G_HARD_TEST_SHUTDOWN_HARDENING_AUTHORIZED_FILES = [
  'server/_core/index.ts',
  'server/scripts/hard-test-shutdown.mjs',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09H - Remove hard test shutdown script alias from package.json
const P23_R09H_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS_AUTHORIZED_FILES = [
  'package.json',
  'server/scripts/hard-test-shutdown.mjs',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09J - Remove dead validate final script from package.json
const P23_R09J_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT_AUTHORIZED_FILES = [
  'package.json',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09K2 - Harden db push env gate in drizzle-wrapper
const P23_R09K2_DB_WRAPPER_HARDENING_AUTHORIZED_FILES = [
  'scripts/db/drizzle-wrapper.mjs',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09K3 - Remove raw db:push alias from package.json
const P23_R09K3_REMOVE_DB_PUSH_ALIAS_AUTHORIZED_FILES = [
  'package.json',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09M - Remove seed:admin alias from package.json
const P23_R09M_REMOVE_SEED_ADMIN_ALIAS_AUTHORIZED_FILES = [
  'package.json',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09O - Remove legacy seed-admin.ts script (deletion only)
const P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT_AUTHORIZED_FILES = [
  'server/scripts/seed-admin.ts',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Janela formal P23-R-09Q - Clean dead references to seed:admin (docs + dead text only)
const P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES_AUTHORIZED_FILES = [
  'docs/AUTH-DB.md',
  'docs/RELATORIO_HARDENING.md',
  'docs/operations/CHECKLIST_TESTE_OPERACIONAL.md',
  'docs/operations/CONFIGURAR_BANCO_2MIN.md',
  'docs/operations/PLANO_TESTE_OPERACIONAL_EMPRESA.md',
  'docs/BRIEFING_PARA_ROADMAP.md',
  'client/src/INTEGRATION_README.md',
  'server/scripts/seed-massa-teste.ts',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Padrões de lógica proibidos em diffs de seed-massa-teste.ts (janela R09Q permite só texto morto)
const P23_R09Q_SEED_MASSA_FORBIDDEN_PATTERNS = [
  'import',
  'getDb',
  'DEFAULT_TENANT_ID',
  'getAllVendedores',
  'vendedorId',
  'createCliente',
  'createProduto',
  'await',
  'bootstrap',
  'tenant',
  'process.env',
  'db.',
];

// Padrões proibidos em linhas ADICIONADAS nos arquivos autorizados R09Q (sem novo comando/credencial)
const P23_R09Q_FORBIDDEN_ADDITION_PATTERNS = [
  'seed:admin',
  'seed-admin',
  'npm run seed',
  'pnpm run seed',
  'npx tsx',
  'admin123',
  'admin/admin',
  'vendedor123',
];

// Janela formal P23-R-09R - Weak credential cleanup (auth-detection/reset/bats/load-test)
const P23_R09R_WEAK_CREDENTIAL_CLEANUP_AUTHORIZED_FILES = [
  'server/_core/auth-detection.ts',
  'server/scripts/reset-admin-password.ts',
  'INSTALAR_CORRIGIDO.bat',
  'INSTALAR_CORRIGIDO - Copia.bat',
  'util/test/load-test.ts',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Padrões proibidos em linhas ADICIONADAS em TODOS os arquivos R09R (sem nova credencial/comando perigoso)
const P23_R09R_FORBIDDEN_ADDITION_PATTERNS = [
  'admin123',
  'vendedor123',
  'admin/admin',
  '123456',
  'smart-auth',
  'smartAuth',
  'seed:admin',
  'seed-admin',
  'npm run seed',
  'pnpm run seed',
  'npx tsx',
];

// Padrões extras proibidos em linhas ADICIONADAS por arquivo R09R (mecânica de credencial insegura)
const P23_R09R_FILE_SPECIFIC_FORBIDDEN_PATTERNS = {
  'server/_core/auth-detection.ts': [
    'INSERT INTO',
    'bcrypt.hash',
    'Password = "',
    "Password = '",
    'password = "',
    "password = '",
  ],
  'server/scripts/reset-admin-password.ts': [
    'INSERT INTO',
    'LIKE',
    'Senha:',
    '[1,',
    'tenantId: 1',
    'Password = "',
    "Password = '",
    'password = "',
    "password = '",
  ],
  'INSTALAR_CORRIGIDO.bat': [
    'admin123',
    'admin/',
    'admin@',
    ' admin',
    'admin ',
    'senha',
    'password',
    'PASSWORD',
    'seed',
    'reset',
    'tsx',
  ],
  'INSTALAR_CORRIGIDO - Copia.bat': [
    'admin123',
    'admin/',
    'admin@',
    ' admin',
    'admin ',
    'senha',
    'password',
    'PASSWORD',
    'seed',
    'reset',
    'tsx',
  ],
  'util/test/load-test.ts': [
    'PASSWORD=admin',
    'PASSWORD=123',
    'PASSWORD=test',
    'PASSWORD=senha',
    'password=admin',
  ],
};

// Padrões de mount do router smart-auth — bloqueio permanente em qualquer arquivo (router dormente com credencial fraca)
const P23_R09R_SMART_AUTH_MOUNT_PATTERNS = [
  'smart-auth',
  'smartAuth',
  'smartAuthRouter',
];

// Janela formal P23-R-09S - Seed massa lockdown (gate forte em seed-massa-teste.ts + correção de docs operacionais)
const P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES = [
  'server/scripts/seed-massa-teste.ts',
  'docs/operations/CHECKLIST_TESTE_OPERACIONAL.md',
  'docs/operations/PLANO_TESTE_OPERACIONAL_EMPRESA.md',
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Padrões proibidos em linhas ADICIONADAS em TODOS os arquivos R09S não-guard (sem nova credencial/seed legado/reset perigoso)
const P23_R09S_FORBIDDEN_ADDITION_PATTERNS = [
  'admin123',
  'admin/admin',
  'vendedor123',
  'seed:admin',
  'seed-admin',
  'reset-admin-password',
];

// Padrões proibidos em linhas ADICIONADAS de seed-massa-teste.ts (lockdown não pode reintroduzir lógica insegura)
const P23_R09S_SEED_MASSA_FORBIDDEN_PATTERNS = [
  'DEFAULT_TENANT_ID',
  'getAllVendedores',
  'tenantId ?? 1',
  'tenantId || 1',
  'tenantId = 1',
  'tenantId: 1',
  'vendedorId ?? 1',
  'vendedorId || 1',
  'vendedorId = 1',
  'vendedorId: 1',
];

// Padrões proibidos em linhas ADICIONADAS dos docs operacionais R09S (sem nova instrução de execução direta/legado)
const P23_R09S_DOCS_FORBIDDEN_PATTERNS = [
  'npx tsx',
  'pnpm exec tsx',
  'pnpm run seed',
  'npm run seed',
  'DEFAULT_TENANT_ID',
];

// Mapa de padrões específicos por arquivo R09S
const P23_R09S_FILE_SPECIFIC_FORBIDDEN_PATTERNS = {
  'server/scripts/seed-massa-teste.ts': P23_R09S_SEED_MASSA_FORBIDDEN_PATTERNS,
  'docs/operations/CHECKLIST_TESTE_OPERACIONAL.md': P23_R09S_DOCS_FORBIDDEN_PATTERNS,
  'docs/operations/PLANO_TESTE_OPERACIONAL_EMPRESA.md': P23_R09S_DOCS_FORBIDDEN_PATTERNS,
};

// Janela formal P23-R-09T - ENV_RULES seed-massa dead ref cleanup
// Dois valores distintos na mesma variável ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP:
//   AUTH  (P23_R09T_ENV_RULES_SEED_MASSA_AUTH)    → fase AUTH: permite SOMENTE os 2 guards
//   CLEAN (P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP) → fase CLEAN: permite SOMENTE ENV_RULES.md
const P23_R09T_ENV_RULES_SEED_MASSA_AUTH_VALUE = 'P23_R09T_ENV_RULES_SEED_MASSA_AUTH';
const P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_VALUE = 'P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP';

// Fase AUTH: somente os guards podem ser alterados
const P23_R09T_AUTH_AUTHORIZED_FILES = [
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Fase CLEAN: alvo único — ENV_RULES.md (guards ficam BLOQUEADOS sob o valor CLEAN)
const P23_R09T_CLEANUP_AUTHORIZED_FILES = [
  'server/_core/env/ENV_RULES.md',
];

// União (claiming): arquivos sob tutela da janela R09T em qualquer valor
const P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_AUTHORIZED_FILES = P23_R09T_CLEANUP_AUTHORIZED_FILES.concat(P23_R09T_AUTH_AUTHORIZED_FILES);

// Único conteúdo permitido em linhas REMOVIDAS do diff de ENV_RULES.md sob R09T (dead ref do seed massa)
const P23_R09T_ALLOWED_REMOVAL_PATTERN = 'server/scripts/seed-massa-teste.ts';

// Janela formal P23-R-09U - vendedores.list multi-tenant isolation fix
// Dois valores distintos na mesma variável ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX:
//   AUTH (P23_R09U_VENDEDORES_LIST_TENANT_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R09U_VENDEDORES_LIST_TENANT_FIX)  → fase FIX: permite SOMENTE service + router + teste autorizado
const P23_R09U_VENDEDORES_LIST_TENANT_AUTH_VALUE = 'P23_R09U_VENDEDORES_LIST_TENANT_AUTH';
const P23_R09U_VENDEDORES_LIST_TENANT_FIX_VALUE = 'P23_R09U_VENDEDORES_LIST_TENANT_FIX';

// Fase AUTH: somente os guards podem ser alterados
const P23_R09U_AUTH_AUTHORIZED_FILES = [
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Fase FIX: alvo do fluxo ativo — service + router + teste de isolamento autorizado
// (guards, server/db/*, baseline, schema e package.json ficam BLOQUEADOS sob o valor FIX)
const P23_R09U_FIX_AUTHORIZED_FILES = [
  'server/services/users.service.ts',
  'server/routers.ts',
  'server/tests/vendedores-list-tenant-isolation.test.ts',
];

// União (claiming): arquivos sob tutela da janela R09U em qualquer valor
const P23_R09U_VENDEDORES_LIST_TENANT_FIX_AUTHORIZED_FILES = P23_R09U_FIX_AUTHORIZED_FILES.concat(P23_R09U_AUTH_AUTHORIZED_FILES);

// Janela formal P23-R-09W - vendedores mutation (update/delete/senha) multi-tenant fix
// Dois valores distintos na mesma variável ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX:
//   AUTH (P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R09W_VENDEDORES_MUTATION_TENANT_FIX)  → fase FIX: permite SOMENTE service + router + teste autorizado
const P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH_VALUE = 'P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH';
const P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_VALUE = 'P23_R09W_VENDEDORES_MUTATION_TENANT_FIX';

// Fase AUTH: somente os guards podem ser alterados
const P23_R09W_AUTH_AUTHORIZED_FILES = [
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Fase FIX: alvo do fluxo ativo — service + router + teste de isolamento de mutações autorizado
// (guards, server/db/*, baseline, schema, package.json e financeiro.router.ts ficam BLOQUEADOS sob o valor FIX)
const P23_R09W_FIX_AUTHORIZED_FILES = [
  'server/services/users.service.ts',
  'server/routers.ts',
  'server/tests/vendedores-mutation-tenant-isolation.test.ts',
];

// União (claiming): arquivos sob tutela da janela R09W em qualquer valor
const P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_AUTHORIZED_FILES = P23_R09W_FIX_AUTHORIZED_FILES.concat(P23_R09W_AUTH_AUTHORIZED_FILES);

// Janela formal P23-R-09X - hardening de getVendedorById com tenantId obrigatório
// Dois valores distintos na mesma variável ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING:
//   AUTH (P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH) → fase AUTH: permite SOMENTE os 2 guards
//   FIX  (P23_R09X_VENDEDOR_BY_ID_TENANT_FIX)  → fase FIX: permite SOMENTE service + router + ownership + service-actor + teste autorizado
// FORA DO ESCOPO R09X: getVendedorByNome, financeiro semantic bug, getVendedorByUserId, getUserById,
//   server/db/core.ts, financeiro.router.ts, leo/**, tools/**, baseline, schema, package.json, frontend/**
const P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH_VALUE = 'P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH';
const P23_R09X_VENDEDOR_BY_ID_TENANT_FIX_VALUE = 'P23_R09X_VENDEDOR_BY_ID_TENANT_FIX';

// Fase AUTH: somente os guards podem ser alterados
const P23_R09X_AUTH_AUTHORIZED_FILES = [
  'scripts/guardrail-check.js',
  'scripts/architecture-contract-guard.mjs',
];

// Fase FIX: alvo do fluxo ativo — service + router + ownership + service-actor + teste autorizado
// (guards, server/db/*, financeiro.router.ts, leo/**, tools/**, baseline, schema e package.json ficam BLOQUEADOS sob o valor FIX)
const P23_R09X_FIX_AUTHORIZED_FILES = [
  'server/services/users.service.ts',
  'server/routers.ts',
  'server/_core/ownership.ts',
  'server/_core/service-actor.ts',
  'server/tests/vendedor-by-id-tenant-isolation.test.ts',
];

// União (claiming): arquivos sob tutela da janela R09X em qualquer valor
const P23_R09X_VENDEDOR_BY_ID_TENANT_HARDENING_AUTHORIZED_FILES = P23_R09X_FIX_AUTHORIZED_FILES.concat(P23_R09X_AUTH_AUTHORIZED_FILES);

/**
 * Verifica se arquivo tem autorização P23-G1 para limpeza de types de product variations
 * Requer variável ERP_AUTHORIZED_TYPES_UPDATE=P23_G1_REMOVE_PRODUCT_VARIATIONS_TYPES
 * Permite somente:
 *   - shared/types/entities.d.ts
 *   - server/services/inventory.service.ts
 */
function isP23_G1AuthorizedTypesCleanup(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_G1_REMOVE_PRODUCT_VARIATIONS_TYPES';
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
  if (P23_G1_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-G1 formal window: ERP_AUTHORIZED_TYPES_UPDATE=' + authorizedValue + ' (remove obsolete product variations references)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_G21_ADD_SKU_ID_TO_ITENS_PEDIDO';
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
  if (P23_G21_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-G2.1-B formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=' + authorizedValue + ' (add sku_id nullable to itens_pedido + migration guard prefix/hash)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_G22_ADD_SKU_ID_TO_PENDENCIAS';
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
  if (P23_G22_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-G2.2-B formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=' + authorizedValue + ' (add sku_id nullable to pendencias)'
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
 */
function isP23_SecAuthorizedCoreEnvUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_SEC_ENV_LOG_SANITIZE';
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
  if (P23_SEC_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-SEC formal window: ERP_AUTHORIZED_CORE_ENV_UPDATE=' + authorizedValue + ' (env log sanitize)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_COUNTERS_TENANT_UNIQUE_FIX';
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
  if (P23_COUNTERS_TENANT_UNIQUE_FIX_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-COUNTERS formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=' + authorizedValue + ' (counters composite unique fix)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_COUNTERS_TENANT_UNIQUE_WINDOW';
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
  if (P23_COUNTERS_TENANT_UNIQUE_WINDOW_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-COUNTERS-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=' + authorizedValue + ' (guard update for counters migration)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R05B_REMOVE_QUARANTINE_20260330';
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
  if (P23_R05B_DRIZZLE_QUARANTINE_CLEANUP_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-R-05B formal window: ERP_AUTHORIZED_DRIZZLE_QUARANTINE_CLEANUP=' + authorizedValue + ' (remove drizzle quarantine-20260330)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R08E_STOCK_MOVEMENTS_SCHEMA';
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
  if (P23_R08E_STOCK_MOVEMENTS_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-R08E formal window: ERP_AUTHORIZED_SCHEMA_UPDATE=' + authorizedValue + ' (stock movements schema)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R08E_STOCK_MOVEMENTS_WINDOW';
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
  if (P23_R08E_STOCK_MOVEMENTS_WINDOW_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-R08E-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=' + authorizedValue + ' (guard update for stock movements)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_APP_SECRET_MIDDLEWARE_EXTRACTION';
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
  if (P23_APP_SECRET_MIDDLEWARE_EXTRACTION_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-APP-SECRET formal window: ERP_AUTHORIZED_CORE_SECURITY_UPDATE=' + authorizedValue + ' (app secret middleware extraction)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_APP_SECRET_MIDDLEWARE_WINDOW';
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
  if (P23_APP_SECRET_MIDDLEWARE_WINDOW_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-APP-SECRET-WINDOW formal window: ERP_AUTHORIZED_GUARD_UPDATE=' + authorizedValue + ' (guard update for app secret middleware)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT';
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
  if (P23_REMOVE_OBSOLETE_TEST_LOGIN_SCRIPT_AUTHORIZED_FILES.includes(relativePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de test:login
    if (relativePath === 'package.json') {
      try {
        const diff = execSync('git diff --cached package.json', { 
          encoding: 'utf-8', 
          cwd: ROOT 
        });
        
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
      reason: 'P23-R-08E-07C-PACKAGE formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=' + authorizedValue + ' (remove obsolete test:login script)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL';
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
  if (P23_R08I_LOAD_TOKEN_SCRIPT_REMOVAL_AUTHORIZED_FILES.includes(relativePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de get-token
    if (relativePath === 'package.json') {
      try {
        const diff = execSync('git diff --cached package.json', { 
          encoding: 'utf-8', 
          cwd: ROOT 
        });
        
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
    if (relativePath === 'THROW_GENERIC_MAPPING_REPORT.md') {
      try {
        const diff = execSync('git diff --cached THROW_GENERIC_MAPPING_REPORT.md', { 
          encoding: 'utf-8', 
          cwd: ROOT 
        });
        
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
    if (relativePath === 'scripts/get-token.ts') {
      try {
        const status = execSync('git diff --cached --name-status -- scripts/get-token.ts', {
          encoding: 'utf-8',
          cwd: ROOT
        }).trim();
        if (!status.startsWith('D')) {
          return { authorized: false, reason: 'scripts/get-token.ts must have status D (deleted). Found: ' + status };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check scripts/get-token.ts status' };
      }
    }
    
    // Se for tests/load/access_token.txt, precisa verificar que o status é D (deleted)
    if (relativePath === 'tests/load/access_token.txt') {
      try {
        const status = execSync('git diff --cached --name-status -- tests/load/access_token.txt', {
          encoding: 'utf-8',
          cwd: ROOT
        }).trim();
        if (!status.startsWith('D')) {
          return { authorized: false, reason: 'tests/load/access_token.txt must have status D (deleted). Found: ' + status };
        }
      } catch (error) {
        return { authorized: false, reason: 'Failed to check tests/load/access_token.txt status' };
      }
    }
    
    return {
      authorized: true,
      reason: 'P23-R-08I-04E formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=' + authorizedValue + ' (remove obsolete load token script)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT';
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
  if (P23_R09B_REMOVE_DEAD_FIX_VENDEDOR_SCRIPT_AUTHORIZED_FILES.includes(relativePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de fix:vendedor
    if (relativePath === 'package.json') {
      try {
        const diff = execSync('git diff --cached package.json', { 
          encoding: 'utf-8', 
          cwd: ROOT 
        });
        
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
      reason: 'P23-R-09B-FIX formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=' + authorizedValue + ' (remove dead fix:vendedor script)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT';
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
  if (P23_R09F_REMOVE_DEAD_DB_PUSH_PROD_SCRIPT_AUTHORIZED_FILES.includes(relativePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de db:push:prod
    if (relativePath === 'package.json') {
      try {
        const diff = execSync('git diff --cached package.json', { 
          encoding: 'utf-8', 
          cwd: ROOT 
        });
        
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
      reason: 'P23-R-09F formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=' + authorizedValue + ' (remove dead db:push:prod script)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09_HARD_TEST_SHUTDOWN_HARDENING';
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
  if (P23_R09G_HARD_TEST_SHUTDOWN_HARDENING_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-R-09G-AUTH formal window: ERP_AUTHORIZED_CORE_UPDATE=' + authorizedValue + ' (harden hard test shutdown)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS';
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
  if (P23_R09H_REMOVE_HARD_TEST_SHUTDOWN_SCRIPT_ALIAS_AUTHORIZED_FILES.includes(relativePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de test:hard-shutdown
    if (relativePath === 'package.json') {
      try {
        const diff = execSync('git diff --cached package.json', { 
          encoding: 'utf-8', 
          cwd: ROOT 
        });
        
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
      reason: 'P23-R-09H-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=' + authorizedValue + ' (remove hard test shutdown package alias)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT';
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
  if (P23_R09J_REMOVE_DEAD_VALIDATE_FINAL_SCRIPT_AUTHORIZED_FILES.includes(relativePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção de validate:final
    if (relativePath === 'package.json') {
      try {
        const diff = execSync('git diff --cached package.json', { 
          encoding: 'utf-8', 
          cwd: ROOT 
        });
        
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
      reason: 'P23-R-09J-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=' + authorizedValue + ' (remove dead validate final script)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09K_DB_PUSH_ENV_GATE';
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
  if (P23_R09K2_DB_WRAPPER_HARDENING_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-R-09K2-AUTH formal window: ERP_AUTHORIZED_DB_WRAPPER_HARDENING=' + authorizedValue + ' (harden db push env gate)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09K_REMOVE_DB_PUSH_ALIAS';
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
  if (P23_R09K3_REMOVE_DB_PUSH_ALIAS_AUTHORIZED_FILES.includes(relativePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção do alias db:push
    if (relativePath === 'package.json') {
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
      reason: 'P23-R-09K3-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=' + authorizedValue + ' (remove raw db push alias)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09M_REMOVE_SEED_ADMIN_ALIAS';
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
  if (P23_R09M_REMOVE_SEED_ADMIN_ALIAS_AUTHORIZED_FILES.includes(relativePath)) {
    // Se for package.json, precisa verificar que o diff contém apenas a remoção do alias seed:admin
    if (relativePath === 'package.json') {
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
      reason: 'P23-R-09M-AUTH formal window: ERP_AUTHORIZED_PACKAGE_UPDATE=' + authorizedValue + ' (remove seed admin alias)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT';
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
  if (P23_R09O_REMOVE_LEGACY_SEED_ADMIN_SCRIPT_AUTHORIZED_FILES.includes(relativePath)) {
    // Para seed-admin.ts: permitir somente deleção total (status D no staged)
    if (relativePath === 'server/scripts/seed-admin.ts') {
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
      reason: 'P23-R-09O-AUTH formal window: ERP_AUTHORIZED_SCRIPT_REMOVAL=' + authorizedValue + ' (remove legacy seed-admin script)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES';
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
  if (P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES_AUTHORIZED_FILES.includes(relativePath)) {
    // Guard files: não exigem checagem de diff (janela formal referencia a si mesma)
    if (relativePath === 'scripts/guardrail-check.js' || relativePath === 'scripts/architecture-contract-guard.mjs') {
      return {
        authorized: true,
        reason: 'P23-R-09Q-AUTH formal window: ERP_AUTHORIZED_DOC_SEED_ADMIN_CLEANUP=' + authorizedValue + ' (clean dead seed-admin references)'
      };
    }

    try {
      const diff = execSync('git diff --cached ' + relativePath).toString();
      const lines = diff.split('\n');

      for (const line of lines) {
        const isAdded = line.startsWith('+') && !line.startsWith('+++');
        const isRemoved = line.startsWith('-') && !line.startsWith('---');
        if (!isAdded && !isRemoved) continue;

        // Para seed-massa-teste.ts: linhas alteradas NÃO podem tocar lógica
        if (relativePath === 'server/scripts/seed-massa-teste.ts') {
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
              return { authorized: false, reason: 'P23-R-09Q allows only cleanup of dead references. New seed command or credential forbidden in added line: ' + line };
            }
          }
        }
      }
    } catch (error) {
      return { authorized: false, reason: 'Failed to check staged diff for ' + relativePath };
    }

    return {
      authorized: true,
      reason: 'P23-R-09Q-AUTH formal window: ERP_AUTHORIZED_DOC_SEED_ADMIN_CLEANUP=' + authorizedValue + ' (clean dead seed-admin references)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09R_WEAK_CREDENTIAL_CLEANUP';
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
  if (P23_R09R_WEAK_CREDENTIAL_CLEANUP_AUTHORIZED_FILES.includes(relativePath)) {
    // Guard files: não exigem checagem de diff (janela formal referencia a si mesma)
    if (relativePath === 'scripts/guardrail-check.js' || relativePath === 'scripts/architecture-contract-guard.mjs') {
      return {
        authorized: true,
        reason: 'P23-R-09R-AUTH formal window: ERP_AUTHORIZED_WEAK_CREDENTIAL_CLEANUP=' + authorizedValue + ' (weak credential cleanup)'
      };
    }

    try {
      const diff = execSync('git diff --cached -- "' + relativePath + '"').toString();
      const lines = diff.split('\n');
      const fileSpecificPatterns = P23_R09R_FILE_SPECIFIC_FORBIDDEN_PATTERNS[relativePath] || [];

      for (const line of lines) {
        const isAdded = line.startsWith('+') && !line.startsWith('+++');
        if (!isAdded) continue;

        // Linhas adicionadas não podem conter nova credencial/comando perigoso/mount smart-auth
        for (const pattern of P23_R09R_FORBIDDEN_ADDITION_PATTERNS) {
          if (line.includes(pattern)) {
            return { authorized: false, reason: 'P23-R-09R allows only weak credential cleanup. New credential/dangerous reference forbidden in added line: ' + line };
          }
        }

        // Regras específicas por arquivo (mecânica de credencial insegura)
        for (const pattern of fileSpecificPatterns) {
          if (line.includes(pattern)) {
            return { authorized: false, reason: "P23-R-09R file rule violation for " + relativePath + ". Forbidden pattern '" + pattern + "' in added line: " + line };
          }
        }
      }
    } catch (error) {
      return { authorized: false, reason: 'Failed to check staged diff for ' + relativePath };
    }

    return {
      authorized: true,
      reason: 'P23-R-09R-AUTH formal window: ERP_AUTHORIZED_WEAK_CREDENTIAL_CLEANUP=' + authorizedValue + ' (weak credential cleanup)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_R09S_SEED_MASSA_LOCKDOWN';
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
  if (P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES.includes(relativePath)) {
    // Guard files: não exigem checagem de diff (janela formal referencia a si mesma)
    if (relativePath === 'scripts/guardrail-check.js' || relativePath === 'scripts/architecture-contract-guard.mjs') {
      return {
        authorized: true,
        reason: 'P23-R-09S-AUTH formal window: ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN=' + authorizedValue + ' (seed massa lockdown)'
      };
    }

    try {
      const diff = execSync('git diff --cached -- "' + relativePath + '"').toString();
      const lines = diff.split('\n');
      const fileSpecificPatterns = P23_R09S_FILE_SPECIFIC_FORBIDDEN_PATTERNS[relativePath] || [];

      for (const line of lines) {
        const isAdded = line.startsWith('+') && !line.startsWith('+++');
        if (!isAdded) continue;

        // Linhas adicionadas não podem conter nova credencial/seed legado/reset perigoso
        for (const pattern of P23_R09S_FORBIDDEN_ADDITION_PATTERNS) {
          if (line.includes(pattern)) {
            return { authorized: false, reason: 'P23-R-09S allows only seed-massa lockdown. New dangerous reference forbidden in added line: ' + line };
          }
        }

        // Regras específicas por arquivo (lógica insegura no seed / instrução de execução direta nos docs)
        for (const pattern of fileSpecificPatterns) {
          if (line.includes(pattern)) {
            return { authorized: false, reason: 'P23-R-09S file rule violation for ' + relativePath + ". Forbidden pattern '" + pattern + "' in added line: " + line };
          }
        }
      }
    } catch (error) {
      return { authorized: false, reason: 'Failed to check staged diff for ' + relativePath };
    }

    return {
      authorized: true,
      reason: 'P23-R-09S-AUTH formal window: ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN=' + authorizedValue + ' (seed massa lockdown)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const envValue = process.env.ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (ENV_RULES.md permanece bloqueado na fase AUTH)
  if (envValue === P23_R09T_ENV_RULES_SEED_MASSA_AUTH_VALUE) {
    if (P23_R09T_AUTH_AUTHORIZED_FILES.includes(relativePath)) {
      return {
        authorized: true,
        reason: 'P23-R-09T-AUTH formal window: ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP=' + P23_R09T_ENV_RULES_SEED_MASSA_AUTH_VALUE + ' (guards only — ENV_RULES.md locked)'
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de CLEAN: bloqueia
  if (envValue !== P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_VALUE) {
    return { authorized: false };
  }

  // Valor CLEAN: permite SOMENTE ENV_RULES.md (guards ficam bloqueados sob o valor CLEAN)
  if (P23_R09T_CLEANUP_AUTHORIZED_FILES.includes(relativePath)) {
    try {
      const diff = execSync('git diff --cached -- "' + relativePath + '"').toString();
      const lines = diff.split('\n');
      let deadRefRemovals = 0;

      for (const line of lines) {
        const isAdded = line.startsWith('+') && !line.startsWith('+++');
        const isRemoved = line.startsWith('-') && !line.startsWith('---');

        // R09T: nenhuma linha adicionada é permitida em ENV_RULES.md
        if (isAdded) {
          return { authorized: false, reason: 'P23-R-09T permite somente remoção da dead ref em ENV_RULES.md. Linha adicionada proibida: ' + line };
        }

        if (isRemoved) {
          // Única remoção permitida: a linha que referencia server/scripts/seed-massa-teste.ts
          if (!line.includes(P23_R09T_ALLOWED_REMOVAL_PATTERN)) {
            return { authorized: false, reason: 'P23-R-09T permite remover somente a referência a ' + P23_R09T_ALLOWED_REMOVAL_PATTERN + ' em ENV_RULES.md. Remoção proibida: ' + line };
          }
          deadRefRemovals++;
        }
      }

      if (deadRefRemovals !== 1) {
        return { authorized: false, reason: 'P23-R-09T exige exatamente 1 remoção da referência a ' + P23_R09T_ALLOWED_REMOVAL_PATTERN + ' em ENV_RULES.md. Remoções da dead ref detectadas: ' + deadRefRemovals };
      }
    } catch (error) {
      return { authorized: false, reason: 'Failed to check staged diff for ' + relativePath };
    }

    return {
      authorized: true,
      reason: 'P23-R-09T-CLEAN formal window: ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP=' + P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_VALUE + ' (ENV_RULES seed-massa dead ref cleanup)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const envValue = process.env.ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (service/router/teste bloqueados na fase AUTH)
  if (envValue === P23_R09U_VENDEDORES_LIST_TENANT_AUTH_VALUE) {
    if (P23_R09U_AUTH_AUTHORIZED_FILES.includes(relativePath)) {
      return {
        authorized: true,
        reason: 'P23-R-09U-AUTH formal window: ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX=' + P23_R09U_VENDEDORES_LIST_TENANT_AUTH_VALUE + ' (guards only — fix targets locked)'
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R09U_VENDEDORES_LIST_TENANT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE service + router + teste autorizado (guards bloqueados sob FIX)
  if (P23_R09U_FIX_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-R-09U-FIX formal window: ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX=' + P23_R09U_VENDEDORES_LIST_TENANT_FIX_VALUE + ' (vendedores.list tenant isolation fix)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const envValue = process.env.ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (service/router/teste bloqueados na fase AUTH)
  if (envValue === P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH_VALUE) {
    if (P23_R09W_AUTH_AUTHORIZED_FILES.includes(relativePath)) {
      return {
        authorized: true,
        reason: 'P23-R-09W-AUTH formal window: ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX=' + P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH_VALUE + ' (guards only — fix targets locked)'
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE service + router + teste autorizado (guards bloqueados sob FIX)
  if (P23_R09W_FIX_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-R-09W-FIX formal window: ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX=' + P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_VALUE + ' (vendedores mutation tenant isolation fix)'
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
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const envValue = process.env.ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING;

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Valor AUTH: permite SOMENTE os 2 guards (service/router/ownership/actor/teste bloqueados na fase AUTH)
  if (envValue === P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH_VALUE) {
    if (P23_R09X_AUTH_AUTHORIZED_FILES.includes(relativePath)) {
      return {
        authorized: true,
        reason: 'P23-R-09X-AUTH formal window: ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING=' + P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH_VALUE + ' (guards only — fix targets locked)'
      };
    }
    return { authorized: false };
  }

  // Valor diferente de AUTH e de FIX: bloqueia
  if (envValue !== P23_R09X_VENDEDOR_BY_ID_TENANT_FIX_VALUE) {
    return { authorized: false };
  }

  // Valor FIX: permite SOMENTE service + router + ownership + actor + teste autorizado (guards bloqueados sob FIX)
  if (P23_R09X_FIX_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-R-09X-FIX formal window: ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING=' + P23_R09X_VENDEDOR_BY_ID_TENANT_FIX_VALUE + ' (getVendedorById tenant hardening)'
    };
  }

  // Arquivo fora do escopo do valor ativo: bloqueia
  return { authorized: false };
}

// Janela formal P23-CORE - Core audit stub removal
const P23_CORE_AUTHORIZED_FILES = [
  'server/db/core.ts',
  'scripts/architecture-contract-guard.mjs',
  'scripts/guardrail-check.js',
];

/**
 * Verifica se arquivo tem autorização P23-CORE para remoção de audit stubs
 * Janela histórica ENCERRADA no commit 2884615ea.
 * Requer variável ERP_AUTHORIZED_CORE_UPDATE=P23_CORE_AUDIT_STUB_REMOVAL
 * Permite somente a lista exata de arquivos do commit 2884615ea.
 */
function isP23_CoreAuthorizedUpdate(filePath) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const authorizedValue = 'P23_CORE_AUDIT_STUB_REMOVAL';
  const envValue = process.env.ERP_AUTHORIZED_CORE_UPDATE;
  const authorizedCommit = '2884615ea';

  // Sem variável: bloqueia
  if (!envValue) {
    return { authorized: false };
  }

  // Variável errada: bloqueia
  if (envValue !== authorizedValue) {
    return { authorized: false };
  }

  // Verifica se o commit atual é o autorizado para esta janela histórica
  let currentCommit = '';
  try {
    currentCommit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch (e) { /* ignore */ }

  if (currentCommit !== authorizedCommit) {
    return { 
      authorized: false, 
      reason: `P23-CORE window CLOSED. Authorized only for commit ${authorizedCommit}. Current: ${currentCommit}`
    };
  }

  // Variável correta: verifica se arquivo está na lista exata
  if (P23_CORE_AUTHORIZED_FILES.includes(relativePath)) {
    return {
      authorized: true,
      reason: 'P23-CORE HISTORICAL window (LOCKED): ERP_AUTHORIZED_CORE_UPDATE=' + authorizedValue + ' (core audit stub removal)'
    };
  }

  // Arquivo fora da lista: bloqueia mesmo com variável correta
  return { authorized: false };
}

/**
 * Verifica se um arquivo está em área congelada
 */
function isFrozen(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  
  // Verifica janela formal P23-CORE (remoção de audit stubs)
  const p23_coreCheck = isP23_CoreAuthorizedUpdate(file);
  if (p23_coreCheck.authorized) {
    return { frozen: false, exception: true, p23_core: p23_coreCheck.reason };
  }

  // Verifica janela formal P20.4 primeiro
  const p20_4Check = isP20_4AuthorizedFrozenDocUpdate(file);
  if (p20_4Check.authorized) {
    return { frozen: false, exception: true, p20_4: p20_4Check.reason };
  }
  
  // Verifica janela formal P23-B (schema produto_skus)
  const p23_bCheck = isP23_BAuthorizedSchemaUpdate(file);
  if (p23_bCheck.authorized) {
    return { frozen: false, exception: true, p23_b: p23_bCheck.reason };
  }

  // Verifica janela formal P23-E (limpeza do journal drizzle)
  const p23_eCheck = isP23_EAuthorizedJournalUpdate(file);
  if (p23_eCheck.authorized) {
    return { frozen: false, exception: true, p23_e: p23_eCheck.reason };
  }

  // Verifica janela formal P23-E (bootstrap DB-only migrate runner)
  const p23_e_bootstrapCheck = isP23_EAuthorizedBootstrapUpdate(file);
  if (p23_e_bootstrapCheck.authorized) {
    return { frozen: false, exception: true, p23_e_bootstrap: p23_e_bootstrapCheck.reason };
  }

  // Verifica janela formal P23-G1 (limpeza de types de product variations)
  const p23_g1Check = isP23_G1AuthorizedTypesCleanup(file);
  if (p23_g1Check.authorized) {
    return { frozen: false, exception: true, p23_g1: p23_g1Check.reason };
  }

  // Verifica janela formal P23-G2.1-B (adicionar sku_id em itens_pedido)
  const p23_g21Check = isP23_G21AuthorizedSchemaUpdate(file);
  if (p23_g21Check.authorized) {
    return { frozen: false, exception: true, p23_g21: p23_g21Check.reason };
  }

  // Verifica janela formal P23-G2.2-B (adicionar sku_id em pendencias)
  const p23_g22Check = isP23_G22AuthorizedPendenciasSkuSchemaUpdate(file);
  if (p23_g22Check.authorized) {
    return { frozen: false, exception: true, p23_g22: p23_g22Check.reason };
  }

  // Verifica janela formal P23-SEC (env log sanitize)
  const p23_secCheck = isP23_SecAuthorizedCoreEnvUpdate(file);
  if (p23_secCheck.authorized) {
    return { frozen: false, exception: true, p23_sec: p23_secCheck.reason };
  }

  // Verifica janela formal P23-COUNTERS (schema counters composite unique fix)
  const p23_countersCheck = isP23_CountersTenantUniqueFixAuthorized(file);
  if (p23_countersCheck.authorized) {
    return { frozen: false, exception: true, p23_counters: p23_countersCheck.reason };
  }

  // Verifica janela formal P23-R-05B (drizzle quarantine cleanup)
  const p23_r05bCheck = isP23_R05BAuthorizedDrizzleQuarantineCleanup(file);
  if (p23_r05bCheck.authorized) {
    return { frozen: false, exception: true, p23_r05b: p23_r05bCheck.reason };
  }

  // Verifica janela formal P23-R08E (stock movements schema)
  const p23_r08eCheck = isP23_R08EAuthorizedStockMovementsSchemaUpdate(file);
  if (p23_r08eCheck.authorized) {
    return { frozen: false, exception: true, p23_r08e: p23_r08eCheck.reason };
  }

  // Verifica janela formal P23-R08E-WINDOW (guard update for stock movements)
  const p23_r08eWindowCheck = isP23_R08EStockMovementsWindowAuthorized(file);
  if (p23_r08eWindowCheck.authorized) {
    return { frozen: false, exception: true, p23_r08e_window: p23_r08eWindowCheck.reason };
  }

  // Verifica janela formal P23-APP-SECRET (app secret middleware extraction)
  const p23_appSecretCheck = isP23_AppSecretMiddlewareExtractionAuthorized(file);
  if (p23_appSecretCheck.authorized) {
    return { frozen: false, exception: true, p23_app_secret: p23_appSecretCheck.reason };
  }

  // Verifica janela formal P23-APP-SECRET-WINDOW (guard update for app secret middleware)
  const p23_appSecretWindowCheck = isP23_AppSecretMiddlewareWindowAuthorized(file);
  if (p23_appSecretWindowCheck.authorized) {
    return { frozen: false, exception: true, p23_app_secret_window: p23_appSecretWindowCheck.reason };
  }

  // Verifica janela formal P23-R-08E-07C-PACKAGE (remove obsolete test:login script)
  const p23_removeTestLoginCheck = isP23_RemoveObsoleteTestLoginScriptAuthorized(file);
  if (p23_removeTestLoginCheck.authorized) {
    return { frozen: false, exception: true, p23_remove_test_login: p23_removeTestLoginCheck.reason };
  }

  // Verifica janela formal P23-R-09B-FIX (remove dead fix:vendedor script)
  const p23_r09bFixVendedorCheck = isP23_R09BRemoveDeadFixVendedorScriptAuthorized(file);
  if (p23_r09bFixVendedorCheck.authorized) {
    return { frozen: false, exception: true, p23_r09b_fix_vendedor: p23_r09bFixVendedorCheck.reason };
  }

  // Verifica janela formal P23-R-09F (remove dead db:push:prod script)
  const p23_r09fDbPushProdCheck = isP23_R09FRemoveDeadDbPushProdScriptAuthorized(file);
  if (p23_r09fDbPushProdCheck.authorized) {
    return { frozen: false, exception: true, p23_r09f_db_push_prod: p23_r09fDbPushProdCheck.reason };
  }

  // Verifica janela formal P23-R-09G-AUTH (harden hard test shutdown)
  const p23_r09gHardTestShutdownCheck = isP23_R09GHardTestShutdownHardeningAuthorized(file);
  if (p23_r09gHardTestShutdownCheck.authorized) {
    return { frozen: false, exception: true, p23_r09g_hard_test_shutdown: p23_r09gHardTestShutdownCheck.reason };
  }

  // Verifica janela formal P23-R-09H-AUTH (remove hard test shutdown package alias)
  const p23_r09hHardTestShutdownCheck = isP23_R09HRemoveHardTestShutdownScriptAliasAuthorized(file);
  if (p23_r09hHardTestShutdownCheck.authorized) {
    return { frozen: false, exception: true, p23_r09h_hard_test_shutdown: p23_r09hHardTestShutdownCheck.reason };
  }

  // Verifica janela formal P23-R-09J-AUTH (remove dead validate final script)
  const p23_r09jValidateFinalCheck = isP23_R09JRemoveDeadValidateFinalScriptAuthorized(file);
  if (p23_r09jValidateFinalCheck.authorized) {
    return { frozen: false, exception: true, p23_r09j_validate_final: p23_r09jValidateFinalCheck.reason };
  }

  // Verifica janela formal P23-R-09K2-AUTH (harden db push env gate)
  const p23_r09k2DbWrapperCheck = isP23_R09K2DbWrapperHardeningAuthorized(file);
  if (p23_r09k2DbWrapperCheck.authorized) {
    return { frozen: false, exception: true, p23_r09k2_db_wrapper: p23_r09k2DbWrapperCheck.reason };
  }

  // Verifica janela formal P23-R-09K3-AUTH (remove raw db push alias)
  const p23_r09k3DbPushAliasCheck = isP23_R09K3RemoveRawDbPushAliasAuthorized(file);
  if (p23_r09k3DbPushAliasCheck.authorized) {
    return { frozen: false, exception: true, p23_r09k3_db_push_alias: p23_r09k3DbPushAliasCheck.reason };
  }

  // Verifica janela formal P23-R-09M-AUTH (remove seed admin alias)
  const p23_r09mSeedAdminCheck = isP23_R09MRemoveSeedAdminAliasAuthorized(file);
  if (p23_r09mSeedAdminCheck.authorized) {
    return { frozen: false, exception: true, p23_r09m_seed_admin: p23_r09mSeedAdminCheck.reason };
  }

  // Verifica janela formal P23-R-09O-AUTH (remove legacy seed-admin script)
  const p23_r09oSeedAdminCheck = isP23_R09ORemoveLegacySeedAdminScriptAuthorized(file);
  if (p23_r09oSeedAdminCheck.authorized) {
    return { frozen: false, exception: true, p23_r09o_seed_admin: p23_r09oSeedAdminCheck.reason };
  }

  // server/scripts/seed-admin.ts requer janela formal P23-R-09O para qualquer alteração
  if (relativePath === 'server/scripts/seed-admin.ts') {
    return { frozen: true, pattern: 'server/scripts/seed-admin.ts', p23_r09o_required: true };
  }

  // Verifica janela formal P23-R-09X (getVendedorById tenant hardening)
  // IMPORTANTE: R09X vem antes de R09W/R09U/R09T/R09S/R09R/R09Q — reivindica guards e arquivos do fix primeiro
  // (users.service.ts e routers.ts estão também no claim da R09W/R09U: a janela mais nova reivindica primeiro)
  const p23_r09xVendedorCheck = isP23_R09XVendedorByIdTenantHardeningAuthorized(file);
  if (p23_r09xVendedorCheck.authorized) {
    return { frozen: false, exception: true, p23_r09x_vendedor_by_id_tenant_hardening: p23_r09xVendedorCheck.reason };
  }

  // Janela R09X é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo congelado)
  //   FIX  → somente service + router + ownership + service-actor + teste autorizado (guards e qualquer outro arquivo congelados)
  if (process.env.ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING === P23_R09X_VENDEDOR_BY_ID_TENANT_AUTH_VALUE
      && !P23_R09X_AUTH_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09x_out_of_scope: true };
  }
  if (process.env.ERP_AUTHORIZED_VENDEDOR_BY_ID_TENANT_HARDENING === P23_R09X_VENDEDOR_BY_ID_TENANT_FIX_VALUE
      && !P23_R09X_FIX_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09x_out_of_scope: true };
  }

  // Arquivos não-guard da janela P23-R-09X requerem autorização formal para qualquer alteração
  if (P23_R09X_VENDEDOR_BY_ID_TENANT_HARDENING_AUTHORIZED_FILES.includes(relativePath)
      && !relativePath.startsWith('scripts/')) {
    return { frozen: true, pattern: relativePath, p23_r09x_required: true };
  }

  // Verifica janela formal P23-R-09W (vendedores mutation multi-tenant isolation fix)
  // IMPORTANTE: R09W vem antes de R09U/R09T/R09S/R09R/R09Q — reivindica guards e arquivos do fix primeiro
  // (users.service.ts e routers.ts estão também no claim da R09U: a janela mais nova reivindica primeiro)
  const p23_r09wVendedoresCheck = isP23_R09WVendedoresMutationTenantFixAuthorized(file);
  if (p23_r09wVendedoresCheck.authorized) {
    return { frozen: false, exception: true, p23_r09w_vendedores_mutation_tenant_fix: p23_r09wVendedoresCheck.reason };
  }

  // Janela R09W é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo congelado)
  //   FIX  → somente service + router + teste autorizado (guards e qualquer outro arquivo congelados)
  if (process.env.ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX === P23_R09W_VENDEDORES_MUTATION_TENANT_AUTH_VALUE
      && !P23_R09W_AUTH_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09w_out_of_scope: true };
  }
  if (process.env.ERP_AUTHORIZED_VENDEDORES_MUTATION_TENANT_FIX === P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_VALUE
      && !P23_R09W_FIX_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09w_out_of_scope: true };
  }

  // Arquivos não-guard da janela P23-R-09W requerem autorização formal para qualquer alteração
  if (P23_R09W_VENDEDORES_MUTATION_TENANT_FIX_AUTHORIZED_FILES.includes(relativePath)
      && !relativePath.startsWith('scripts/')) {
    return { frozen: true, pattern: relativePath, p23_r09w_required: true };
  }

  // Verifica janela formal P23-R-09U (vendedores.list multi-tenant isolation fix)
  // IMPORTANTE: R09U vem antes de R09T/R09S/R09R/R09Q — reivindica guards e arquivos do fix primeiro
  const p23_r09uVendedoresCheck = isP23_R09UVendedoresListTenantFixAuthorized(file);
  if (p23_r09uVendedoresCheck.authorized) {
    return { frozen: false, exception: true, p23_r09u_vendedores_list_tenant_fix: p23_r09uVendedoresCheck.reason };
  }

  // Janela R09U é fail-closed POR VALOR:
  //   AUTH → somente os 2 guards (qualquer outro arquivo congelado)
  //   FIX  → somente service + router + teste autorizado (guards e qualquer outro arquivo congelados)
  if (process.env.ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX === P23_R09U_VENDEDORES_LIST_TENANT_AUTH_VALUE
      && !P23_R09U_AUTH_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09u_out_of_scope: true };
  }
  if (process.env.ERP_AUTHORIZED_VENDEDORES_LIST_TENANT_FIX === P23_R09U_VENDEDORES_LIST_TENANT_FIX_VALUE
      && !P23_R09U_FIX_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09u_out_of_scope: true };
  }

  // Arquivos não-guard da janela P23-R-09U requerem autorização formal para qualquer alteração
  if (P23_R09U_VENDEDORES_LIST_TENANT_FIX_AUTHORIZED_FILES.includes(relativePath)
      && !relativePath.startsWith('scripts/')) {
    return { frozen: true, pattern: relativePath, p23_r09u_required: true };
  }

  // Verifica janela formal P23-R-09T-AUTH (ENV_RULES seed-massa dead ref cleanup)
  // IMPORTANTE: R09T vem antes de R09S/R09R/R09Q — reivindica ENV_RULES.md e guards primeiro
  const p23_r09tEnvRulesCheck = isP23_R09TEnvRulesSeedMassaCleanupAuthorized(file);
  if (p23_r09tEnvRulesCheck.authorized) {
    return { frozen: false, exception: true, p23_r09t_env_rules_seed_massa_cleanup: p23_r09tEnvRulesCheck.reason };
  }

  // Janela R09T é fail-closed POR VALOR:
  //   AUTH  → somente os 2 guards (ENV_RULES.md e qualquer outro arquivo congelados)
  //   CLEAN → somente ENV_RULES.md (guards e qualquer outro arquivo congelados)
  if (process.env.ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP === P23_R09T_ENV_RULES_SEED_MASSA_AUTH_VALUE
      && !P23_R09T_AUTH_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09t_out_of_scope: true };
  }
  if (process.env.ERP_AUTHORIZED_ENV_RULES_SEED_MASSA_CLEANUP === P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_VALUE
      && !P23_R09T_CLEANUP_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09t_out_of_scope: true };
  }

  // Arquivos não-guard da janela P23-R-09T requerem autorização formal para qualquer alteração
  if (P23_R09T_ENV_RULES_SEED_MASSA_CLEANUP_AUTHORIZED_FILES.includes(relativePath)
      && !relativePath.startsWith('scripts/')) {
    return { frozen: true, pattern: relativePath, p23_r09t_required: true };
  }

  // Verifica janela formal P23-R-09S-AUTH (seed massa lockdown)
  // IMPORTANTE: R09S vem antes de R09R/R09Q — reivindica seed-massa-teste.ts, docs operacionais e guards primeiro
  const p23_r09sLockdownCheck = isP23_R09SSeedMassaLockdownAuthorized(file);
  if (p23_r09sLockdownCheck.authorized) {
    return { frozen: false, exception: true, p23_r09s_seed_massa_lockdown: p23_r09sLockdownCheck.reason };
  }

  // Janela R09S é fail-closed: com a variável correta definida, qualquer arquivo fora da lista é congelado
  if (process.env.ERP_AUTHORIZED_SEED_MASSA_LOCKDOWN === 'P23_R09S_SEED_MASSA_LOCKDOWN'
      && !P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES.includes(relativePath)) {
    return { frozen: true, pattern: relativePath, p23_r09s_out_of_scope: true };
  }

  // Arquivos não-guard da janela P23-R-09S requerem autorização formal para qualquer alteração
  if (P23_R09S_SEED_MASSA_LOCKDOWN_AUTHORIZED_FILES.includes(relativePath)
      && !relativePath.startsWith('scripts/')) {
    return { frozen: true, pattern: relativePath, p23_r09s_required: true };
  }

  // Verifica janela formal P23-R-09R-AUTH (weak credential cleanup)
  const p23_r09rWeakCredCheck = isP23_R09RWeakCredentialCleanupAuthorized(file);
  if (p23_r09rWeakCredCheck.authorized) {
    return { frozen: false, exception: true, p23_r09r_weak_cred: p23_r09rWeakCredCheck.reason };
  }

  // Arquivos não-guard da janela P23-R-09R requerem autorização formal para qualquer alteração
  if (P23_R09R_WEAK_CREDENTIAL_CLEANUP_AUTHORIZED_FILES.includes(relativePath)
      && !relativePath.startsWith('scripts/')) {
    return { frozen: true, pattern: relativePath, p23_r09r_required: true };
  }

  // P23-R-09R: bloqueio permanente de mount do router smart-auth em qualquer arquivo não-guard
  // (router dormente que invoca credencial fraca hardcoded — montagem exige fase própria futura)
  if (!relativePath.startsWith('scripts/')) {
    try {
      const mountDiff = execSync('git diff --cached -- "' + relativePath + '"').toString();
      for (const mountLine of mountDiff.split('\n')) {
        if (mountLine.startsWith('+') && !mountLine.startsWith('+++')) {
          for (const mountPattern of P23_R09R_SMART_AUTH_MOUNT_PATTERNS) {
            if (mountLine.includes(mountPattern)) {
              return { frozen: true, pattern: 'smart-auth-mount', p23_r09r_mount_forbidden: true };
            }
          }
        }
      }
    } catch (error) {
      // Ignore diff errors here; other checks handle file-level failures
    }
  }

  // Verifica janela formal P23-R-09Q-AUTH (clean dead seed-admin references)
  const p23_r09qDeadRefCheck = isP23_R09QCleanDeadSeedAdminReferencesAuthorized(file);
  if (p23_r09qDeadRefCheck.authorized) {
    return { frozen: false, exception: true, p23_r09q_dead_refs: p23_r09qDeadRefCheck.reason };
  }

  // Arquivos não-guard da janela P23-R-09Q requerem autorização formal para qualquer alteração
  if (P23_R09Q_CLEAN_DEAD_SEED_ADMIN_REFERENCES_AUTHORIZED_FILES.includes(relativePath)
      && !relativePath.startsWith('scripts/')) {
    return { frozen: true, pattern: relativePath, p23_r09q_required: true };
  }

  // scripts/db/drizzle-wrapper.mjs requer janela formal P23-R-09K2 para qualquer alteração
  if (relativePath === 'scripts/db/drizzle-wrapper.mjs') {
    return { frozen: true, pattern: 'scripts/db/drizzle-wrapper.mjs', p23_r09k2_required: true };
  }

  // Verifica janela formal P23-R-08I-04E (remove obsolete load token script)
  const p23_r08iLoadTokenCheck = isP23_R08ILoadTokenScriptRemovalAuthorized(file);
  if (p23_r08iLoadTokenCheck.authorized) {
    return { frozen: false, exception: true, p23_r08i_load_token: p23_r08iLoadTokenCheck.reason };
  }

  // Verifica exceções padrão
  for (const exception of EXCEPTIONS) {
    if (relativePath.startsWith(exception) || relativePath === exception) {
      // Exceção especial: guard files requerem janela formal P23-COUNTERS-WINDOW ou P23-APP-SECRET-WINDOW
      if (relativePath === 'scripts/guardrail-check.js' || relativePath === 'scripts/architecture-contract-guard.mjs') {
        const p23_countersWindowCheck = isP23_CountersTenantUniqueWindowAuthorized(file);
        if (p23_countersWindowCheck.authorized) {
          return { frozen: false, exception: true, p23_counters_window: p23_countersWindowCheck.reason };
        }
        const p23_appSecretWindowCheck = isP23_AppSecretMiddlewareWindowAuthorized(file);
        if (p23_appSecretWindowCheck.authorized) {
          return { frozen: false, exception: true, p23_app_secret_window: p23_appSecretWindowCheck.reason };
        }
        // Se não tiver autorização da janela, trata como congelado
        return { frozen: true, pattern: 'scripts/', guard_window_required: true };
      }
      // Exceção especial: package.json requer janela formal P23-R-09H para remover test:hard-shutdown
      if (relativePath === 'package.json') {
        const p23_r09hCheck = isP23_R09HRemoveHardTestShutdownScriptAliasAuthorized(file);
        if (p23_r09hCheck.authorized) {
          return { frozen: false, exception: true, p23_r09h_hard_test_shutdown: p23_r09hCheck.reason };
        }
        const p23_r09jCheck = isP23_R09JRemoveDeadValidateFinalScriptAuthorized(file);
        if (p23_r09jCheck.authorized) {
          return { frozen: false, exception: true, p23_r09j_validate_final: p23_r09jCheck.reason };
        }
        const p23_r09k3Check = isP23_R09K3RemoveRawDbPushAliasAuthorized(file);
        if (p23_r09k3Check.authorized) {
          return { frozen: false, exception: true, p23_r09k3_db_push_alias: p23_r09k3Check.reason };
        }
        const p23_r09mCheck = isP23_R09MRemoveSeedAdminAliasAuthorized(file);
        if (p23_r09mCheck.authorized) {
          return { frozen: false, exception: true, p23_r09m_seed_admin: p23_r09mCheck.reason };
        }
        // Se não tiver autorização da janela, trata como congelado
        return { frozen: true, pattern: 'package.json', p23_r09h_required: true };
      }
      // Exceção especial: relations.ts e entities.ts precisam passar no drizzle-schema-guard
      if (relativePath === 'drizzle/relations.ts' || relativePath === 'shared/types/entities.ts') {
        return { frozen: true, exception: 'drizzle-check-required' };
      }
      return { frozen: false, exception: true };
    }
  }
  
  // Verifica padrões congelados
  for (const pattern of FROZEN_PATTERNS) {
    if (relativePath.startsWith(pattern) || relativePath === pattern) {
      return { frozen: true, pattern };
    }
  }
  
  return { frozen: false };
}

/**
 * Verifica se drizzle-schema-guard passou
 */
function checkDrizzleGuard() {
  try {
    execSync('node scripts/drizzle-schema-guard.mjs', { 
      encoding: 'utf-8', 
      cwd: ROOT,
      stdio: 'pipe'
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Verifica se alteração em package.json é permitida (exceção restrita)
 * Só permite adição do script "guard:router-db-wall"
 * Bloqueia qualquer alteração em dependencies, devDependencies ou outros scripts
 */
function isPackageJsonChangeAllowed(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  
  if (relativePath !== 'package.json') {
    return { allowed: false };
  }
  
  try {
    // Obtém diff do arquivo staged
    const diff = execSync('git diff --cached package.json', { 
      encoding: 'utf-8', 
      cwd: ROOT 
    });
    
    // Se não houver diff, não há problema
    if (!diff.trim()) {
      return { allowed: true, reason: 'no-change' };
    }
    
    // Parse do diff para verificar o que foi alterado
    const lines = diff.split('\n');
    let hasGuardRouterDbWallAddition = false;
    let hasDependencyChange = false;
    let hasDevDependencyChange = false;
    let hasOtherScriptChange = false;
    
    for (const line of lines) {
      // Verifica adição do script guard:router-db-wall
      if (line.includes('+') && line.includes('guard:router-db-wall')) {
        hasGuardRouterDbWallAddition = true;
      }
      
      // Verifica alterações em dependencies
      if (line.includes('dependencies') || line.match(/^\+.*"dependencies"/)) {
        hasDependencyChange = true;
      }
      
      // Verifica alterações em devDependencies
      if (line.includes('devDependencies') || line.match(/^\+.*"devDependencies"/)) {
        hasDevDependencyChange = true;
      }
      
      // Verifica alterações em outros scripts (não guard:router-db-wall)
      if (line.includes('+') && line.includes('"') && line.includes(':') && 
          !line.includes('guard:router-db-wall') && 
          (line.includes('scripts') || line.match(/^\s*\+.*".*":/))) {
        // Verifica se é uma linha de script
        if (line.match(/^\s*\+\s*"[^"]+":\s*"node/)) {
          hasOtherScriptChange = true;
        }
      }
    }
    
    // Verifica se houve alteração em dependencies ou devDependencies (pelas linhas do diff)
    const diffContent = diff.toLowerCase();
    if (diffContent.includes('"dependencies"') && !diffContent.includes('"scripts"')) {
      // Se menciona dependencies mas não está na seção de scripts, bloqueia
      hasDependencyChange = true;
    }
    
    // Verifica se há adição/remoção de pacotes (linhas com +/- e nomes de pacotes)
    for (const line of lines) {
      if (line.match(/^\+.*"[^"]+":\s*"\^/)) {
        // Parece ser uma dependência sendo adicionada
        if (!line.includes('guard:router-db-wall')) {
          hasDependencyChange = true;
        }
      }
    }
    
    // Critérios de bloqueio
    if (hasDependencyChange) {
      return { 
        allowed: false, 
        reason: 'dependency-change',
        message: 'Alteração em dependencies não permitida'
      };
    }
    
    if (hasDevDependencyChange) {
      return { 
        allowed: false, 
        reason: 'dev-dependency-change',
        message: 'Alteração em devDependencies não permitida'
      };
    }
    
    if (hasOtherScriptChange) {
      return { 
        allowed: false, 
        reason: 'other-script-change',
        message: 'Alteração em scripts não relacionados não permitida'
      };
    }
    
    // Se tem a adição do script guard:router-db-wall e nada mais, permite
    if (hasGuardRouterDbWallAddition) {
      return { 
        allowed: true, 
        reason: 'guard-router-db-wall-addition',
        message: 'Adição do script guard:router-db-wall permitida'
      };
    }
    
    // Se não tem a adição do script, bloqueia
    return { 
      allowed: false, 
      reason: 'unauthorized-change',
      message: 'Alteração em package.json não autorizada'
    };
    
  } catch (error) {
    // Se não conseguir analisar o diff, bloqueia por segurança
    return { 
      allowed: false, 
      reason: 'diff-analysis-failed',
      message: 'Não foi possível analisar o diff de package.json'
    };
  }
}

/**
 * Verifica se alteração em server/security/rbac.ts é permitida (exceção restrita)
 * Só permite limpeza de tipagem (any -> PermissionContext)
 * Bloqueia qualquer alteração de lógica, novas permissões ou acesso ao DB
 */
function isRbacTypingCleanupAllowed(file) {
  if (relative(ROOT, file).replace(/\\/g, '/') !== 'server/security/rbac.ts') return { allowed: false };
  try {
    const diff = execSync('git diff --cached -- server/security/rbac.ts', { encoding: 'utf-8', cwd: ROOT });
    if (!diff.trim()) return { allowed: true, reason: 'no-change' };
    const additions = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const removals = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
    
    // Bloqueia DB, lógica, bypass, novas roles/permissões
    const forbidden = additions.find(l => 
      l.match(/db\.|getDb|getPool|query\(|execute\(|bypass|resource:|action:|const|let|var|if|return|switch|case|this\./) ||
      (l.trim().length > 1 && !l.includes('PermissionContext') && !l.match(/^\+\s*(\w+\?: number;|}|\]|,|\[|\s*)$/))
    );

    if (forbidden) return { allowed: false, message: `Bloqueado em rbac.ts: ${forbidden.trim()}` };
    
    const isCleanup = removals.some(l => l.includes('any')) && additions.some(l => l.includes('PermissionContext'));
    if (isCleanup) {
      return { allowed: true, reason: 'rbac-typing-cleanup', message: 'server/security/rbac.ts permitido apenas para RBAC typing cleanup.' };
    }
    return { allowed: false, message: 'server/security/rbac.ts: alteração deve remover "any" e usar "PermissionContext"' };
  } catch (e) { return { allowed: false, message: 'Não foi possível analisar o diff de rbac.ts' }; }
}

/**
 * Verifica se um arquivo está na lista de arquivos autorizados C3.1
 */
function isC3AuthorizedFile(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  return AUTHORIZED_C3_CORE_FILES.includes(relativePath);
}

/**
 * Analisa linhas adicionadas no diff staged de um arquivo
 * Retorna lista de padrões proibidos encontrados nas adições
 */
function findForbiddenC3Additions(file) {
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  try {
    const diff = execSync(`git diff --cached -- "${relativePath}"`, {
      encoding: 'utf-8',
      cwd: ROOT,
    });

    if (!diff.trim()) return [];

    const forbiddenFound = [];
    const lines = diff.split('\n');

    for (const line of lines) {
      // Analisa apenas linhas adicionadas (começam com +, mas não +++ do header)
      if (line.startsWith('+') && !line.startsWith('+++')) {
        for (const pattern of C3_FORBIDDEN_ADDITION_PATTERNS) {
          if (line.includes(pattern)) {
            forbiddenFound.push({ pattern, line: line.substring(1).trim() });
          }
        }
      }
    }

    return forbiddenFound;
  } catch (error) {
    // Se não conseguir analisar o diff, bloqueia por segurança
    return [{ pattern: 'diff-analysis-failed', line: 'não foi possível analisar o diff' }];
  }
}

/**
 * Mostra mensagem de violação da janela C3.1
 */
function showC3ViolationMessage(file, forbiddenItems) {
  console.error('\n🚫 CONTRATO DE ARQUITETURA VIOLADO - JANELA C3.1');
  console.error('\nArquivo permitido pela janela C3.1 somente para remover DB direto. Nova violação detectada.\n');
  console.error(`Arquivo: ${file}`);
  console.error('Padrões proibidos encontrados nas adições:');
  for (const item of forbiddenItems) {
    console.error(`  ❌ ${item.pattern} → ${item.line}`);
  }
  console.error('');
}

/**
 * Mostra mensagem de erro com orientação
 */
function showViolationMessage(file, pattern, packageMessage = null) {
  console.error('\n🚫 CONTRATO DE ARQUITETURA VIOLADO');
  console.error('\nEstado congelado:');
  console.error('BASE + INFRA + SCHEMA + TYPES + GUARD = ESTÁVEL\n');
  console.error(`Arquivo bloqueado:`);
  console.error(`  ${file}\n`);
  
  if (packageMessage) {
    console.error(`Motivo específico:`);
    console.error(`  ${packageMessage}\n`);
  }
  
  console.error(`Regra:`);
  console.error(`  Base/infra/schema/types/guard só podem ser alterados com fase autorizada.\n`);
  console.error(`Caminho correto:`);
  console.error(`  1. Pare`);
  console.error(`  2. Reporte`);
  console.error(`  3. Peça autorização do arquiteto`);
  console.error(`  4. Não tente corrigir fora do prompt\n`);
}

/**
 * Executa o guard
 */
function runGuard() {
  const args = process.argv.slice(2);
  const staged = !args.includes('--all');
  
  const changedFiles = getChangedFiles(staged);

  // P23-R-09O: deleções não aparecem em --diff-filter=ACM — detectar staged deletion de seed-admin.ts
  if (staged) {
    try {
      const status = execSync('git diff --cached --name-status -- server/scripts/seed-admin.ts', { encoding: 'utf-8', cwd: ROOT }).toString().trim();
      if (status.startsWith('D') && !changedFiles.includes('server/scripts/seed-admin.ts')) {
        changedFiles.push('server/scripts/seed-admin.ts');
      }
    } catch (error) {
      // Sem repo git ou sem mudanças staged: ignora
    }
  }

  if (changedFiles.length === 0) {
    console.log('✅ Nenhum arquivo alterado para verificar.');
    process.exit(0);
  }
  
  console.log(`🔍 Verificando ${changedFiles.length} arquivo(s) alterado(s)...`);
  
  let violations = [];
  let drizzleCheckRequired = false;
  
  for (const file of changedFiles) {
    const result = isFrozen(file);
    
    if (result.frozen) {
      // Exceção especial para package.json: verifica se a alteração é permitida
      const relativePath = relative(ROOT, file).replace(/\\/g, '/');
      if (relativePath === 'package.json') {
        const packageCheck = isPackageJsonChangeAllowed(file);
        if (packageCheck.allowed) {
          console.log(`✅ ${file} (permitido: ${packageCheck.reason})`);
          continue;
        } else {
          violations.push({ 
            file, 
            pattern: result.pattern, 
            packageReason: packageCheck.reason,
            packageMessage: packageCheck.message 
          });
          console.log(`🚫 ${file} (área congelada - ${packageCheck.message})`);
          continue;
        }
      }
      
      // Exceção especial para rbac.ts: RBAC typing cleanup
      if (relativePath === 'server/security/rbac.ts') {
        const rbacCheck = isRbacTypingCleanupAllowed(file);
        if (rbacCheck.allowed) {
          console.log(`✅ ${file} (permitido: ${rbacCheck.reason})`);
          continue;
        } else {
          violations.push({ 
            file, 
            pattern: result.pattern, 
            packageReason: rbacCheck.reason,
            packageMessage: rbacCheck.message 
          });
          console.log(`🚫 ${file} (área congelada - ${rbacCheck.message})`);
          continue;
        }
      }
      
      // Verifica janela controlada C3.1
      if (isC3AuthorizedFile(file)) {
        const forbiddenItems = findForbiddenC3Additions(file);
        if (forbiddenItems.length > 0) {
          violations.push({ file, pattern: 'c3-forbidden-addition', c3ForbiddenItems: forbiddenItems });
          showC3ViolationMessage(file, forbiddenItems);
          console.log(`🚫 ${file} (C3.1: nova violação DB detectada)`);
        } else {
          console.log(`✅ ${file} (C3.1: autorizado, sem novas violações DB)`);
        }
      } else if (result.exception === 'drizzle-check-required') {
        drizzleCheckRequired = true;
        console.log(`⚠️  ${file} requer verificação do drizzle-schema-guard`);
      } else {
        violations.push({ file, pattern: result.pattern });
        console.log(`🚫 ${file} (área congelada)`);
      }
    } else {
      console.log(`✅ ${file} (permitido)`);
    }
  }
  
  // Se precisa verificar drizzle-guard
  if (drizzleCheckRequired) {
    console.log('\n🔍 Executando drizzle-schema-guard...');
    if (!checkDrizzleGuard()) {
      console.error('\n❌ drizzle-schema-guard falhou. Abortando.');
      process.exit(1);
    }
    console.log('✅ drizzle-schema-guard passou.');
  }
  
  // Se há violações, bloqueia
  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} violação(ões) encontrada(s):\n`);
    for (const violation of violations) {
      showViolationMessage(violation.file, violation.pattern, violation.packageMessage);
      console.error('---');
    }
    process.exit(1);
  }
  
  console.log('\n✅ Architecture Contract Guard: PASSED');
  process.exit(0);
}

// Executa
runGuard();
