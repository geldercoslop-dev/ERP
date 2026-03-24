#!/usr/bin/env node

/**
 * WINDSURF-FULL-TEST.mjs
 * 
 * Orquestra todos os 5 testes Windsurf:
 * W1 - Multi-tenant
 * W2 - E2E
 * W3 - LEO
 * W4 - Load
 * W5 - Final
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';

const execAsync = promisify(exec);

const TESTS = [
  { name: 'W1-MULTITENANT', cmd: 'node server/scripts/W1-test-multitenant.mjs', timeout: 30000 },
  { name: 'W2-E2E', cmd: 'node server/scripts/W2-test-e2e.mjs', timeout: 30000 },
  { name: 'W3-LEO', cmd: 'node server/scripts/W3-test-leo.mjs', timeout: 45000 },
  { name: 'W4-LOAD', cmd: 'node server/scripts/W4-test-load.mjs', timeout: 60000 },
  { name: 'W5-FINAL', cmd: 'node server/scripts/W5-test-final.mjs', timeout: 60000 },
];

let globalResults = [];
let startTime = Date.now();

async function runTest(test) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 INICIANDO TESTE: ${test.name}`);
  console.log(`${'='.repeat(70)}\n`);

  try {
    const testStartTime = Date.now();
    const { stdout, stderr } = await execAsync(test.cmd, {
      cwd: 'c:\\ERP',
      timeout: test.timeout,
    });

    const duration = Date.now() - testStartTime;
    const passed = stdout.includes('APROVADO') || stdout.includes('PASSED');
    const status = passed ? 'PASS' : 'FAIL';

    globalResults.push({
      test: test.name,
      status,
      duration,
      output: stdout.substring(0, 500), // Primeiros 500 chars
    });

    console.log(stdout);

    if (stderr && !stderr.includes('warn')) {
      console.log('STDERR:', stderr.substring(0, 300));
    }

    return passed;
  } catch (error) {
    globalResults.push({
      test: test.name,
      status: 'ERROR',
      duration: Date.now() - startTime,
      error: error.message,
    });

    console.log(`❌ ERRO ao executar ${test.name}:`);
    console.log(error.message);
    return false;
  }
}

async function generateReport() {
  const totalDuration = Date.now() - startTime;
  const passed = globalResults.filter(r => r.status === 'PASS').length;
  const failed = globalResults.filter(r => r.status === 'FAIL').length;
  const errors = globalResults.filter(r => r.status === 'ERROR').length;

  const report = `
╔════════════════════════════════════════════════════════════════════════════╗
║                    WINDSURF - RELATÓRIO FINAL REAL                         ║
║                                                                            ║
║                         ROADMAP COMPLETO TESTADO                           ║
╚════════════════════════════════════════════════════════════════════════════╝

📊 RESULTADO GERAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✅ APROVADOS:  ${passed}/5
  ❌ REPROVADOS: ${failed}/5
  ⚠️  ERROS:     ${errors}/5

  ⏱️  TEMPO TOTAL: ${(totalDuration / 1000).toFixed(2)}s

📋 RESULTADO POR FASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${globalResults.map(r => {
  const emoji = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
  return `  ${emoji} ${r.test.padEnd(20)} | Status: ${r.status.padEnd(8)} | ${(r.duration / 1000).toFixed(2)}s`;
}).join('\n')}

🎯 VALIDAÇÃO EXECUTIVA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${passed === 5 ? `
  ✨✨✨ SISTEMA 100% PRONTO PARA PRODUÇÃO ✨✨✨
  
  ✅ W1 - Multi-tenant isolamento OK
  ✅ W2 - E2E fluxo integral OK
  ✅ W3 - LEO respondendo sem vazamento
  ✅ W4 - Suporta carga (75 requisições)
  ✅ W5 - Boot limpo + responde externo

  🚀 DEPLOY AUTORIZADO
` : `
  ⚠️  TESTES REPROVADOS
  
  Revisar erros acima antes de fazer deploy em produção.
  Podem haver dados incompletos no teste.
`}

📌 DETALHES TÉCNICOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Ambiente: Tests com servidor real
  Banco de Dados: ${globalResults[0]?.output?.includes('MySQL') ? 'MySQL conectado' : 'Não validado'}
  Cache: ${globalResults[0]?.output?.includes('Redis') ? 'Redis conectado' : 'Não validado'}
  Node.js: v${process.version}
  Modo: ${process.env.NODE_ENV || 'development'}

📅 TIMESTAMP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Data: ${new Date().toLocaleString('pt-BR')}
  UTC:  ${new Date().toISOString()}

╔════════════════════════════════════════════════════════════════════════════╗
║  Relatório Gerado - Sem Simulações - Testes Reais com Servidor Real      ║
╚════════════════════════════════════════════════════════════════════════════╝
`;

  console.log(report);

  // Salvar relatório em arquivo
  try {
    const reportPath = 'c:\\ERP\\WINDSURF-REPORT.txt';
    writeFileSync(reportPath, report);
    console.log(`\n📄 Relatório salvo em: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Não conseguiu salvar relatório');
  }

  return passed === 5;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║                    🌊 WINDSURF - ROADMAP COMPLETO 🌊                      ║
║                                                                            ║
║                          TESTE REAL DE VERDADE                             ║
║                                                                            ║
║  W1 - Multi-tenant crítico      W4 - Teste de carga                       ║
║  W2 - E2E ERP                   W5 - Validação final                       ║
║  W3 - LEO Real                                                             ║
║                                                                            ║
║                       (Sem make, sem simulações)                           ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

  let allPassed = true;
  for (const test of TESTS) {
    const testPassed = await runTest(test);
    allPassed = allPassed && testPassed;
  }

  const approved = await generateReport();

  process.exit(approved ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
