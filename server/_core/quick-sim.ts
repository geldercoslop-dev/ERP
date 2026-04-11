import { performance } from 'perf_hooks';

console.log('=== INICIANDO SIMULAÇÃO DE PERFORMANCE ===');
console.log('Cenário: 100 tenants, 1000 requests por tenant');
console.log('Total: 100.000 requests\n');

const startTime = performance.now();
const memoryBefore = process.memoryUsage();

// Simular workload
const tenants = Array.from({ length: 100 }, (_, i) => i + 1);
const requestsPerTenant = 1000;

console.log('Executando simulação...');

const tenantPromises = tenants.map(async (tenantId) => {
  const tenantStartTime = performance.now();
  let errors = 0;

  // Simular requests para este tenant
  for (let i = 0; i < requestsPerTenant; i++) {
    try {
      // Simular latência de processamento
      const latency = Math.random() * 50 + 10; // 10-60ms
      await new Promise(resolve => setTimeout(resolve, latency));
      
      // Simular workload adicional
      const workload = Math.random() * 30 + 5; // 5-35ms
      await new Promise(resolve => setTimeout(resolve, workload));
      
    } catch (error) {
      errors++;
    }
  }

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

// Calcular métricas
const totalDuration = endTime - startTime;
const totalRequests = tenants.length * requestsPerTenant;
const totalErrors = results.reduce((sum, m) => sum + m.errors, 0);
const overallAvgLatency = results.reduce((sum, m) => sum + m.avgLatency, 0) / results.length;
const memoryLeaked = memoryAfter.heapUsed - memoryBefore.heapUsed;
const throughput = totalRequests / (totalDuration / 1000);

console.log('\n=== RESULTADOS DA SIMULAÇÃO ===');
console.log(`Duração total: ${totalDuration.toFixed(2)}ms`);
console.log(`Requests/s: ${throughput.toFixed(2)}`);
console.log(`Latência média: ${overallAvgLatency.toFixed(2)}ms`);
console.log(`Taxa de erro: ${((totalErrors / totalRequests) * 100).toFixed(2)}%`);

console.log('\n=== MEMÓRIA ===');
console.log(`Antes: ${(memoryBefore.heapUsed / 1024 / 1024).toFixed(2)} MB`);
console.log(`Depois: ${(memoryAfter.heapUsed / 1024 / 1024).toFixed(2)} MB`);
console.log(`Vazamento: ${(memoryLeaked / 1024 / 1024).toFixed(2)} MB`);

console.log('\n=== VALIDAÇÃO DE PERFORMANCE ===');

// Validação de vazamento de memória
const memoryLeakMB = memoryLeaked / 1024 / 1024;
if (memoryLeakMB > 100) {
  console.log(`[ALERTA] Vazamento de memória detectado: ${memoryLeakMB.toFixed(2)} MB`);
} else if (memoryLeakMB > 50) {
  console.log(`[AVISO] Possível vazamento: ${memoryLeakMB.toFixed(2)} MB`);
} else {
  console.log(`[OK] Vazamento de memória aceitável: ${memoryLeakMB.toFixed(2)} MB`);
}

// Validação de latência
if (overallAvgLatency > 1000) {
  console.log(`[CRÍTICO] Latência muito alta: ${overallAvgLatency.toFixed(2)}ms`);
} else if (overallAvgLatency > 500) {
  console.log(`[ALERTA] Latência elevada: ${overallAvgLatency.toFixed(2)}ms`);
} else {
  console.log(`[OK] Latência aceitável: ${overallAvgLatency.toFixed(2)}ms`);
}

// Validação de taxa de erro
const errorRate = (totalErrors / totalRequests) * 100;
if (errorRate > 5) {
  console.log(`[CRÍTICO] Taxa de erro muito alta: ${errorRate.toFixed(2)}%`);
} else if (errorRate > 1) {
  console.log(`[ALERTA] Taxa de erro elevada: ${errorRate.toFixed(2)}%`);
} else {
  console.log(`[OK] Taxa de erro aceitável: ${errorRate.toFixed(2)}%`);
}

// Validação de throughput
if (throughput < 100) {
  console.log(`[ALERTA] Throughput baixo: ${throughput.toFixed(2)} req/s`);
} else {
  console.log(`[OK] Throughput aceitável: ${throughput.toFixed(2)} req/s`);
}

console.log('\n=== TOP 10 TENANTS (MAIOR LATÊNCIA) ===');
const sortedByLatency = results
  .sort((a, b) => b.avgLatency - a.avgLatency)
  .slice(0, 10);

sortedByLatency.forEach((metrics, index) => {
  console.log(`${index + 1}. Tenant ${metrics.tenantId}: ${metrics.avgLatency.toFixed(2)}ms (${metrics.errors} erros)`);
});

console.log('\n=== SIMULAÇÃO CONCLUÍDA ===');
