import { performance } from 'perf_hooks';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

interface TracingWorkerData {
  baseUrl: string;
  requestsPerWorker: number;
  workerId: number;
  timeout: number;
}

interface TracingTestMetric {
  timestamp: number;
  workerId: number;
  requestId: string;
  success: boolean;
  responseTime: number;
  status?: number;
  error?: string;
  traceId?: string;
  spanId?: string;
  parentTraceId?: string;
  hasTraceHeader: boolean;
  traceHeaderValid: boolean;
  spansCompleted: number;
  spansLeaked: number;
  memoryUsage: NodeJS.MemoryUsage;
}

interface TracingTestReport {
  timestamp: string;
  config: {
    baseUrl: string;
    totalRequests: number;
    workers: number;
    timeout: number;
  };
  metrics: TracingTestMetric[];
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    traceIdUniqueness: number;
    traceHeaderRate: number;
    spansCompletionRate: number;
    memoryLeakDetected: boolean;
    memoryGrowthRate: number;
  };
  issues: {
    duplicateTraceIds: Array<{ traceId: string; count: number; requestIds: string[] }>;
    missingTraceHeaders: number;
    invalidTraceHeaders: number;
    leakedSpans: number;
    memoryLeaks: boolean;
  };
}

// Payload base para pedido
const basePedido = {
  tenantId: Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99),
  vendedorId: 1,
  clienteId: 1,
  cliente: {
    nome: 'Cliente Teste Tracing',
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
  observacoes: 'Teste de tracing',
  itens: [
    {
      tipo: 'CATALOGO',
      produtoId: 1,
      descricao: 'Produto Teste Tracing',
      quantidade: 1,
      valorUnitario: '100.00',
      custo: '50.00'
    }
  ]
};

function generateTraceId(): string {
  return randomUUID().replace(/-/g, '');
}

function generateVariation(base: any, index: number): any {
  return {
    ...base,
    cliente: {
      ...base.cliente,
      nome: `${base.cliente.nome} Tracing ${index}`
    },
    observacoes: `${base.observacoes} - Request ${index}`,
    itens: base.itens.map((item: any) => ({
      ...item,
      valorUnitario: (100 + Math.random() * 20).toFixed(2)
    }))
  };
}

function validateTraceFormat(traceId: string): boolean {
  // Verifica se traceId segue formato esperado (32 chars hex ou UUID format)
  return /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(traceId);
}

