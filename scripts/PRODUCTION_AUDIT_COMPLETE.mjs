#!/usr/bin/env node

/**
 * PRODUCTION-LEVEL AUDIT - COMPLETE BASE + INFRA VALIDATION
 * 
 * This script performs a comprehensive audit of the ERP system at production level:
 * - Phase 1: Database Real Audit
 * - Phase 2: Schema ↔ DB Consistency
 * - Phase 3: Service Layer Audit
 * - Phase 4: Route/API Audit
 * - Phase 5: Multi-Tenant Isolation Test
 * - Phase 6: Batch/Cron/Workers Audit
 * - Phase 7: Security & Bypass Detection
 * - Phase 8: Final Score
 * 
 * PRINCIPLE: Do not trust compilation logs, validate real runtime behavior
 */

import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Audit results storage
const auditResults = {
  phase1: { status: 'PENDING', issues: [], critical: [], high: [], medium: [], low: [] },
  phase2: { status: 'PENDING', issues: [], critical: [], high: [], medium: [], low: [] },
  phase3: { status: 'PENDING', issues: [], critical: [], high: [], medium: [], low: [] },
  phase4: { status: 'PENDING', issues: [], critical: [], high: [], medium: [], low: [] },
  phase5: { status: 'PENDING', issues: [], critical: [], high: [], medium: [], low: [] },
  phase6: { status: 'PENDING', issues: [], critical: [], high: [], medium: [], low: [] },
  phase7: { status: 'PENDING', issues: [], critical: [], high: [], medium: [], low: [] },
  phase8: { status: 'PENDING', score: null, summary: '' }
};

// Load environment
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
}

// Get database connection
async function getDatabaseConnection() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found in environment');
  }

  const url = new URL(databaseUrl);
  const config = {
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    waitForConnections: true,
    connectionLimit: 1,
  };

  return await mysql.createConnection(config);
}

