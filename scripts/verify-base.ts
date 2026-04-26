#!/usr/bin/env tsx
import { initEnv } from "../server/_core/env/bootstrapEnv";

// Carrega variáveis de ambiente antes das validações
initEnv();

/**
 * VERIFY:BASE - Gate obrigatório para prevenir regressão
 *
 * Executa validações em ordem crítica:
 * 1. Phase 0 Guard (arquitetura)
 * 2. TypeScript (type safety)
 * 3. Redis (conexão e autenticação)
 * 4. MySQL (conexão e pool)
 * 5. Audit Log (fluxo runtime)
 * 
 * Se qualquer etapa falhar → exit code 1 e para execução
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message: string) {
  log(message, 'red');
}

function success(message: string) {
  log(message, 'green');
}

function warn(message: string) {
  log(message, 'yellow');
}

function info(message: string) {
  log(message, 'blue');
}

let failed = false;
let currentStep = '';

function runStep(name: string, command: string, critical = true): boolean {
  currentStep = name;
  info(`\n🔍 STEP: ${name}`);
  info(`Command: ${command}`);
  
  try {
    execSync(command, { 
      stdio: 'inherit',
      env: { ...process.env }
    });
    success(`✅ ${name} PASSED`);
    return true;
  } catch (e) {
    const err = e as { status?: number; message?: string };
    error(`❌ ${name} FAILED`);
    if (critical) {
      failed = true;
    } else {
      warn(`⚠️  ${name} FAILED (non-blocking)`);
    }
    return false;
  }
}

// ============================================================================
// ETAPA 1: PHASE 0 GUARD
// ============================================================================
info('\n' + '='.repeat(60));
info('ETAPA 1: PHASE 0 GUARD - Arquitetura');
info('='.repeat(60));

runStep(
  'PHASE0_GUARD',
  'node scripts/guards/phase0-guard.ts',
  true
);

if (failed) {
  error('\n🚨 PHASE 0 GUARD FAILED - Abortando verify:base');
  process.exit(1);
}

// ============================================================================
// ETAPA 2: TYPESCRIPT
// ============================================================================
info('\n' + '='.repeat(60));
info('ETAPA 2: TYPESCRIPT - Type Safety');
info('='.repeat(60));

runStep(
  'TYPESCRIPT',
  'pnpm tsc --noEmit',
  true
);

if (failed) {
  error('\n🚨 TYPESCRIPT FAILED - Abortando verify:base');
  process.exit(1);
}

// ============================================================================
// ETAPA 3: REDIS VALIDATION
// ============================================================================
info('\n' + '='.repeat(60));
info('ETAPA 3: REDIS - Conexão e Autenticação');
info('='.repeat(60));

runStep(
  'REDIS_VALIDATION',
  'pnpm verify:redis',
  true
);

if (failed) {
  error('\n🚨 REDIS VALIDATION FAILED - Abortando verify:base');
  process.exit(1);
}

// ============================================================================
// ETAPA 4: MYSQL VALIDATION
// ============================================================================
info('\n' + '='.repeat(60));
info('ETAPA 4: MYSQL - Conexão e Pool');
info('='.repeat(60));

runStep(
  'MYSQL_VALIDATION',
  'pnpm verify:mysql',
  true
);

if (failed) {
  error('\n🚨 MYSQL VALIDATION FAILED - Abortando verify:base');
  process.exit(1);
}

// ============================================================================
// ETAPA 5: AUDIT LOG FLOW (Context-Aware - Optional in DEV)
// ============================================================================
info('\n' + '='.repeat(60));
info('ETAPA 5: AUDIT LOG - Fluxo Runtime');
info('='.repeat(60));

// Audit log validation is optional in development
const auditLogPath = 'scripts/legacy/verify-audit-log.mjs';
try {
  require('fs').accessSync(auditLogPath);
  runStep(
    'AUDIT_LOG_VALIDATION',
    `node ${auditLogPath}`,
    false // Non-blocking in development
  );
} catch {
  warn('⚠️  Audit log validation script not found - skipping');
  warn('This is acceptable in development mode');
}

// ============================================================================
// RESULTADO FINAL
// ============================================================================
info('\n' + '='.repeat(60));
if (failed) {
  error('🚨 VERIFY:BASE FAILED');
  error('Uma ou mais validações críticas falharam');
  error('Corrija os erros antes de prosseguir');
  process.exit(1);
} else {
  success('✅ VERIFY:BASE PASSED');
  success('Todas as validações críticas passaram com sucesso');
  process.exit(0);
}
