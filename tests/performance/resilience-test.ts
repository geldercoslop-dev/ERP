import { performance } from 'perf_hooks';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ResilienceWorkerData {
  baseUrl: string;
  testType: 'db_failure' | 'timeout' | 'leo_error' | 'circuit_breaker';
  workerId: number;
  requestsPerWorker: number;
  timeout: number;
}

interface ResilienceTestMetric {
  timestamp: number;
  workerId: number;
  requestId: string;
  testType: string;
  success: boolean;
  responseTime: number;
  status?: number;
  error?: string;
  errorType?: string;
  fallbackActivated?: boolean;
  circuitBreakerOpen?: boolean;
  retryCount?: number;
  cacheHit?: boolean;
  degradedMode?: boolean;
}

interface ResilienceTestReport {
  timestamp: string;
  config: {
    baseUrl: string;
    testTypes: string[];
    totalRequests: number;
    workers: number;
    timeout: number;
  };
  results: {
    [testType: string]: {
      metrics: ResilienceTestMetric[];
      summary: {
        totalRequests: number;
        successfulRequests: number;
        failedRequests: number;
        averageResponseTime: number;
        maxResponseTime: number;
        successRate: number;
        errorRate: number;
        fallbackRate: number;
        circuitBreakerActivations: number;
        retryRate: number;
        cacheHitRate: number;
        degradedModeRate: number;
      };
      errors: Array<{ error: string; count: number; type: string }>;
    };
  };
  overallSummary: {
    systemResilience: number;
    overallSuccessRate: number;
    criticalFailures: number;
    recommendations: string[];
  };
}

// Payload base para pedido
const basePedido = {
  tenantId: Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99),
  vendedorId: 1,
  clienteId: 1,
  cliente: {
    nome: 'Cliente Teste Resiliência',
    telefone: '11999999999',
    rua: 'Rua Teste',
    numero: '123',
    bairro: 'Bairro Teste',
    cidade: 'São Paulo',
    uf: 'SP'
  },
  subtotal: '100.00',
  desconto: '0.00',
  frete: '10.00',
  total: '110.00',
  formaPagamento: 'DINHEIRO',
  observacoes: 'Teste de resiliência',
  itens: [
    {
      tipo: 'CATALOGO',
      produtoId: 1,
      descricao: 'Produto Teste Resiliência',
      quantidade: 1,
      valorUnitario: '100.00',
      custo: '50.00'
    }
  ]
};

function generateVariation(base: any, index: number): any {
  return {
    ...base,
    cliente: {
      ...base.cliente,
      nome: `${base.cliente.nome} ${index}`
    },
    observacoes: `${base.observacoes} - Test ${index}`,
    itens: base.itens.map((item: any) => ({
      ...item,
      valorUnitario: (100 + Math.random() * 20).toFixed(2)
    }))
  };
}

async function simulateDbFailure(baseUrl: string): Promise<void> {
  try {
    // Tenta desativar a conexão DB via endpoint administrativo
    await axios.post(`${baseUrl}/api/admin/simulate-db-failure`, {
      duration: 30000, // 30 segundos de falha
      type: 'connection_timeout'
    }, { timeout: 5000 });
  } catch (error) {
    // Endpoint pode não existir, tentar método alternativo
    console.log('⚠️ Endpoint de simulação de DB não encontrado, tentando método alternativo...');
  }
}

async function simulateTimeout(baseUrl: string): Promise<void> {
  try {
    // Simula timeout em serviços dependentes
    await axios.post(`${baseUrl}/api/admin/simulate-timeout`, {
      services: ['database', 'external_api'],
      duration: 15000 // 15 segundos
    }, { timeout: 5000 });
  } catch (error) {
    console.log('⚠️ Endpoint de simulação de timeout não encontrado...');
  }
}