async function checkTracingEndpoint(baseUrl: string): Promise<{
  activeSpans: number;
  completedSpans: number;
  memoryUsage: number;
}> {
  try {
    const response = await axios.get(`${baseUrl}/api/tracing/stats`, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    if (response.status === 200 && response.data) {
      return {
        activeSpans: response.data.activeSpans || 0,
        completedSpans: response.data.completedSpans || 0,
        memoryUsage: response.data.memoryUsage || 0
      };
    }
  } catch (error) {
    // Endpoint pode não existir, retorna valores padrão
  }
  
  return {
    activeSpans: 0,
    completedSpans: 0,
    memoryUsage: 0
  };
}

async function makeTracingRequest(workerId: number, requestId: string, baseUrl: string, timeout: number): Promise<TracingTestMetric> {
  const startTime = performance.now();
  const startMemory = process.memoryUsage();
  
  // Gera traceId para esta request
  const generatedTraceId = generateTraceId();
  const payload = generateVariation(basePedido, parseInt(requestId));
  
  try {
    // Coleta métricas de tracing antes da request
    const beforeTracing = await checkTracingEndpoint(baseUrl);
    
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
        headers: {
          'Content-Type': 'application/json',
          'X-Trace-Id': generatedTraceId,
          'X-Request-Id': requestId,
          'X-Worker-Id': workerId.toString()
        },
        timeout,
        validateStatus: () => true
      }
    );

    const endTime = performance.now();
    const responseTime = endTime - startTime;
    const endMemory = process.memoryUsage();
    
    // Coleta métricas de tracing depois da request
    const afterTracing = await checkTracingEndpoint(baseUrl);
    
    // Verifica headers de tracing na resposta
    const traceHeader = response.headers['x-trace-id'];
    const spanHeader = response.headers['x-span-id'];
    const hasTraceHeader = !!traceHeader;
    const traceHeaderValid = hasTraceHeader && validateTraceFormat(traceHeader);
    
    // Extrai traceId do response body
    const responseTraceId = response.data?.result?.data?.json?.traceId;
    
    // Calcula spans completados/vazando
    const spansCompleted = Math.max(0, afterTracing.completedSpans - beforeTracing.completedSpans);
    const spansLeaked = Math.max(0, afterTracing.activeSpans - beforeTracing.activeSpans);

    return {
      timestamp: Date.now(),
      workerId,
      requestId,
      success: response.status >= 200 && response.status < 300,
      responseTime,
      status: response.status,
      traceId: responseTraceId,
      spanId: spanHeader,
      parentTraceId: generatedTraceId,
      hasTraceHeader,
      traceHeaderValid,
      spansCompleted,
      spansLeaked,
      memoryUsage: endMemory
    };

  } catch (error) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    const endMemory = process.memoryUsage();

    if (error instanceof AxiosError) {
      return {
        timestamp: Date.now(),
        workerId,
        requestId,
        success: false,
        responseTime,
        status: error.response?.status,
        error: error.message,
        parentTraceId: generatedTraceId,
        hasTraceHeader: false,
        traceHeaderValid: false,
        spansCompleted: 0,
        spansLeaked: 0,
        memoryUsage: endMemory
      };
    }

    return {
      timestamp: Date.now(),
      workerId,
      requestId,
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      parentTraceId: generatedTraceId,
      hasTraceHeader: false,
      traceHeaderValid: false,
      spansCompleted: 0,
      spansLeaked: 0,
      memoryUsage: endMemory
    };
  }
}