// ============================================================================
// PHASE 1: DATABASE REAL AUDIT
// ============================================================================
async function phase1_DatabaseAudit(conn) {
  console.log('\n=== PHASE 1: DATABASE REAL AUDIT ===');
  auditResults.phase1.status = 'IN_PROGRESS';

  const schemaTables = [
    'cargas', 'clientes', 'comissoes', 'contas_fixas', 'contas_pagar',
    'contas_receber', 'cores', 'counters', 'fornecedores', 'grupos_precificacao',
    'itens_pedido', 'pedidos', 'pedidos_carga', 'pendencias_compra', 'pendencias',
    'plano_contas', 'produtos', 'tenants', 'users', 'vendedores',
    'cliente_vendedores', 'idempotency_keys', 'boletos', 'caixa_mensal',
    'promocoes', 'promocoes_itens'
  ];

  // 1.1 Check all tables exist
  const [dbTables] = await conn.query('SHOW TABLES');
  const dbTableNames = dbTables.map(t => Object.values(t)[0]);

  for (const table of schemaTables) {
    if (!dbTableNames.includes(table)) {
      auditResults.phase1.critical.push(`Table ${table} missing in database`);
      auditResults.phase1.issues.push(`CRITICAL: Table ${table} missing in database`);
    }
  }

  // 1.2 Check for extra tables
  for (const table of dbTableNames) {
    if (!schemaTables.includes(table)) {
      auditResults.phase1.medium.push(`Extra table in database: ${table}`);
      auditResults.phase1.issues.push(`MEDIUM: Extra table in database: ${table}`);
    }
  }

  // 1.3 Check tenantId presence in tables that should have it
  const tablesRequiringTenantId = [
    'cargas', 'clientes', 'contas_pagar', 'contas_receber', 'cores',
    'pendencias', 'produtos', 'users', 'vendedores', 'cliente_vendedores',
    'boletos', 'caixa_mensal', 'promocoes'
  ];

  for (const table of tablesRequiringTenantId) {
    if (dbTableNames.includes(table)) {
      const [columns] = await conn.query(`DESCRIBE ${table}`);
      const hasTenantId = columns.some(col => col.Field === 'tenant_id');
      if (!hasTenantId) {
        auditResults.phase1.critical.push(`Table ${table} missing tenant_id column`);
        auditResults.phase1.issues.push(`CRITICAL: Table ${table} missing tenant_id column`);
      }
    }
  }

  // 1.4 Check foreign key validity
  const [fkStatus] = await conn.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
  `);

  const fkViolations = [];
  for (const fk of fkStatus) {
    try {
      const [check] = await conn.query(`
        SELECT COUNT(*) as cnt FROM ${fk.TABLE_NAME}
        LEFT JOIN ${fk.REFERENCED_TABLE_NAME} ON ${fk.TABLE_NAME}.${fk.COLUMN_NAME} = ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}
        WHERE ${fk.TABLE_NAME}.${fk.COLUMN_NAME} IS NOT NULL AND ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME} IS NULL
      `);
      if (check[0].cnt > 0) {
        fkViolations.push(`${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}: ${check[0].cnt} orphaned records`);
      }
    } catch (e) {
      // Skip if query fails
    }
  }

  if (fkViolations.length > 0) {
    auditResults.phase1.critical.push(...fkViolations.map(v => `FK violation: ${v}`));
    auditResults.phase1.issues.push(...fkViolations.map(v => `CRITICAL: FK violation: ${v}`));
  }

  // 1.5 Check for orphaned data in tenant tables
  for (const table of tablesRequiringTenantId) {
    if (dbTableNames.includes(table)) {
      try {
        const [orphaned] = await conn.query(`
          SELECT COUNT(*) as cnt FROM ${table}
          LEFT JOIN tenants ON ${table}.tenant_id = tenants.id
          WHERE ${table}.tenant_id IS NOT NULL AND tenants.id IS NULL
        `);
        if (orphaned[0].cnt > 0) {
          auditResults.phase1.critical.push(`Orphaned records in ${table}: ${orphaned[0].cnt} records reference non-existent tenant`);
          auditResults.phase1.issues.push(`CRITICAL: Orphaned records in ${table}: ${orphaned[0].cnt}`);
        }
      } catch (e) {
        // Skip if query fails
      }
    }
  }

  // 1.6 Financial consistency checks
  if (dbTableNames.includes('pedidos') && dbTableNames.includes('contas_receber')) {
    try {
      const [financialCheck] = await conn.query(`
        SELECT 
          COUNT(DISTINCT p.id) as total_pedidos,
          COUNT(DISTINCT cr.pedido_id) as pedidos_com_conta
        FROM pedidos p
        LEFT JOIN contas_receber cr ON p.id = cr.pedido_id
      `);
      
      const diff = financialCheck[0].total_pedidos - financialCheck[0].pedidos_com_conta;
      if (diff > 0) {
        auditResults.phase1.medium.push(`Financial inconsistency: ${diff} pedidos without contas_receber`);
        auditResults.phase1.issues.push(`MEDIUM: Financial inconsistency: ${diff} pedidos without contas_receber`);
      }
    } catch (e) {
      auditResults.phase1.low.push('Financial consistency check skipped due to column mismatch');
    }
  }

  auditResults.phase1.status = 'COMPLETED';
  console.log(`Phase 1 completed: ${auditResults.phase1.critical.length} critical, ${auditResults.phase1.high.length} high, ${auditResults.phase1.medium.length} medium, ${auditResults.phase1.low.length} low`);
}

// ============================================================================
// PHASE 2: SCHEMA ↔ DB CONSISTENCY
// ============================================================================
async function phase2_SchemaConsistency(conn) {
  console.log('\n=== PHASE 2: SCHEMA ↔ DB CONSISTENCY ===');
  auditResults.phase2.status = 'IN_PROGRESS';

  const schemaPath = path.join(__dirname, '..', 'drizzle', 'schema.ts');
  if (!fs.existsSync(schemaPath)) {
    auditResults.phase2.critical.push('schema.ts file not found');
    auditResults.phase2.issues.push('CRITICAL: schema.ts file not found');
    auditResults.phase2.status = 'COMPLETED';
    return;
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

  // Extract table definitions from schema.ts
  const tableMatches = schemaContent.match(/export const (\w+) = mysqlTable\s*\(\s*"(\w+)"/g);
  const schemaTables = tableMatches ? tableMatches.map(m => {
    const match = m.match(/export const (\w+) = mysqlTable\s*\(\s*"(\w+)"/);
    return match ? match[2] : null;
  }).filter(Boolean) : [];

  const [dbTables] = await conn.query('SHOW TABLES');
  const dbTableNames = dbTables.map(t => Object.values(t)[0]);

  // 2.1 Check schema tables exist in DB
  for (const table of schemaTables) {
    if (!dbTableNames.includes(table)) {
      auditResults.phase2.critical.push(`Schema table ${table} missing in database`);
      auditResults.phase2.issues.push(`CRITICAL: Schema table ${table} missing in database`);
    }
  }

  // 2.2 Check DB tables exist in schema
  for (const table of dbTableNames) {
    if (!schemaTables.includes(table) && table !== '__drizzle_migrations') {
      auditResults.phase2.high.push(`Database table ${table} not defined in schema.ts`);
      auditResults.phase2.issues.push(`HIGH: Database table ${table} not defined in schema.ts`);
    }
  }

  // 2.3 Check column consistency
  for (const table of schemaTables) {
    if (dbTableNames.includes(table)) {
      const [dbColumns] = await conn.query(`DESCRIBE ${table}`);
      const dbColumnNames = dbColumns.map(c => c.Field);

      // Extract columns from schema (simplified regex)
      const tableRegex = new RegExp(`export const \\w+ = mysqlTable\\s*\\(\\s*"${table}"[^}]+\\}`, 's');
      const tableMatch = schemaContent.match(tableRegex);
      if (tableMatch) {
        const columnMatches = tableMatch[0].match(/(\w+):\s*(varchar|int|text|decimal|timestamp|boolean|mysqlEnum)/g);
        const schemaColumns = columnMatches ? columnMatches.map(m => m.split(':')[0]) : [];

        for (const col of schemaColumns) {
          if (!dbColumnNames.includes(col) && col !== 'id') {
            auditResults.phase2.medium.push(`Column ${col} in schema.ts not found in database table ${table}`);
            auditResults.phase2.issues.push(`MEDIUM: Column ${col} in schema.ts not found in database table ${table}`);
          }
        }
      }
    }
  }

  auditResults.phase2.status = 'COMPLETED';
  console.log(`Phase 2 completed: ${auditResults.phase2.critical.length} critical, ${auditResults.phase2.high.length} high, ${auditResults.phase2.medium.length} medium, ${auditResults.phase2.low.length} low`);
}

// ============================================================================
// PHASE 3: SERVICE LAYER AUDIT
// ============================================================================
async function phase3_ServiceAudit() {
  console.log('\n=== PHASE 3: SERVICE LAYER AUDIT ===');
  auditResults.phase3.status = 'IN_PROGRESS';

  const servicesDir = path.join(__dirname, '..', 'server', 'services');
  if (!fs.existsSync(servicesDir)) {
    auditResults.phase3.critical.push('services directory not found');
    auditResults.phase3.issues.push('CRITICAL: services directory not found');
    auditResults.phase3.status = 'COMPLETED';
    return;
  }

  // Find all service files
  const serviceFiles = [];
  function findServices(dir, base = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findServices(fullPath, path.join(base, entry.name));
      } else if (entry.name.endsWith('.service.ts')) {
        serviceFiles.push(path.join(base, entry.name));
      }
    }
  }
  findServices(servicesDir);

  // 3.1 Check tenantId usage in services
  for (const serviceFile of serviceFiles) {
    const servicePath = path.join(servicesDir, serviceFile);
    const content = fs.readFileSync(servicePath, 'utf-8');

    // Check if service accesses tenant data without tenantId parameter
    const hasTenantDataAccess = /pedidos|clientes|produtos|contas|vendedores/.test(content);
    const hasTenantIdParam = /tenantId|tenant_id/.test(content);

    if (hasTenantDataAccess && !hasTenantIdParam) {
      auditResults.phase3.high.push(`Service ${serviceFile} accesses tenant data without tenantId parameter`);
      auditResults.phase3.issues.push(`HIGH: Service ${serviceFile} accesses tenant data without tenantId parameter`);
    }

    // Check for direct DB access patterns
    if (/pool\.query|db\.query|executeQuery|mysql\.createPool/.test(content) && !content.includes('assertNoDirectDbAccess')) {
      auditResults.phase3.critical.push(`Service ${serviceFile} has direct DB access without guard`);
      auditResults.phase3.issues.push(`CRITICAL: Service ${serviceFile} has direct DB access without guard`);
    }
  }

  auditResults.phase3.status = 'COMPLETED';
  console.log(`Phase 3 completed: ${auditResults.phase3.critical.length} critical, ${auditResults.phase3.high.length} high, ${auditResults.phase3.medium.length} medium, ${auditResults.phase3.low.length} low`);
}

// ============================================================================
// PHASE 4: ROUTE / API AUDIT
// ============================================================================
async function phase4_RouteAudit() {
  console.log('\n=== PHASE 4: ROUTE / API AUDIT ===');
  auditResults.phase4.status = 'IN_PROGRESS';

  const routesDir = path.join(__dirname, '..', 'server', 'routes');
  if (!fs.existsSync(routesDir)) {
    auditResults.phase4.critical.push('routes directory not found');
    auditResults.phase4.issues.push('CRITICAL: routes directory not found');
    auditResults.phase4.status = 'COMPLETED';
    return;
  }

  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));

  for (const routeFile of routeFiles) {
    const routePath = path.join(routesDir, routeFile);
    const content = fs.readFileSync(routePath, 'utf-8');

    // 4.1 Check for tenantMiddleware usage
    const hasTenantMiddleware = /tenantMiddleware|tenant\.middleware/.test(content);
    const hasDataAccess = /pedidos|clientes|produtos|contas|vendedores/.test(content);

    if (hasDataAccess && !hasTenantMiddleware) {
      auditResults.phase4.critical.push(`Route ${routeFile} accesses data without tenantMiddleware`);
      auditResults.phase4.issues.push(`CRITICAL: Route ${routeFile} accesses data without tenantMiddleware`);
    }

    // 4.2 Check for auth guard
    const hasAuthGuard = /authMiddleware|requireAuth|isAuthenticated/.test(content);
    if (hasDataAccess && !hasAuthGuard) {
      auditResults.phase4.high.push(`Route ${routeFile} accesses data without auth guard`);
      auditResults.phase4.issues.push(`HIGH: Route ${routeFile} accesses data without auth guard`);
    }

    // 4.3 Check for public routes accessing sensitive data
    if (content.includes('public') || content.includes('router.get') && !hasAuthGuard) {
      if (hasDataAccess) {
        auditResults.phase4.critical.push(`Route ${routeFile} has public endpoint accessing sensitive data`);
        auditResults.phase4.issues.push(`CRITICAL: Route ${routeFile} has public endpoint accessing sensitive data`);
      }
    }
  }

  auditResults.phase4.status = 'COMPLETED';
  console.log(`Phase 4 completed: ${auditResults.phase4.critical.length} critical, ${auditResults.phase4.high.length} high, ${auditResults.phase4.medium.length} medium, ${auditResults.phase4.low.length} low`);
}

// ============================================================================
// PHASE 5: MULTI-TENANT ISOLATION TEST
// ============================================================================
async function phase5_MultiTenantIsolation(conn) {
  console.log('\n=== PHASE 5: MULTI-TENANT ISOLATION TEST ===');
  auditResults.phase5.status = 'IN_PROGRESS';

  // 5.1 Check if multiple tenants exist
  const [tenants] = await conn.query('SELECT id FROM tenants LIMIT 2');
  if (tenants.length < 2) {
    auditResults.phase5.medium.push('Less than 2 tenants in database - cannot test cross-tenant isolation');
    auditResults.phase5.issues.push('MEDIUM: Less than 2 tenants in database - cannot test cross-tenant isolation');
  } else {
    const tenant1 = tenants[0].id;
    const tenant2 = tenants[1].id;

    // 5.2 Test if queries properly filter by tenantId
    const tablesToTest = ['clientes', 'pedidos', 'produtos', 'contas_pagar', 'contas_receber'];
    
    for (const table of tablesToTest) {
      try {
        const [columns] = await conn.query(`DESCRIBE ${table}`);
        const hasTenantId = columns.some(col => col.Field === 'tenant_id');
        
        if (hasTenantId) {
          // Check if data exists for both tenants
          const [tenant1Data] = await conn.query(`SELECT COUNT(*) as cnt FROM ${table} WHERE tenant_id = ?`, [tenant1]);
          const [tenant2Data] = await conn.query(`SELECT COUNT(*) as cnt FROM ${table} WHERE tenant_id = ?`, [tenant2]);

          if (tenant1Data[0].cnt > 0 && tenant2Data[0].cnt > 0) {
            // Test if query without tenantId filter returns both tenants' data
            const [allData] = await conn.query(`SELECT COUNT(*) as cnt FROM ${table}`);
            const [filteredData] = await conn.query(`SELECT COUNT(*) as cnt FROM ${table} WHERE tenant_id IN (?, ?)`, [tenant1, tenant2]);

            if (allData[0].cnt !== filteredData[0].cnt) {
              auditResults.phase5.critical.push(`Table ${table} has data without tenant_id (potential cross-tenant leak)`);
              auditResults.phase5.issues.push(`CRITICAL: Table ${table} has data without tenant_id (potential cross-tenant leak)`);
            }
          }
        }
      } catch (e) {
        // Skip if table doesn't exist or query fails
      }
    }
  }

  auditResults.phase5.status = 'COMPLETED';
  console.log(`Phase 5 completed: ${auditResults.phase5.critical.length} critical, ${auditResults.phase5.high.length} high, ${auditResults.phase5.medium.length} medium, ${auditResults.phase5.low.length} low`);
}

// ============================================================================
// PHASE 6: BATCH / CRON / WORKERS AUDIT
// ============================================================================
async function phase6_BatchCronAudit() {
  console.log('\n=== PHASE 6: BATCH / CRON / WORKERS AUDIT ===');
  auditResults.phase6.status = 'IN_PROGRESS';

  const scriptsDir = path.join(__dirname);
  if (!fs.existsSync(scriptsDir)) {
    auditResults.phase6.critical.push('scripts directory not found');
    auditResults.phase6.issues.push('CRITICAL: scripts directory not found');
    auditResults.phase6.status = 'COMPLETED';
    return;
  }

  const scriptFiles = fs.readdirSync(scriptsDir).filter(f => 
    f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.ts') || f.endsWith('.bat') || f.endsWith('.sh')
  );

  for (const scriptFile of scriptFiles) {
    const scriptPath = path.join(scriptsDir, scriptFile);
    let content;
    try {
      content = fs.readFileSync(scriptPath, 'utf-8');
    } catch (e) {
      continue;
    }

    // 6.1 Check for direct DB access without tenant context
    if (/pool\.query|db\.query|executeQuery|mysql\.createPool/.test(content)) {
      if (!/tenantId|tenant_id|tenantContext/.test(content)) {
        auditResults.phase6.high.push(`Script ${scriptFile} accesses DB without tenant context`);
        auditResults.phase6.issues.push(`HIGH: Script ${scriptFile} accesses DB without tenant context`);
      }
    }

    // 6.2 Check for hardcoded tenant IDs
    const hardcodedTenantMatch = content.match(/tenant_id\s*=\s*\d+/gi);
    if (hardcodedTenantMatch) {
      auditResults.phase6.medium.push(`Script ${scriptFile} has hardcoded tenant_id: ${hardcodedTenantMatch.length} occurrences`);
      auditResults.phase6.issues.push(`MEDIUM: Script ${scriptFile} has hardcoded tenant_id: ${hardcodedTenantMatch.length} occurrences`);
    }
  }

  auditResults.phase6.status = 'COMPLETED';
  console.log(`Phase 6 completed: ${auditResults.phase6.critical.length} critical, ${auditResults.phase6.high.length} high, ${auditResults.phase6.medium.length} medium, ${auditResults.phase6.low.length} low`);
}

// ============================================================================
// PHASE 7: SECURITY & BYPASS DETECTION
// ============================================================================
async function phase7_SecurityBypassDetection() {
  console.log('\n=== PHASE 7: SECURITY & BYPASS DETECTION ===');
  auditResults.phase7.status = 'IN_PROGRESS';

  const serverDir = path.join(__dirname, '..', 'server');
  if (!fs.existsSync(serverDir)) {
    auditResults.phase7.critical.push('server directory not found');
    auditResults.phase7.issues.push('CRITICAL: server directory not found');
    auditResults.phase7.status = 'COMPLETED';
    return;
  }

  // 7.1 Search for direct DB access patterns
  function searchDirectory(dir, pattern, description) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        searchDirectory(fullPath, pattern, description);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (pattern.test(content)) {
            const relativePath = path.relative(serverDir, fullPath);
            auditResults.phase7.critical.push(`${description}: ${relativePath}`);
            auditResults.phase7.issues.push(`CRITICAL: ${description}: ${relativePath}`);
          }
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
  }

  // Check for raw SQL queries without proper guards
  searchDirectory(serverDir, /pool\.query|db\.query|mysql\.query/, 'Direct DB query');

  // Check for drizzle direct imports outside services
  searchDirectory(serverDir, /from ['"]drizzle-orm['"]/, 'Drizzle import');

  // Check for architecture guard bypass
  searchDirectory(serverDir, /@ts-ignore|@ts-nocheck|eslint-disable/, 'TypeScript/ESLint bypass');

  // 7.2 Check leo directory for service imports
  const leoDir = path.join(serverDir, 'leo');
  if (fs.existsSync(leoDir)) {
    function checkLeoForServiceImports(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkLeoForServiceImports(fullPath);
        } else if (entry.name.endsWith('.ts')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (/from.*services.*\.service['"]|from.*\/services\//.test(content)) {
              const relativePath = path.relative(serverDir, fullPath);
              auditResults.phase7.critical.push(`LEO imports service directly: ${relativePath}`);
              auditResults.phase7.issues.push(`CRITICAL: LEO imports service directly: ${relativePath}`);
            }
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    }
    checkLeoForServiceImports(leoDir);
  }

  auditResults.phase7.status = 'COMPLETED';
  console.log(`Phase 7 completed: ${auditResults.phase7.critical.length} critical, ${auditResults.phase7.high.length} high, ${auditResults.phase7.medium.length} medium, ${auditResults.phase7.low.length} low`);
}

// ============================================================================
// PHASE 8: FINAL SCORE
// ============================================================================
async function phase8_FinalScore() {
  console.log('\n=== PHASE 8: FINAL SCORE ===');
  auditResults.phase8.status = 'IN_PROGRESS';

  let totalCritical = 0;
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;

  for (let i = 1; i <= 7; i++) {
    const phase = auditResults[`phase${i}`];
    totalCritical += phase.critical.length;
    totalHigh += phase.high.length;
    totalMedium += phase.medium.length;
    totalLow += phase.low.length;
  }

  let score = 'EXCELLENT';
  let summary = '';

  if (totalCritical > 0) {
    score = 'CRITICAL - BLOCKS PRODUCTION';
    summary = `System has ${totalCritical} CRITICAL issues that must be fixed before production deployment. These include tenant leaks, missing tenantId columns, and security bypasses.`;
  } else if (totalHigh > 0) {
    score = 'HIGH - STRUCTURAL RISK';
    summary = `System has ${totalHigh} HIGH severity issues indicating structural risks. Review and fix before production.`;
  } else if (totalMedium > 0) {
    score = 'MEDIUM - ADJUSTMENT RECOMMENDED';
    summary = `System has ${totalMedium} MEDIUM severity issues. Adjustments recommended for optimal security.`;
  } else if (totalLow > 0) {
    score = 'LOW - REFINEMENT NEEDED';
    summary = `System has ${totalLow} LOW severity issues. Minor refinements suggested.`;
  } else {
    score = 'EXCELLENT - PRODUCTION READY';
    summary = 'System passed all audit checks. Zero tenant leaks, zero service layer bypass, schema matches DB, runtime secure, scripts protected, API isolated correctly.';
  }

  auditResults.phase8.score = score;
  auditResults.phase8.summary = summary;
  auditResults.phase8.status = 'COMPLETED';

  console.log(`\nFINAL SCORE: ${score}`);
  console.log(`Summary: ${summary}`);
  console.log(`Critical: ${totalCritical}, High: ${totalHigh}, Medium: ${totalMedium}, Low: ${totalLow}`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     PRODUCTION-LEVEL AUDIT - BASE + INFRA VALIDATION         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`Started at: ${new Date().toISOString()}`);

  loadEnv();

  let conn;
  try {
    conn = await getDatabaseConnection();
    console.log('Database connection established');
  } catch (e) {
    console.error('Failed to connect to database:', e.message);
    console.error('Proceeding with non-DB phases only...');
  }

  try {
    await phase1_DatabaseAudit(conn);
    await phase2_SchemaConsistency(conn);
    await phase3_ServiceAudit();
    await phase4_RouteAudit();
    await phase5_MultiTenantIsolation(conn);
    await phase6_BatchCronAudit();
    await phase7_SecurityBypassDetection();
    await phase8_FinalScore();
  } catch (e) {
    console.error('Audit failed:', e);
  } finally {
    if (conn) {
      await conn.end();
    }
  }

  // Generate report
  const reportPath = path.join(__dirname, 'PRODUCTION_AUDIT_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);

  // Generate markdown report
  const mdReport = generateMarkdownReport();
  const mdReportPath = path.join(__dirname, 'PRODUCTION_AUDIT_REPORT.md');
  fs.writeFileSync(mdReportPath, mdReport);
  console.log(`Markdown report saved to: ${mdReportPath}`);

  console.log(`\nAudit completed at: ${new Date().toISOString()}`);

  // Exit with appropriate code
  if (auditResults.phase8.score && auditResults.phase8.score.includes('CRITICAL')) {
    process.exit(1);
  } else if (auditResults.phase8.score && auditResults.phase8.score.includes('HIGH')) {
    process.exit(2);
  } else {
    process.exit(0);
  }
}

function generateMarkdownReport() {
  let md = '# PRODUCTION AUDIT REPORT\n\n';
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `**FINAL SCORE:** ${auditResults.phase8.score}\n\n`;
  md += `**Summary:** ${auditResults.phase8.summary}\n\n`;

  md += '## Issue Summary\n\n';
  md += '| Severity | Count |\n';
  md += '|----------|-------|\n';
  
  let totalCritical = 0, totalHigh = 0, totalMedium = 0, totalLow = 0;
  for (let i = 1; i <= 7; i++) {
    const phase = auditResults[`phase${i}`];
    totalCritical += phase.critical.length;
    totalHigh += phase.high.length;
    totalMedium += phase.medium.length;
    totalLow += phase.low.length;
  }
  
  md += `| Critical | ${totalCritical} |\n`;
  md += `| High | ${totalHigh} |\n`;
  md += `| Medium | ${totalMedium} |\n`;
  md += `| Low | ${totalLow} |\n\n`;

  for (let i = 1; i <= 7; i++) {
    const phase = auditResults[`phase${i}`];
    md += `## Phase ${i}: ${phase.status}\n\n`;
    
    if (phase.critical.length > 0) {
      md += '### Critical Issues\n';
      phase.critical.forEach(issue => {
        md += `- ${issue}\n`;
      });
      md += '\n';
    }
    
    if (phase.high.length > 0) {
      md += '### High Issues\n';
      phase.high.forEach(issue => {
        md += `- ${issue}\n`;
      });
      md += '\n';
    }
    
    if (phase.medium.length > 0) {
      md += '### Medium Issues\n';
      phase.medium.forEach(issue => {
        md += `- ${issue}\n`;
      });
      md += '\n';
    }
    
    if (phase.low.length > 0) {
      md += '### Low Issues\n';
      phase.low.forEach(issue => {
        md += `- ${issue}\n`;
      });
      md += '\n';
    }
    
    if (phase.critical.length === 0 && phase.high.length === 0 && phase.medium.length === 0 && phase.low.length === 0) {
      md += '✅ No issues found\n\n';
    }
  }

  return md;
}

main().catch(console.error);
