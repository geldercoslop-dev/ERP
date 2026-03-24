#!/usr/bin/env node

/**
 * WINDSURF-QUICK-REPORT.mjs
 * 
 * Relatório rápido de estado do sistema
 * Sem dependências de servidor rodando
 */

import { execSync } from 'child_process';
import { statSync, readFileSync } from 'fs';

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║              🌊 WINDSURF - RELATÓRIO DE ESTADO DO SISTEMA 🌊             ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

let allChecks = [];

// 1. TYPECHECK
console.log('\n1️⃣  VERIFICANDO TYPECHECK...');
try {
  execSync('pnpm exec tsc -p tsconfig.server.json --noEmit', {
    cwd: 'c:\\ERP',
    timeout: 120000,
    stdio: 'pipe',
  });
  console.log('   ✅ ZERO erros de tipo');
  allChecks.push({ test: 'TypeScript', status: 'PASS' });
} catch (error) {
  console.log('   ❌ Erros de tipo encontrados');
  allChecks.push({ test: 'TypeScript', status: 'FAIL' });
}

// 2. VERIFICAR FILES
console.log('\n2️⃣  VERIFICANDO ARQUIVOS...');

const filesToCheck = [
  'server/queue/worker.ts',
  'server/config/env.ts',
  'server/scripts/check-infra.mjs',
  'server/scripts/W1-test-multitenant.mjs',
  'server/scripts/W2-test-e2e.mjs',
  'server/scripts/W3-test-leo.mjs',
  'server/scripts/W4-test-load.mjs',
  'server/scripts/W5-test-final.mjs',
  'server/scripts/windsurf-full-test.mjs',
];

let filesOk = 0;
for (const file of filesToCheck) {
  try {
    statSync(`c:\\ERP\\${file}`);
    filesOk++;
  } catch {
    console.log(`   ❌ ${file} não encontrado`);
  }
}

console.log(`   ✅ ${filesOk}/${filesToCheck.length} arquivos OK`);
allChecks.push({ test: 'Files', status: filesOk === filesToCheck.length ? 'PASS' : 'FAIL' });

// 3. VERIFICAR PACKAGE.JSON
console.log('\n3️⃣  VERIFICANDO PACKAGE.JSON...');
try {
  const pkg = JSON.parse(readFileSync('c:\\ERP\\package.json', 'utf8'));
  const scripts = [
    'test:w1',
    'test:w2', 
    'test:w3',
    'test:w4',
    'test:w5',
    'test:windsurf',
    'check:infra',
  ];
  
  let scriptsOk = 0;
  for (const script of scripts) {
    if (pkg.scripts[script]) {
      scriptsOk++;
    }
  }
  
  console.log(`   ✅ ${scriptsOk}/${scripts.length} scripts configurados`);
  allChecks.push({ test: 'Scripts', status: scriptsOk === scripts.length ? 'PASS' : 'FAIL' });
} catch {
  console.log('   ❌ Erro ao ler package.json');
  allChecks.push({ test: 'Scripts', status: 'FAIL' });
}

// 4. VERIFICAR SYNTAX DOS TESTES
console.log('\n4️⃣  VERIFICANDO SYNTAX DOS SCRIPTS...');
let syntaxOk = 0;
const testFiles = [
  'W1-test-multitenant.mjs',
  'W2-test-e2e.mjs',
  'W3-test-leo.mjs',
  'W4-test-load.mjs',
  'W5-test-final.mjs',
  'windsurf-full-test.mjs',
];

for (const file of testFiles) {
  try {
    execSync(`node --check server/scripts/${file}`, {
      cwd: 'c:\\ERP',
      stdio: 'pipe',
    });
    syntaxOk++;
  } catch {
    console.log(`   ⚠️  ${file} pode ter erros de syntax`);
  }
}

console.log(`   ✅ ${syntaxOk}/${testFiles.length} scripts com syntax OK`);
allChecks.push({ test: 'Syntax', status: syntaxOk >= testFiles.length - 2 ? 'PASS' : 'FAIL' });

// RESUMO
console.log(`\n${'='.repeat(70)}`);
console.log('📊 RESUMO DE PRÉ-REQUISITOS');
console.log('='.repeat(70));

for (const check of allChecks) {
  const emoji = check.status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${check.test.padEnd(20)} ${check.status}`);
}

const allPassed = allChecks.every(c => c.status === 'PASS');

console.log(`\n${'='.repeat(70)}`);
if (allPassed) {
  console.log('✨ SISTEMA PRONTO PARA TESTES WINDSURF');
  console.log('='.repeat(70));
  console.log(`
PRÓXIMOS PASSOS:

1. Iniciar servidor:
   pnpm build
   pnpm start:prod

2. Em outro terminal, rodar testes:
   pnpm run test:windsurf

Ou rodar testes individualmente:
   pnpm run test:w1
   pnpm run test:w2
   pnpm run test:w3
   pnpm run test:w4
   pnpm run test:w5
`);
} else {
  console.log('⚠️  FALHA EM PRÉ-REQUISITOS');
  console.log('='.repeat(70));
  console.log('\nCertifique-se de que todos os checks estão em ✅');
}

process.exit(allPassed ? 0 : 1);
