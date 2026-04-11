#!/usr/bin/env node
/**
 * scripts/test-validation-hardening.mjs
 * TESTE INTEGRADO: Valida que scripts de detecção funcionam (sem deps externas)
 * 
 * Exit: 0 se OK, 1 if erro crítico
 */

import { execSync } from 'node:child_process';

const tests = [
  { name: 'check-architecture.mjs', cmd: 'Set-Location c:\\ERP; node scripts/check-architecture.mjs', expectExit: [0, 1] },
  { name: 'check-architecture-hardened.mjs', cmd: 'Set-Location c:\\ERP; node scripts/check-architecture-hardened.mjs', expectExit: [0, 1] },
  { name: 'check-bad-patterns-hardened.mjs', cmd: 'Set-Location c:\\ERP; node scripts/check-bad-patterns-hardened.mjs', expectExit: [0, 1] },
  { name: 'check-leo-imports.mjs', cmd: 'Set-Location c:\\ERP; node scripts/check-leo-imports.mjs', expectExit: [0] },
  { name: 'check-bad-patterns.mjs', cmd: 'Set-Location c:\\ERP; node scripts/check-bad-patterns.mjs', expectExit: [0, 1] },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    process.stdout.write(`Testing ${test.name}... `);
    const res = execSync(test.cmd, {
      shell: 'powershell.exe',
      stdio: 'pipe',
      timeout: 10000,
      encoding: 'utf-8'
    });
    process.stdout.write('OK (exit 0)\n');
    passed++;
  } catch (err) {
    const exitCode = err.status;
    if (test.expectExit.includes(exitCode)) {
      process.stdout.write(`OK (exit ${exitCode})\n`);
      passed++;
    } else {
      process.stdout.write(`FAIL (unexpected exit ${exitCode})\n`);
      failed++;
    }
  }
}

// Check files exist
try {
  process.stdout.write('Checking tenant-guard-hardened.ts... ');
  execSync('if (Test-Path c:\\ERP\\server\\utils\\tenant-guard-hardened.ts) { exit 0 } else { exit 1 }', {
    shell: 'powershell.exe',
    stdio: 'pipe'
  });
  process.stdout.write('OK\n');
  passed++;
} catch {
  process.stdout.write('FAIL\n');
  failed++;
}

process.stdout.write(`\n${'='.repeat(50)}\n`);
process.stdout.write(`RESULTS: ${passed} OK, ${failed} FAIL\n`);
process.stdout.write(`${'='.repeat(50)}\n\n`);

process.exit(failed > 0 ? 1 : 0);