async function simulateLeoError(baseUrl: string): Promise<void> {
  try {
    // Simula erro no serviço LEO AI
    await axios.post(`${baseUrl}/api/admin/simulate-leo-error`, {
      type: 'service_unavailable',
      duration: 20000 // 20 segundos
    }, { timeout: 5000 });
  } catch (error) {
    console.log('⚠️ Endpoint de simulação de erro LEO não encontrado...');
  }
}

async function triggerCircuitBreaker(baseUrl: string): Promise<void> {
  try {
    // Envia múltiplas requests falhas para ativar circuit breaker
    const promises = Array.from({ length: 10 }, () =>
      axios.post(`${baseUrl}/api/trpc/pedidos.createPedidoSafe`, {
        input: {
          0: {
            json: {
              ...basePedido,
              tenantId: 999 // ID inválido para forçar erro
            }
          }
        }
      }, { timeout: 1000 })
    );
    
    await Promise.allSettled(promises);
  } catch (error) {
    // Erros esperados para ativar circuit breaker
  }
}

async function makeResilienceRequest(
  workerId: number, 
  requestId: string, 
  testType: string, 
  baseUrl: string, 
  timeout: number
): Promise<ResilienceTestMetric> {
  const startTime = performance.now();
  const payload = generateVariation(basePedido, parseInt(requestId));
  
  // Adiciona headers específicos para testar resiliência
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    'X-Worker-Id': workerId.toString(),
    'X-Test-Type': testType,
    'X-Force-Error': testType === 'leo_error' ? 'true' : 'false',
    'X-Timeout-Test': testType === 'timeout' ? 'true' : 'false'
  };
  
  try {
    const response = await axios.post(
      `${baseUrl}/api/trpc/pedidos.createPedidoSafe`,
      {
        input: {
          0: {
            json: payload
          }
        }
      },
      {
        headers,
        timeout,
        validateStatus: () => true // Aceita qualquer status
      }
    );

    const endTime = performance.now();
    const responseTime = endTime - startTime;

    // Analisa headers de resiliência na resposta
    const fallbackActivated = response.headers['x-fallback-activated'] === 'true';
    const circuitBreakerOpen = response.headers['x-circuit-breaker-open'] === 'true';
    const retryCount = parseInt(response.headers['x-retry-count'] || '0');
    const cacheHit = response.headers['x-cache-hit'] === 'true';
    const degradedMode = response.headers['x-degraded-mode'] === 'true';

    // Classifica tipo de erro
    let errorType: string | undefined;
    if (!response.data?.result?.data?.json) {
      if (response.status === 503) errorType = 'service_unavailable';
      else if (response.status === 504) errorType = 'gateway_timeout';
      else if (response.status === 500) errorType = 'internal_error';
      else if (response.status === 429) errorType = 'rate_limit';
      else errorType = 'unknown_error';
    }

    return {
      timestamp: Date.now(),
      workerId,
      requestId,
      testType,
      success: response.status >= 200 && response.status < 300 && !!response.data?.result?.data?.json,
      responseTime,
      status: response.status,
      error: response.data?.result?.data?.json ? undefined : `HTTP ${response.status}`,
      errorType,
      fallbackActivated,
      circuitBreakerOpen,
      retryCount,
      cacheHit,
      degradedMode
    };

  } catch (error) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;

    let errorType = 'network_error';
    let errorMessage = 'Unknown error';
    
    if (error instanceof AxiosError) {
      errorMessage = error.message;
      if (error.code === 'ECONNABORTED') errorType = 'timeout';
      else if (error.code === 'ECONNREFUSED') errorType = 'connection_refused';
      else if (error.code === 'ENOTFOUND') errorType = 'dns_error';
      else if (error.response) {
        if (error.response.status === 503) errorType = 'service_unavailable';
        else if (error.response.status === 504) errorType = 'gateway_timeout';
        else if (error.response.status === 500) errorType = 'internal_error';
      }
    }

    return {
      timestamp: Date.now(),
      workerId,
      requestId,
      testType,
      success: false,
      responseTime,
      error: errorMessage,
      errorType,
      fallbackActivated: false,
      circuitBreakerOpen: false,
      retryCount: 0,
      cacheHit: false,
      degradedMode: false
    };
  }
}

