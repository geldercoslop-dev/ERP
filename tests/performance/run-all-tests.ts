#!/usr/bin/env tsx

import { performance } from 'perf_hooks';
import { runConcurrencyTest } from './concurrency-test';
import { runLoadTest } from './load-test';
import { runMonitoring } from './monitor';
import { runTracingTest } from './tracing-test';
import { runResilienceTest } from './resilience-test';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';

interface FullTestReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCores: number;
    totalMemory: string;
  };
  configuration: {
    baseUrl: string;
    tests: string[];
    timeouts: {
      concurrency: number;
      load: number;
      monitoring: number;
      tracing: number;
      resilience: number;
    };
  };
  results: {
    concurrency?: any;
    load?: any;
    monitoring?: any;
    tracing?: any;
    resilience?: any;
  };
  typescriptValidation: {
    success: boolean;
    errors?: string;
    output?: string;
  };
  overallSummary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    criticalIssues: string[];
    warnings: string[];
    systemGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    recommendations: string[];
  };
}

function getSystemInfo() {
  const os = require('os');
  return {
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpuCores: os.cpus().length,
    totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB`
  };
}

async function validateTypeScript(): Promise<{ success: boolean; errors?: string; output?: string }> {
  try {
    console.log('🔍 Validando TypeScript...');
    const output = execSync('pnpm exec tsc -p tsconfig.server.json --noEmit', { 
      encoding: 'utf8',
      cwd: process.cwd()
    });
    
    return {
      success: true,
      output: '✅ TypeScript validation passed'
    };
  } catch (error: any) {
    return {
      success: false,
      errors: error.stdout || error.message,
      output: error.stderr || 'TypeScript validation failed'
    };
  }
}

function calculateSystemGrade(results: FullTestReport['results'], tsValidation: any): 'A' | 'B' | 'C' | 'D' | 'F' {
  let score = 100;
  
  // Concurrency test penalties
  if (results.concurrency) {
    if (results.concurrency.summary.duplicatePedidos > 0) score -= 30;
    if (results.concurrency.summary.successRate < 95) score -= 20;
    if (results.concurrency.traceIdCollisions.length > 0) score -= 15;
  }
  
  // Load test penalties
  if (results.load) {
    const loadIssues = Object.values(results.load.results).filter((result: any) => {
      const summary = result.summary;
      return summary.successRate < 90 || summary.averageResponseTime > 5000;
    });
    score -= loadIssues.length * 10;
  }
  
  // Monitoring penalties
  if (results.monitoring) {
    if (results.monitoring.summary.cpu.average > 90) score -= 15;
    if (results.monitoring.summary.memory.memoryLeakDetected) score -= 25;
    if (results.monitoring.summary.network.errorRate > 10) score -= 20;
  }
  
  // Tracing penalties
  if (results.tracing) {
    if (results.tracing.issues.duplicateTraceIds.length > 0) score -= 25;
    if (results.tracing.summary.traceIdUniqueness < 95) score -= 20;
    if (results.tracing.summary.memoryLeakDetected) score -= 15;
  }
  
  // Resilience penalties
  if (results.resilience) {
    if (results.resilience.overallSummary.systemResilience < 70) score -= 25;
    if (results.resilience.overallSummary.overallSuccessRate < 75) score -= 20;
    if (results.resilience.overallSummary.criticalFailures > 1) score -= 15;
  }
  
  // TypeScript penalties
  if (!tsValidation.success) score -= 30;
  
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function generateRecommendations(results: FullTestReport['results'], tsValidation: any): string[] {
  const recommendations: string[] = [];
  
  // Concurrency recommendations
  if (results.concurrency) {
    if (results.concurrency.summary.duplicatePedidos > 0) {
      recommendations.push('Implementar idempotência mais robusta para evitar pedidos duplicados');
    }
    if (results.concurrency.summary.successRate < 95) {
      recommendations.push('Melhorar tratamento de concorrência e locking de recursos');
    }
  }
  
  // Load test recommendations
  if (results.load) {
    Object.entries(results.load.results).forEach(([level, result]: [string, any]) => {
      if (result.summary.successRate < 90) {
        recommendations.push(`Otimizar performance para carga de ${level} req/s`);
      }
      if (result.summary.averageResponseTime > 5000) {
        recommendations.push(`Reducir tempo de resposta para carga de ${level} req/s`);
      }
    });
  }
  
  // Monitoring recommendations
  if (results.monitoring) {
    if (results.monitoring.summary.cpu.average > 90) {
      recommendations.push('Otimizar uso de CPU - revisar algoritmos e queries');
    }
    if (results.monitoring.summary.memory.memoryLeakDetected) {
      recommendations.push('Investigar e corrigir memory leaks no sistema');
    }
  }
  
  // Tracing recommendations
  if (results.tracing) {
    if (results.tracing.issues.duplicateTraceIds.length > 0) {
      recommendations.push('Corrigir geração de trace IDs para garantir unicidade');
    }
    if (results.tracing.summary.spansCompletionRate < 90) {
      recommendations.push('Garantir que todos os spans sejam properly closed');
    }
  }
  
  // Resilience recommendations
  if (results.resilience) {
    if (results.resilience.overallSummary.systemResilience < 70) {
      recommendations.push('Implementar estratégias mais robustas de fallback e circuit breaker');
    }
    if (results.resilience.overallSummary.criticalFailures > 0) {
      recommendations.push('Revisar tratamento de falhas críticas do sistema');
    }
  }
  
  // TypeScript recommendations
  if (!tsValidation.success) {
    recommendations.push('Corrigir todos os erros de TypeScript antes de ir para produção');
  }
  
  return recommendations;
}

async function runFullTestSuite(): Promise<FullTestReport> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const startTime = performance.now();
  
  console.log('🚀 INICIANDO SUITE COMPLETA DE TESTES DE PRODUÇÃO');
  console.log('='.repeat(80));
  console.log(`📍 Target: ${baseUrl}`);
  console.log(`🖥️ Ambiente: ${getSystemInfo().platform} (${getSystemInfo().cpuCores} cores)`);
  console.log(`📦 Node.js: ${getSystemInfo().nodeVersion}`);
  
  const results: FullTestReport['results'] = {};
  const testOrder = [
    { name: 'concurrency', fn: runConcurrencyTest, timeout: 60000 },
    { name: 'load', fn: runLoadTest, timeout: 180000 },
    { name: 'monitoring', fn: runMonitoring, timeout: 90000 },
    { name: 'tracing', fn: runTracingTest, timeout: 90000 },
    { name: 'resilience', fn: runResilienceTest, timeout: 120000 }
  ];
  
  for (const test of testOrder) {
    console.log(`\n--- Executando ${test.name.toUpperCase()} test ---`);
    
    try {
      const testStartTime = performance.now();
      
      // Run test with timeout
      const testPromise = test.fn(baseUrl);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Test ${test.name} timed out`)), test.timeout)
      );
      
      const result = await Promise.race([testPromise, timeoutPromise]);
      results[test.name as keyof typeof results] = result;
      
      const testEndTime = performance.now();
      console.log(`✅ ${test.name} concluído em ${((testEndTime - testStartTime) / 1000).toFixed(2)}s`);
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`❌ ${test.name} falhou:`, error);
      results[test.name as keyof typeof results] = {
        error: error instanceof Error ? error.message : 'Unknown error',
        failed: true
      };
    }
  }
  
  // TypeScript validation
  console.log('\n--- Validando TypeScript ---');
  const tsValidation = await validateTypeScript();
  
  const endTime = performance.now();
  console.log(`\n⏱️ Suite completa concluída em ${((endTime - startTime) / 1000).toFixed(2)}s`);
  
  // Calculate overall summary
  const totalTests = Object.keys(results).length + 1; // +1 for TypeScript
  const passedTests = Object.values(results).filter(r => !r || !(r as any).failed).length + (tsValidation.success ? 1 : 0);
  const failedTests = totalTests - passedTests;
  
  // Collect critical issues
  const criticalIssues: string[] = [];
  
  if (results.concurrency?.summary?.duplicatePedidos > 0) {
    criticalIssues.push('Pedidos duplicados detectados em teste de concorrência');
  }
  
  if (results.monitoring?.summary?.memory?.memoryLeakDetected) {
    criticalIssues.push('Memory leak detectado no sistema');
  }
  
  if (results.tracing?.issues?.duplicateTraceIds?.length > 0) {
    criticalIssues.push('Trace IDs duplicados no sistema de tracing');
  }
  
  if (results.resilience?.overallSummary?.systemResilience < 70) {
    criticalIssues.push('Sistema com baixa resiliência a falhas');
  }
  
  if (!tsValidation.success) {
    criticalIssues.push('Erros de TypeScript detectados');
  }
  
  // Collect warnings
  const warnings: string[] = [];
  
  if (results.load) {
    Object.entries(results.load.results).forEach(([level, result]: [string, any]) => {
      if (result.summary.successRate < 95) {
        warnings.push(`Taxa de sucesso abaixo de 95% para carga de ${level} req/s`);
      }
    });
  }
  
  if (results.monitoring?.summary?.cpu?.average > 80) {
    warnings.push('Uso médio de CPU acima de 80%');
  }
  
  // Generate recommendations
  const recommendations = generateRecommendations(results, tsValidation);
  
  // Calculate system grade
  const systemGrade = calculateSystemGrade(results, tsValidation);
  
  return {
    timestamp: new Date().toISOString(),
    environment: getSystemInfo(),
    configuration: {
      baseUrl,
      tests: testOrder.map(t => t.name),
      timeouts: {
        concurrency: 60000,
        load: 180000,
        monitoring: 90000,
        tracing: 90000,
        resilience: 120000
      }
    },
    results,
    typescriptValidation: tsValidation,
    overallSummary: {
      totalTests,
      passedTests,
      failedTests,
      criticalIssues,
      warnings,
      systemGrade,
      recommendations
    }
  };
}

