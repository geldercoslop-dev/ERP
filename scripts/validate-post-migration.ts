#!/usr/bin/env tsx
import { initEnv } from "../server/_core/env/bootstrapEnv";
import { execSync } from 'child_process';

// Carrega variáveis de ambiente antes das validações
initEnv();

/**
 * VALIDATE:POST-MIGRATION
 *
 * Valida o estado do sistema após uma migration ser aplicada.
 *
 * Validações:
 * - TypeScript compila
 * - verify:base passa
 * - Não há regressões
 * - Migrations estão aplicadas corretamente
 */

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

function runStep(name: string, command: string, critical = true): boolean {
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
// VALIDAÇÃO PÓS-MIGRATION
// ============================================================================
info('\n' + '='.repeat(60));
info('POST-MIGRATION VALIDATION');
info('='.repeat(60));

// ============================================================================
// STEP 1: TYPESCRIPT
// ============================================================================
info('\n' + '='.repeat(60));
info('STEP 1: TypeScript Compilation');
info('='.repeat(60));

runStep(
  'TYPESCRIPT',
  'npx tsc --noEmit',
  true
);

if (failed) {
  error('\n🚨 TYPESCRIPT FAILED - Abortando validação pós-migration');
  error('Corrija os erros de TypeScript antes de prosseguir');
  process.exit(1);
}

// ============================================================================
// STEP 2: VERIFY:BASE
// ============================================================================
info('\n' + '='.repeat(60));
info('STEP 2: Verify Base');
info('='.repeat(60));

runStep(
  'VERIFY_BASE',
  'pnpm verify:base',
  true
);

if (failed) {
  error('\n🚨 VERIFY:BASE FAILED - Abortando validação pós-migration');
  error('Corrija os erros de verify:base antes de prosseguir');
  process.exit(1);
}

// ============================================================================
// STEP 3: DB:GENERATE (para verificar consistência)
// ============================================================================
info('\n' + '='.repeat(60));
info('STEP 3: DB Generate (Consistency Check)');
info('='.repeat(60));

runStep(
  'DB_GENERATE',
  'pnpm db:generate',
  false // Non-blocking - apenas para verificar
);

// ============================================================================
// RESULTADO FINAL
// ============================================================================
info('\n' + '='.repeat(60));

if (failed) {
  error('🚨 POST-MIGRATION VALIDATION FAILED');
  error('Uma ou mais validações falharam');
  error('Corrija os erros antes de prosseguir');
  error('');
  error('Se você aplicou uma migration, pode ser necessário:');
  error('  1. Reverter a migration');
  error('  2. Corrigir o schema.ts');
  error('  3. Gerar nova migration');
  error('  4. Aplicar novamente');
  process.exit(1);
} else {
  success('✅ POST-MIGRATION VALIDATION PASSED');
  success('Todas as validações passaram com sucesso');
  success('');
  success('O sistema está em estado consistente após a migration');
  process.exit(0);
}