// Worker function
async function workerFunction(data: ResilienceWorkerData): Promise<ResilienceTestMetric[]> {
  const { baseUrl, testType, workerId, requestsPerWorker, timeout } = data;
  const metrics: ResilienceTestMetric[] = [];
  
  // Espera um pouco antes de começar (para simulação)
  await new Promise(resolve => setTimeout(resolve, workerId * 100));
  
  for (let i = 0; i < requestsPerWorker; i++) {
    const requestId = `${testType}-${workerId}-${i}`;
    const metric = await makeResilienceRequest(workerId, requestId, testType, baseUrl, timeout);
    metrics.push(metric);
    
    // Pequena pausa entre requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return metrics;
}

async function runResilienceTest(baseUrl: string, requestsPerTest: number = 50): Promise<ResilienceTestReport> {
  console.log('🛡️ INICIANDO TESTE DE RESILIÊNCIA');
  console.log(`📍 Target: ${baseUrl}`);
  console.log(`📊 Requests por teste: ${requestsPerTest}`);
  
  const testTypes: Array<'db_failure' | 'timeout' | 'leo_error' | 'circuit_breaker'> = [
    'db_failure', 'timeout', 'leo_error', 'circuit_breaker'
  ];
  
  const results: ResilienceTestReport['results'] = {};
  
  for (const testType of testTypes) {
    console.log(`\n--- Testando ${testType} ---`);
    
    // Simula a condição de falha
    switch (testType) {
      case 'db_failure':
        await simulateDbFailure(baseUrl);
        break;
      case 'timeout':
        await simulateTimeout(baseUrl);
        break;
      case 'leo_error':
        await simulateLeoError(baseUrl);
        break;
      case 'circuit_breaker':
        await triggerCircuitBreaker(baseUrl);
        break;
    }
    
    // Espera um pouco para a simulação tomar efeito
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Executa o teste
    const numWorkers = 3;
    const requestsPerWorker = Math.ceil(requestsPerTest / numWorkers);
    const timeout = 20000;
    
    const workers: Promise<ResilienceTestMetric[]>[] = [];
    
    for (let i = 0; i < numWorkers; i++) {
      const workerPromise = new Promise<ResilienceTestMetric[]>((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: {
            baseUrl,
            testType,
            workerId: i,
            requestsPerWorker,
            timeout
          } as ResilienceWorkerData
        });

        worker.on('message', (metrics: ResilienceTestMetric[]) => {
          resolve(metrics);
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      });

      workers.push(workerPromise);
    }

    const workerResults = await Promise.all(workers);
    const allMetrics = workerResults.flat();
    
    // Análise dos resultados
    const successfulRequests = allMetrics.filter(m => m.success).length;
    const responseTimes = allMetrics.map(m => m.responseTime);
    
    // Agrupa erros
    const errorCounts = new Map<string, { count: number; type: string }>();
    allMetrics.forEach(m => {
      if (!m.success && m.error) {
        const key = m.error || 'unknown';
        const existing = errorCounts.get(key) || { count: 0, type: m.errorType || 'unknown' };
        existing.count++;
        errorCounts.set(key, existing);
      }
    });

    // Calcula métricas de resiliência
    const fallbackRate = (allMetrics.filter(m => m.fallbackActivated).length / allMetrics.length) * 100;
    const circuitBreakerActivations = allMetrics.filter(m => m.circuitBreakerOpen).length;
    const retryCount = allMetrics.reduce((sum, m) => sum + (m.retryCount || 0), 0);
    const retryRate = (retryCount / allMetrics.length) * 100;
    const cacheHitRate = (allMetrics.filter(m => m.cacheHit).length / allMetrics.length) * 100;
    const degradedModeRate = (allMetrics.filter(m => m.degradedMode).length / allMetrics.length) * 100;

    results[testType] = {
      metrics: allMetrics,
      summary: {
        totalRequests: allMetrics.length,
        successfulRequests,
        failedRequests: allMetrics.length - successfulRequests,
        averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
        maxResponseTime: Math.max(...responseTimes),
        successRate: (successfulRequests / allMetrics.length) * 100,
        errorRate: ((allMetrics.length - successfulRequests) / allMetrics.length) * 100,
        fallbackRate,
        circuitBreakerActivations,
        retryRate,
        cacheHitRate,
        degradedModeRate
      },
      errors: Array.from(errorCounts.entries()).map(([error, data]) => ({ 
        error, 
        count: data.count, 
        type: data.type 
      }))
    };

    console.log(`✅ ${testType} concluído`);
    console.log(`   📊 Taxa de sucesso: ${results[testType].summary.successRate.toFixed(2)}%`);
    console.log(`   🛡️ Fallback ativado: ${results[testType].summary.fallbackRate.toFixed(2)}%`);
    console.log(`   ⚡ Circuit breaker: ${results[testType].summary.circuitBreakerActivations} ativações`);
    
    // Espera antes do próximo teste
    if (testType !== testTypes[testTypes.length - 1]) {
      console.log('⏸️ Esperando 15 segundos antes do próximo teste...');
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }

  // Cálculo do resumo geral
  const allTestResults = Object.values(results);
  const totalRequestsAll = allTestResults.reduce((sum, r) => sum + r.summary.totalRequests, 0);
  const totalSuccessfulAll = allTestResults.reduce((sum, r) => sum + r.summary.successfulRequests, 0);
  const overallSuccessRate = (totalSuccessfulAll / totalRequestsAll) * 100;
  
  // Calcula índice de resiliência (considerando fallback, circuit breaker, etc.)
  const avgFallbackRate = allTestResults.reduce((sum, r) => sum + r.summary.fallbackRate, 0) / allTestResults.length;
  const avgCircuitBreakerActivations = allTestResults.reduce((sum, r) => sum + r.summary.circuitBreakerActivations, 0) / allTestResults.length;
  const systemResilience = Math.min(100, overallSuccessRate + avgFallbackRate * 0.5 + avgCircuitBreakerActivations * 2);
  
  const criticalFailures = allTestResults.filter(r => r.summary.successRate < 50).length;
  
  const recommendations: string[] = [];
  if (overallSuccessRate < 80) recommendations.push('Implementar melhor tratamento de erros globais');
  if (avgFallbackRate < 20) recommendations.push('Aumentar uso de fallbacks para serviços críticos');
  if (avgCircuitBreakerActivations < 1) recommendations.push('Implementar circuit breaker para evitar cascata de falhas');
  if (criticalFailures > 0) recommendations.push('Revisar estratégias de recuperação para falhas críticas');

  return {
    timestamp: new Date().toISOString(),
    config: {
      baseUrl,
      testTypes,
      totalRequests: totalRequestsAll,
      workers: 3,
      timeout: 20000
    },
    results,
    overallSummary: {
      systemResilience,
      overallSuccessRate,
      criticalFailures,
      recommendations
    }
  };
}

function printReport(report: ResilienceTestReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('🛡️ RELATÓRIO DE TESTE DE RESILIÊNCIA');
  console.log('='.repeat(80));
  
  console.log(`\n📅 Data/Hora: ${report.timestamp}`);
  console.log(`📊 Total requests: ${report.config.totalRequests}`);
  
  for (const [testType, data] of Object.entries(report.results)) {
    const summary = data.summary;
    
    console.log(`\n🔥 TESTE ${testType.toUpperCase()}:`);
    console.log(`   📊 Sucesso: ${summary.successfulRequests}/${summary.totalRequests} (${summary.successRate.toFixed(2)}%)`);
    console.log(`   ⏱️ Tempo médio: ${summary.averageResponseTime.toFixed(2)}ms`);
    console.log(`   🛡️ Fallback: ${summary.fallbackRate.toFixed(2)}%`);
    console.log(`   ⚡ Circuit breaker: ${summary.circuitBreakerActivations} ativações`);
    console.log(`   🔄 Retry rate: ${summary.retryRate.toFixed(2)}%`);
    console.log(`   💾 Cache hit: ${summary.cacheHitRate.toFixed(2)}%`);
    console.log(`   ⚠️ Degraded mode: ${summary.degradedModeRate.toFixed(2)}%`);
    
    if (data.errors.length > 0) {
      console.log('   🚨 Erros principais:');
      data.errors.slice(0, 3).forEach(({ error, count, type }) => {
        console.log(`     ${type}: ${count} ocorrências`);
      });
    }
  }
  
  console.log('\n📈 RESUMO GERAL:');
  console.log(`🛡️ Índice de resiliência: ${report.overallSummary.systemResilience.toFixed(2)}/100`);
  console.log(`📊 Taxa de sucesso geral: ${report.overallSummary.overallSuccessRate.toFixed(2)}%`);
  console.log(`🚨 Falhas críticas: ${report.overallSummary.criticalFailures}`);
  
  if (report.overallSummary.recommendations.length > 0) {
    console.log('\n💡 RECOMENDAÇÕES:');
    report.overallSummary.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }
  
  // Verificações críticas
  console.log('\n🔥 VERIFICAÇÃO CRÍTICA:');
  
  if (report.overallSummary.systemResilience < 70) {
    console.log('❌ FALHA CRÍTICA: Sistema com baixa resiliência!');
  }
  
  if (report.overallSummary.overallSuccessRate < 75) {
    console.log('❌ FALHA: Taxa de sucesso geral abaixo de 75%!');
  }
  
  if (report.overallSummary.criticalFailures > 1) {
    console.log('❌ FALHA: Múltiplos testes com taxa de sucesso crítica!');
  }
  
  // Verifica resiliência específica por tipo de falha
  const dbFailureResult = report.results.db_failure;
  if (dbFailureResult && dbFailureResult.summary.successRate < 60) {
    console.log('❌ FALHA: Sistema não resiste bem a falhas de DB!');
  }
  
  const timeoutResult = report.results.timeout;
  if (timeoutResult && timeoutResult.summary.successRate < 70) {
    console.log('❌ FALHA: Sistema não gerencia bem timeouts!');
  }
  
  if (report.overallSummary.systemResilience >= 80 && report.overallSummary.overallSuccessRate >= 80) {
    console.log('✅ SISTEMA RESILIENTE: Teste passou com sucesso!');
  } else {
    console.log('❌ SISTEMA VULNERÁVEL: Precisa melhorias de resiliência!');
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const requestsPerTest = parseInt(process.env.RESILIENCE_REQUESTS || '50');
  
  try {
    const report = await runResilienceTest(baseUrl, requestsPerTest);
    printReport(report);
    
    // Salva relatório
    await fs.writeFile(
      `./resilience-test-report-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n💾 Relatório salvo em: resilience-test-report-${Date.now()}.json`);
    
  } catch (error) {
    console.error('❌ Erro ao executar teste:', error);
    process.exit(1);
  }
}

// Executa como worker se receber dados
if (!isMainThread && workerData) {
  workerFunction(workerData as ResilienceWorkerData)
    .then(metrics => {
      if (parentPort) {
        parentPort.postMessage(metrics);
      }
    })
    .catch(error => {
      console.error('Worker error:', error);
      process.exit(1);
    });
}

// Executa como main se chamado diretamente
if (isMainThread && require.main === module) {
  main().catch(console.error);
}

export { runResilienceTest, ResilienceTestReport };
