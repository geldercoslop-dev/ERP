import { PerformanceSimulator } from './server/_core/performance-simulator.js';

async function runTest(): Promise<void> {
  console.log('=== INICIANDO VALIDAÇÃO DE CACHE + QUEUE SOB CARGA ===');
  
  const simulator = new PerformanceSimulator(100);
  
  try {
    // Simulação principal: 100 tenants x 1000 requests
    console.log('\n1. EXECUTANDO SIMULAÇÃO PRINCIPAL...');
    const result = await simulator.simulateLoad(1000);
    
    console.log('\n=== ANÁLISE DE RESULTADOS ===');
    console.log(`Total Requests: ${result.totalRequests}`);
    console.log(`Taxa de Erro: ${result.errorRate.toFixed(2)}%`);
    console.log(`Latência Média: ${result.overallAvgLatency.toFixed(2)}ms`);
    console.log(`Throughput: ${(result.totalRequests / (result.totalDuration / 1000)).toFixed(2)} req/s`);
    console.log(`Vazamento Memória: ${(result.memoryLeaked / 1024 / 1024).toFixed(2)} MB`);
    
    // Validar critérios
    const criteria = {
      zeroErrors: result.errorRate === 0,
      stableLatency: result.overallAvgLatency < 500,
      acceptableMemory: result.memoryLeaked < 100 * 1024 * 1024, // < 100MB
      goodThroughput: (result.totalRequests / (result.totalDuration / 1000)) > 100
    };
    
    console.log('\n=== VALIDAÇÃO DE CRITÉRIOS ===');
    console.log(`Zero Erros: ${criteria.zeroErrors ? 'PASS' : 'FAIL'}`);
    console.log(`Latência Estável: ${criteria.stableLatency ? 'PASS' : 'FAIL'}`);
    console.log(`Memória Aceitável: ${criteria.acceptableMemory ? 'PASS' : 'FAIL'}`);
    console.log(`Throughput Bom: ${criteria.goodThroughput ? 'PASS' : 'FAIL'}`);
    
    const allPassed = Object.values(criteria).every(Boolean);
    console.log(`\n=== RESULTADO FINAL: ${allPassed ? 'PASS' : 'FAIL'} ===`);
    
  } catch (error) {
    console.error('ERRO NA SIMULAÇÃO:', error);
  }
}

runTest().catch(console.error);