// Worker function
async function workerFunction(data: TracingWorkerData): Promise<TracingTestMetric[]> {
  const { baseUrl, requestsPerWorker, workerId, timeout } = data;
  const metrics: TracingTestMetric[] = [];
  
  for (let i = 0; i < requestsPerWorker; i++) {
    const requestId = `${workerId}-${i}`;
    const metric = await makeTracingRequest(workerId, requestId, baseUrl, timeout);
    metrics.push(metric);
    
    // Pequena pausa entre requests para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return metrics;
}

async function runTracingTest(baseUrl: string, totalRequests: number = 100): Promise<TracingTestReport> {
  console.log('🔍 INICIANDO TESTE DE TRACING');
  console.log(`📍 Target: ${baseUrl}`);
  console.log(`📊 Total requests: ${totalRequests}`);
  
  const numWorkers = Math.min(4, totalRequests); // Max 4 workers
  const requestsPerWorker = Math.ceil(totalRequests / numWorkers);
  const timeout = 15000;
  
  console.log(`👥 Usando ${numWorkers} workers (${requestsPerWorker} requests cada)`);
  
  const workers: Promise<TracingTestMetric[]>[] = [];
  
  for (let i = 0; i < numWorkers; i++) {
    const workerPromise = new Promise<TracingTestMetric[]>((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          baseUrl,
          requestsPerWorker,
          workerId: i,
          timeout
        } as TracingWorkerData
      });

      worker.on('message', (metrics: TracingTestMetric[]) => {
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

  const results = await Promise.all(workers);
  const allMetrics = results.flat();

  // Análise dos resultados
  const successfulRequests = allMetrics.filter(m => m.success).length;
  const responseTimes = allMetrics.map(m => m.responseTime);
  
  // Verifica unicidade de traceIds
  const traceIds = allMetrics
    .filter(m => m.traceId)
    .map(m => m.traceId!);
  
  const uniqueTraceIds = new Set(traceIds);
  const duplicateTraceIds = new Map<string, { count: number; requestIds: string[] }>();
  
  traceIds.forEach(traceId => {
    const existing = duplicateTraceIds.get(traceId) || { count: 0, requestIds: [] };
    existing.count++;
    const metric = allMetrics.find(m => m.traceId === traceId);
    if (metric) {
      existing.requestIds.push(metric.requestId);
    }
    duplicateTraceIds.set(traceId, existing);
  });
  
  const duplicates = Array.from(duplicateTraceIds.entries())
    .filter(([_, data]) => data.count > 1)
    .map(([traceId, data]) => ({ traceId, count: data.count, requestIds: data.requestIds }));

  // Verifica headers de tracing
  const missingTraceHeaders = allMetrics.filter(m => !m.hasTraceHeader).length;
  const invalidTraceHeaders = allMetrics.filter(m => m.hasTraceHeader && !m.traceHeaderValid).length;
  
  // Verifica completion de spans
  const totalSpansCompleted = allMetrics.reduce((sum, m) => sum + m.spansCompleted, 0);
  const totalSpansLeaked = allMetrics.reduce((sum, m) => sum + m.spansLeaked, 0);
  const spansCompletionRate = totalSpansCompleted > 0 
    ? (totalSpansCompleted / (totalSpansCompleted + totalSpansLeaked)) * 100 
    : 100;

  // Detecção de memory leak
  const memoryValues = allMetrics.map(m => m.memoryUsage.heapUsed);
  const memoryGrowthRate = detectMemoryGrowth(memoryValues);
  const memoryLeakDetected = memoryGrowthRate > 15; // 15% growth threshold

  return {
    timestamp: new Date().toISOString(),
    config: {
      baseUrl,
      totalRequests,
      workers: numWorkers,
      timeout
    },
    metrics: allMetrics,
    summary: {
      totalRequests: allMetrics.length,
      successfulRequests,
      failedRequests: allMetrics.length - successfulRequests,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      traceIdUniqueness: (uniqueTraceIds.size / traceIds.length) * 100,
      traceHeaderRate: ((allMetrics.length - missingTraceHeaders) / allMetrics.length) * 100,
      spansCompletionRate,
      memoryLeakDetected,
      memoryGrowthRate
    },
    issues: {
      duplicateTraceIds: duplicates,
      missingTraceHeaders,
      invalidTraceHeaders,
      leakedSpans: totalSpansLeaked,
      memoryLeaks: memoryLeakDetected
    }
  };
}

function detectMemoryGrowth(memoryValues: number[]): number {
  if (memoryValues.length < 10) return 0;
  
  const firstQuartile = memoryValues.slice(0, Math.floor(memoryValues.length / 4));
  const lastQuartile = memoryValues.slice(-Math.floor(memoryValues.length / 4));
  
  const avgFirst = firstQuartile.reduce((a, b) => a + b, 0) / firstQuartile.length;
  const avgLast = lastQuartile.reduce((a, b) => a + b, 0) / lastQuartile.length;
  
  if (avgFirst === 0) return 0;
  
  return ((avgLast - avgFirst) / avgFirst) * 100;
}

function printReport(report: TracingTestReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 RELATÓRIO DE TESTE DE TRACING');
  console.log('='.repeat(80));
  
  console.log(`\n📅 Data/Hora: ${report.timestamp}`);
  console.log(`📊 Total requests: ${report.summary.totalRequests}`);
  console.log(`👥 Workers: ${report.config.workers}`);
  
  console.log('\n✅ RESULTADOS GERAIS:');
  console.log(`📈 Requests bem-sucedidas: ${report.summary.successfulRequests}/${report.summary.totalRequests}`);
  console.log(`⏱️ Tempo médio resposta: ${report.summary.averageResponseTime.toFixed(2)}ms`);
  
  console.log('\n🔍 VALIDAÇÃO DE TRACING:');
  console.log(`🆔 Unicidade de Trace IDs: ${report.summary.traceIdUniqueness.toFixed(2)}%`);
  console.log(`📋 Taxa de headers de tracing: ${report.summary.traceHeaderRate.toFixed(2)}%`);
  console.log(`🔄 Taxa de completion de spans: ${report.summary.spansCompletionRate.toFixed(2)}%`);
  console.log(`💾 Memory leak detectado: ${report.summary.memoryLeakDetected ? '❌ SIM' : '✅ NÃO'}`);
  console.log(`📈 Taxa crescimento memória: ${report.summary.memoryGrowthRate.toFixed(2)}%`);
  
  console.log('\n🚨 PROBLEMAS ENCONTRADOS:');
  console.log(`🔄 Trace IDs duplicados: ${report.issues.duplicateTraceIds.length}`);
  console.log(`❌ Headers de tracing faltando: ${report.issues.missingTraceHeaders}`);
  console.log(`⚠️ Headers de tracing inválidos: ${report.issues.invalidTraceHeaders}`);
  console.log(`💥 Spans vazando: ${report.issues.leakedSpans}`);
  
  if (report.issues.duplicateTraceIds.length > 0) {
    console.log('\n❌ DETALHES DOS DUPLICADOS:');
    report.issues.duplicateTraceIds.slice(0, 5).forEach(dup => {
      console.log(`   TraceId ${dup.traceId.substring(0, 8)}...: ${dup.count} ocorrências`);
      console.log(`   Requests: ${dup.requestIds.join(', ')}`);
    });
    
    if (report.issues.duplicateTraceIds.length > 5) {
      console.log(`   ... e mais ${report.issues.duplicateTraceIds.length - 5} casos`);
    }
  }
  
  // Verificações críticas
  console.log('\n🔥 VERIFICAÇÃO CRÍTICA:');
  
  if (report.issues.duplicateTraceIds.length > 0) {
    console.log('❌ FALHA CRÍTICA: Trace IDs duplicados detectados!');
    console.log('   Isso pode causar corrupção de dados e problemas de debugging!');
  }
  
  if (report.summary.traceIdUniqueness < 95) {
    console.log('❌ FALHA: Unicidade de trace IDs abaixo de 95%!');
  }
  
  if (report.issues.missingTraceHeaders > report.summary.totalRequests * 0.1) {
    console.log('❌ FALHA: Mais de 10% das requests sem headers de tracing!');
  }
  
  if (report.summary.spansCompletionRate < 90) {
    console.log('❌ FALHA: Taxa de completion de spans abaixo de 90%!');
  }
  
  if (report.summary.memoryLeakDetected) {
    console.log('❌ FALHA CRÍTICA: Memory leak detectado no sistema de tracing!');
  }
  
  if (report.issues.leakedSpans > report.summary.totalRequests * 0.05) {
    console.log('❌ FALHA: Mais de 5% de spans vazando!');
  }
  
  const criticalIssues = [
    report.issues.duplicateTraceIds.length > 0,
    report.summary.traceIdUniqueness < 95,
    report.summary.spansCompletionRate < 90,
    report.summary.memoryLeakDetected,
    report.issues.leakedSpans > report.summary.totalRequests * 0.05
  ].filter(Boolean).length;
  
  if (criticalIssues === 0) {
    console.log('✅ TESTE PASSOU: Sistema de tracing está funcionando corretamente!');
  } else {
    console.log(`❌ TESTE FALHOU: ${criticalIssues} problemas críticos encontrados!`);
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const totalRequests = parseInt(process.env.TRACING_REQUESTS || '100');
  
  try {
    const report = await runTracingTest(baseUrl, totalRequests);
    printReport(report);
    
    // Salva relatório
    const fs = await import('fs/promises');
    await fs.writeFile(
      `./tracing-test-report-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n💾 Relatório salvo em: tracing-test-report-${Date.now()}.json`);
    
  } catch (error) {
    console.error('❌ Erro ao executar teste:', error);
    process.exit(1);
  }
}

// Executa como worker se receber dados
if (!isMainThread && workerData) {
  workerFunction(workerData as TracingWorkerData)
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

export { runTracingTest, TracingTestReport };
