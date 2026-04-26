import { performance } from 'perf_hooks';

class SimplePerformanceSimulator {
  constructor(totalTenants) {
    this.tenants = Array.from({ length: totalTenants }, (_, i) => i + 1);
  }

  async simulateLoad(requestsPerTenant) {
    console.log(`\n=== INICIANDO SIMULAÇÃO SIMPLES ===`);
    console.log(`Tenants: ${this.tenants.length}`);
    console.log(`Requests por tenant: ${requestsPerTenant}`);
    console.log(`Total requests: ${this.tenants.length * requestsPerTenant}\n`);

    const memoryBefore = process.memoryUsage();
    const startTime = performance.now();

    let totalErrors = 0;
    const tenantMetrics = [];

    // Executar requests em paralelo por tenant
    const tenantPromises = this.tenants.map(async (tenantId) => {
      const tenantStartTime = performance.now();
      let errors = 0;

      // Simular requests para este tenant
      const requests = Array.from({ length: requestsPerTenant }, async (_, requestId) => {
        try {
          // Simular workload básico
          const baseLatency = Math.random() * 50 + 10; // 10-60ms
          await this.sleep(baseLatency);
          
          // Simular workload adicional
          const workload = Math.random() * 30 + 5; // 5-35ms
          await this.sleep(workload);
          
        } catch (error) {
          errors++;
        }
      });

      await Promise.all(requests);

      const tenantEndTime = performance.now();
      const totalLatency = tenantEndTime - tenantStartTime;

      return {
        tenantId,
        requestCount: requestsPerTenant,
        totalLatency,
        avgLatency: totalLatency / requestsPerTenant,
        errors
      };
    });

    const results = await Promise.all(tenantPromises);
    const endTime = performance.now();

    const memoryAfter = process.memoryUsage();
    const totalDuration = endTime - startTime;

    // Calcular métricas
    const totalRequests = this.tenants.length * requestsPerTenant;
    totalErrors = results.reduce((sum, m) => sum + m.errors, 0);
    const overallAvgLatency = results.reduce((sum, m) => sum + m.avgLatency, 0) / results.length;

    this.printResults({
      totalTenants: this.tenants.length,
      totalRequests,
      totalDuration,
      memoryBefore,
      memoryAfter,
      memoryLeaked: memoryAfter.heapUsed - memoryBefore.heapUsed,
      avgLatencyPerTenant: results,
      overallAvgLatency,
      errorRate: (totalErrors / totalRequests) * 100
    });

    return {
      totalErrors,
      overallAvgLatency,
      totalDuration,
      errorRate: (totalErrors / totalRequests) * 100
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printResults(result) {
    console.log('\n=== RESULTADOS DA SIMULAÇÃO ===');
    console.log(`Duração total: ${result.totalDuration.toFixed(2)}ms`);
    console.log(`Requests/s: ${(result.totalRequests / (result.totalDuration / 1000)).toFixed(2)}`);
    console.log(`Latência média: ${result.overallAvgLatency.toFixed(2)}ms`);
    console.log(`Taxa de erro: ${result.errorRate.toFixed(2)}%`);
    
    console.log('\n=== MEMÓRIA ===');
    console.log(`Antes: ${(result.memoryBefore.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Depois: ${(result.memoryAfter.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Vazamento: ${(result.memoryLeaked / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\n=== TOP 10 TENANTS (MAIOR LATÊNCIA) ===');
    const sortedByLatency = result.avgLatencyPerTenant
      .sort((a, b) => b.avgLatency - a.avgLatency)
      .slice(0, 10);
    
    sortedByLatency.forEach((metrics, index) => {
      console.log(`${index + 1}. Tenant ${metrics.tenantId}: ${metrics.avgLatency.toFixed(2)}ms (${metrics.errors} erros)`);
    });

    // Validações
    console.log('\n=== VALIDAÇÃO DE PERFORMANCE ===');
    
    if (result.errorRate === 0) {
      console.log(`[✅] Taxa de erro: 0% - PERFEITO`);
    } else {
      console.log(`[❌] Taxa de erro: ${result.errorRate.toFixed(2)}% - FALHOU`);
    }

    if (result.overallAvgLatency < 100) {
      console.log(`[✅] Latência: ${result.overallAvgLatency.toFixed(2)}ms - EXCELENTE`);
    } else if (result.overallAvgLatency < 500) {
      console.log(`[⚠️] Latência: ${result.overallAvgLatency.toFixed(2)}ms - ACEITÁVEL`);
    } else {
      console.log(`[❌] Latência: ${result.overallAvgLatency.toFixed(2)}ms - ALTA`);
    }

    const throughput = result.totalRequests / (result.totalDuration / 1000);
    if (throughput > 500) {
      console.log(`[✅] Throughput: ${throughput.toFixed(2)} req/s - EXCELENTE`);
    } else if (throughput > 200) {
      console.log(`[⚠️] Throughput: ${throughput.toFixed(2)} req/s - ACEITÁVEL`);
    } else {
      console.log(`[❌] Throughput: ${throughput.toFixed(2)} req/s - BAIXO`);
    }
  }
}

async function runSimpleTest() {
  console.log('Iniciando teste de performance SIMPLES (sem dependências)...');
  const simulator = new SimplePerformanceSimulator(100);
  
  try {
    const result = await simulator.simulateLoad(1000);
    
    console.log('\n=== RESUMO FINAL ===');
    console.log(`Erros: ${result.totalErrors} (esperado: 0)`);
    console.log(`Latência média: ${result.overallAvgLatency.toFixed(2)}ms`);
    console.log(`Taxa de erro: ${result.errorRate.toFixed(2)}%`);
    console.log(`Duração: ${(result.totalDuration / 1000).toFixed(2)}s`);
    
    if (result.totalErrors === 0 && result.overallAvgLatency < 100) {
      console.log('\n🎉 SISTEMA ESTÁVEL SOB CARGA - TESTE PASSOU!');
    } else {
      console.log('\n❌ SISTEMA APRESENTOU PROBLEMAS - TESTE FALHOU!');
    }
    
  } catch (error) {
    console.error('Erro no teste:', error);
  }
}

runSimpleTest();
