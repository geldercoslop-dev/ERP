/**
 * ORQUESTRADOR: Consistência Do Banco
 * 
 * Fluxo Completo:
 * 1. Setup de dados (produto, cliente, vendedor)
 * 2. Executa 4 testes de transação/concorrência
 * 3. Gera relatório final
 * 4. Identifica pontos frágeis
 * 
 * Uso: npm run test:consistency
 */

import { initEnv } from '../_core/env/bootstrapEnv.js';
import { bootstrapServer } from '../_core/bootstrap.js';
import { setupTestData, cleanupTestData } from './setup-test-data.js';
import { DatabaseConsistencyTester } from './database-consistency-tester.js';
import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';

// Load ENV explicitly (NO import-time side effects)
initEnv();

const logger = pino();

interface FinalReport {
  timestamp: Date;
  duration: number;
  testResults: TestResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
  };
  fragilePoints: string[];
  recommendations: string[];
}

async function main() {
  const TEST_TENANT_ID = Number(process.env.TEST_TENANT_ID);
  if (!Number.isFinite(TEST_TENANT_ID) || TEST_TENANT_ID <= 0) {
    throw new Error("TEST_TENANT_ID não fornecido ou inválido. Defina TEST_TENANT_ID como variável de ambiente.");
  }

  // Bootstrap server before any DB access
  await bootstrapServer();

  const startTime = Date.now();
  let report: FinalReport = {
    timestamp: new Date(),
    duration: 0,
    testResults: [],
    summary: { totalTests: 0, passed: 0, failed: 0 },
    fragilePoints: [],
    recommendations: [],
  };

  try {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║     🧪 ORQUESTRADOR DE TESTES DE CONSISTÊNCIA DO BANCO DE DADOS             ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    console.log('');

    // ==================== FASE 1: SETUP ====================
    console.log('📋 FASE 1: PREPARAÇÃO DE DADOS');
    console.log('─────────────────────────────────────────────────────────────────');

    let testDataSetup;
    try {
      testDataSetup = await setupTestData(TEST_TENANT_ID);
      logger.info('✅ Setup de dados completado');
    } catch (e: unknown) {
      console.error('❌ Erro no setup:', e instanceof Error ? e.message : String(e));
      throw e;
    }

    console.log('');

    // ==================== FASE 2: TESTES ====================
    console.log('🧪 FASE 2: EXECUTANDO TESTES');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('');

    const tester = new DatabaseConsistencyTester();
    let testResults: TestResult[];
    try {
      const response = await tester.runAllTests();
      testResults = response.results;
      report.testResults = response.results;
      report.summary = response.summary;
    } catch (e: unknown) {
      // Testes não implementados - não é um erro de sistema, mas não podemos aprovar
      console.error('⚠️ Testes de consistência não implementados');
      console.error('   Erro:', e instanceof Error ? e.message : String(e));
      console.error('');
      console.error('╔════════════════════════════════════════════════════════════════════════════╗');
      console.error('║   ⚠️ TESTES DE CONSISTÊNCIA PENDENTES DE IMPLEMENTAÇÃO                ⚠️   ║');
      console.error('╚════════════════════════════════════════════════════════════════════════════╝');
      console.error('');
      
      // Limpar dados de teste mesmo que os testes não rodaram
      if (testDataSetup) {
        await cleanupTestData(TEST_TENANT_ID, testDataSetup);
      }
      
      process.exit(1);
    }

    console.log('');

    // ==================== FASE 3: ANÁLISE ====================
    console.log('📊 FASE 3: ANÁLISE DE RESULTADOS');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('');

    // Identificar pontos frágeis
    const failedTests = testResults.filter((r) => !r.passed);

    if (failedTests.length === 0) {
      console.log('✅ TODOS OS TESTES PASSARAM!');
      console.log('');
      console.log('   🎉 O banco de dados está SEGURO:');
      console.log('   ✓ Transações ACID funcionam');
      console.log('   ✓ Concorrência é tratada corretamente');
      console.log('   ✓ Idempotência está implementada');
      console.log('   ✓ Integridade referencial é mantida');
      console.log('');
      report.fragilePoints = [];
      report.recommendations = [
        'Sistema está operacional para produção',
        'Continuar monitorando em carga real',
        'Manter backups regulares',
      ];
    } else {
      console.log(`❌ ${failedTests.length} TESTE(S) FALHARAM!`);
      console.log('');

      failedTests.forEach((test, i: number) => {
        console.log(`   [${i + 1}] ${test.name}`);
        console.log(`       Erro: ${test.details.error || 'Validação falhou'}`);
      });
      console.log('');

      // Mapear para pontos frágeis
      failedTests.forEach((test) => {
        if (test.name.includes('ERROR_IN_MIDDLE')) {
          report.fragilePoints.push('❌ Transações NÃO fazem rollback completo');
          report.recommendations.push('Revisar safe-transaction.ts para lógica de rollback');
        }
        if (test.name.includes('CONCURRENT_STOCK')) {
          report.fragilePoints.push('❌ Race condition no estoque não tratada');
          report.recommendations.push('Adicionar SELECT ... FOR UPDATE em updateEstoque()');
          report.recommendations.push('Implementar pessimistic locking');
        }
        if (test.name.includes('IDEMPOTENCY')) {
          report.fragilePoints.push('❌ Idempotência não está funcionando');
          report.recommendations.push('Validar índice UNIQUE em idempotency_keys');
          report.recommendations.push('Revisar createOrderWithIdempotency() logic');
        }
        if (test.name.includes('INTEGRITY')) {
          report.fragilePoints.push('❌ Integridade referencial violada');
          report.recommendations.push('Rodar ANALYZE TABLE em todas as tabelas');
          report.recommendations.push('Verificar constraints de chave estrangeira');
          report.recommendations.push('Executar reparo: REPAIR TABLE pedidos, itensPedido');
        }
      });
    }

    console.log('');

    // ==================== FASE 4: CLEANUP ====================
    console.log('🧹 FASE 4: LIMPEZA');
    console.log('─────────────────────────────────────────────────────────────────');

    try {
      if (testDataSetup) {
        await cleanupTestData(TEST_TENANT_ID, testDataSetup);
      }
      console.log('✅ Dados de teste removidos');
    } catch (e: unknown) {
      console.warn('⚠️ Aviso ao limpar:', e instanceof Error ? e.message : String(e));
    }

    console.log('');

    // ==================== RELATÓRIO FINAL ====================
    const duration = Date.now() - startTime;
    report.duration = duration;

    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         📈 RELATÓRIO FINAL                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`📊 Resultados:`);
    console.log(`   ✅ PASSOU: ${report.summary.passed}/${report.summary.totalTests}`);
    console.log(`   ❌ FALHOU: ${report.summary.failed}/${report.summary.totalTests}`);
    console.log(`   ⏱️  Duração: ${duration}ms`);
    console.log('');

    if (report.fragilePoints.length > 0) {
      console.log('🚨 Pontos Frágeis Identificados:');
      report.fragilePoints.forEach((point, i) => {
        console.log(`   ${i + 1}. ${point}`);
      });
      console.log('');
    }

    if (report.recommendations.length > 0) {
      console.log('💡 Recomendações:');
      report.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
      console.log('');
    }

    // ==================== SALVAR RELATÓRIO ====================
    // Comentado para evitar arquivo gerado no working tree
    // const reportPath = path.join(process.cwd(), 'DATABASE_CONSISTENCY_REPORT.json');
    // fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    // console.log(`📁 Relatório salvo em: ${reportPath}`);
    console.log('');

    // ==================== STATUS FINAL ====================
    const success = report.summary.failed === 0;

    if (success) {
      console.log('╔════════════════════════════════════════════════════════════════════════════╗');
      console.log('║             ✅ BANCO DE DADOS ESTÁ SEGURO PARA PRODUÇÃO               ✅  ║');
      console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    } else {
      console.log('╔════════════════════════════════════════════════════════════════════════════╗');
      console.log('║        ❌ PROBLEMAS DE CONSISTÊNCIA DETECTADOS - INVESTIGAR           ❌   ║');
      console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    }
    console.log('');

    process.exit(success ? 0 : 1);
  } catch (error: unknown) {
    console.error('\n');
    console.error('╔════════════════════════════════════════════════════════════════════════════╗');
    console.error('║         💥 ERRO CRÍTICO NA EXECUÇÃO DOS TESTES                        💥   ║');
    console.error('╚════════════════════════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('Erro:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    console.error('');

    process.exit(1);
  }
}

// Executar
main();