function printFullReport(report: FullTestReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 RELATÓRIO COMPLETO DE TESTES DE PRODUÇÃO');
  console.log('='.repeat(80));
  
  console.log(`\n📅 Data/Hora: ${report.timestamp}`);
  console.log(`🖥️ Ambiente: ${report.environment.platform} (${report.environment.cpuCores} cores)`);
  console.log(`📦 Node.js: ${report.environment.nodeVersion}`);
  console.log(`💾 Memória: ${report.environment.totalMemory}`);
  
  console.log('\n📊 RESUMO DOS TESTES:');
  console.log(`✅ Passaram: ${report.overallSummary.passedTests}/${report.overallSummary.totalTests}`);
  console.log(`❌ Falharam: ${report.overallSummary.failedTests}/${report.overallSummary.totalTests}`);
  console.log(`🏆 Nota do sistema: ${report.overallSummary.systemGrade}`);
  
  // Test results summary
  console.log('\n📋 DETALHES DOS TESTES:');
  
  if (report.results.concurrency) {
    const r = report.results.concurrency;
    if (!r.failed) {
      console.log(`🔄 Concorrência: ✅ ${r.summary.successRate.toFixed(2)}% sucesso | ${r.summary.duplicatePedidos} duplicados`);
    } else {
      console.log(`🔄 Concorrência: ❌ FALHOU`);
    }
  }
  
  if (report.results.load) {
    const loadResults = Object.entries(report.results.load.results);
    const avgSuccessRate = loadResults.reduce((sum, [_, result]: [string, any]) => 
      sum + result.summary.successRate, 0) / loadResults.length;
    console.log(`🔥 Carga: ✅ ${avgSuccessRate.toFixed(2)}% sucesso médio`);
  }
  
  if (report.results.monitoring) {
    const r = report.results.monitoring;
    if (!r.failed) {
      console.log(`📊 Monitoramento: ✅ CPU ${r.summary.cpu.average.toFixed(2)}% | Memory leak: ${r.summary.memory.memoryLeakDetected ? '❌' : '✅'}`);
    } else {
      console.log(`📊 Monitoramento: ❌ FALHOU`);
    }
  }
  
  if (report.results.tracing) {
    const r = report.results.tracing;
    if (!r.failed) {
      console.log(`🔍 Tracing: ✅ ${r.summary.traceIdUniqueness.toFixed(2)}% unicidade | ${r.issues.duplicateTraceIds.length} duplicados`);
    } else {
      console.log(`🔍 Tracing: ❌ FALHOU`);
    }
  }
  
  if (report.results.resilience) {
    const r = report.results.resilience;
    if (!r.failed) {
      console.log(`🛡️ Resiliência: ✅ ${r.overallSummary.systemResilience.toFixed(2)}/100 | ${r.overallSummary.criticalFailures} falhas críticas`);
    } else {
      console.log(`🛡️ Resiliência: ❌ FALHOU`);
    }
  }
  
  console.log(`🔍 TypeScript: ${report.typescriptValidation.success ? '✅ PASSOU' : '❌ FALHOU'}`);
  
  // Critical issues
  if (report.overallSummary.criticalIssues.length > 0) {
    console.log('\n🚨 ISSUES CRÍTICOS:');
    report.overallSummary.criticalIssues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }
  
  // Warnings
  if (report.overallSummary.warnings.length > 0) {
    console.log('\n⚠️ AVISOS:');
    report.overallSummary.warnings.forEach((warning, i) => {
      console.log(`   ${i + 1}. ${warning}`);
    });
  }
  
  // Recommendations
  if (report.overallSummary.recommendations.length > 0) {
    console.log('\n💡 RECOMENDAÇÕES:');
    report.overallSummary.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }
  
  // Final verdict
  console.log('\n🔥 VEREDITO FINAL:');
  if (report.overallSummary.systemGrade === 'A') {
    console.log('🏆 SISTEMA EXCELENTE: Pronto para produção!');
  } else if (report.overallSummary.systemGrade === 'B') {
    console.log('✅ SISTEMA BOM: Pequenos ajustes recomendados antes de produção');
  } else if (report.overallSummary.systemGrade === 'C') {
    console.log('⚠️ SISTEMA REGULAR: Requer melhorias significativas');
  } else if (report.overallSummary.systemGrade === 'D') {
    console.log('❌ SISTEMA FRACO: Não recomendado para produção');
  } else {
    console.log('🚫 SISTEMA CRÍTICO: Falhas graves encontradas, não ir para produção!');
  }
  
  if (report.overallSummary.criticalIssues.length > 0) {
    console.log('\n❌ BLOQUEADOR: Issues críticas devem ser resolvidas antes do deploy!');
  }
}

async function main(): Promise<void> {
  try {
    const report = await runFullTestSuite();
    printFullReport(report);
    
    // Save comprehensive report
    await fs.writeFile(
      `./full-production-test-report-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n💾 Relatório completo salvo em: full-production-test-report-${Date.now()}.json`);
    
    // Exit with appropriate code
    if (report.overallSummary.criticalIssues.length > 0 || report.overallSummary.systemGrade <= 'C') {
      console.log('\n❌ TESTES FALHARAM: Verificar issues críticas antes de prosseguir!');
      process.exit(1);
    } else {
      console.log('\n✅ TESTES CONCLUÍDOS: Sistema pronto para produção!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Erro ao executar suite de testes:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { runFullTestSuite, FullTestReport };
