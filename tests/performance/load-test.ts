import { performance } from 'perf_hooks';
import axios, { AxiosError } from 'axios';
import { createHash } from 'crypto';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import * as os from 'os';

// Configurações
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const LOAD_LEVELS = [100, 300, 500]; // req/s
const DURATION_PER_LEVEL = 30000; // 30 segundos por nível
const TIMEOUT_MS = 10000;

interface LoadTestWorkerData {
  baseUrl: string;
  requestsPerSecond: number;
  duration: number;
  workerId: number;
  timeout: number;
}

interface LoadTestMetrics {
  timestamp: number;
  workerId: number;
  success: boolean;
  responseTime: number;
  status?: number;
  error?: string;
  cpuUsage?: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

interface LoadTestReport {
  timestamp: string;
  config: {
    baseUrl: string;
    loadLevels: number[];
    durationPerLevel: number;
    timeout: number;
  };
  results: {
    [loadLevel: number]: {
      metrics: LoadTestMetrics[];
      summary: {
        totalRequests: number;
        successfulRequests: number;
        failedRequests: number;
        averageResponseTime: number;
        minResponseTime: number;
        maxResponseTime: number;
        p95: number;
        p99: number;
        requestsPerSecond: number;
        successRate: number;
        errorRate: number;
        averageCpuUsage: number;
        peakMemoryUsage: number;
        errors: Array<{ error: string; count: number }>;
      };
    };
  };
  systemMetrics: {
    cpuCores: number;
    totalMemory: number;
    platform: string;
  };
}

// Payload base para pedido
const basePedido = {
  tenantId: Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99),
  vendedorId: 1,
  clienteId: 1,
  cliente: {
    nome: 'Cliente Teste Carga',
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
  observacoes: 'Teste de carga',
  itens: [
    {
      tipo: 'CATALOGO',
      produtoId: 1,
      descricao: 'Produto Teste Carga',
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
      nome: `${base.cliente.nome} ${Date.now()}-${index}`
    },
    observacoes: `${base.observacoes} - ${Date.now()}-${index}`,
    itens: base.itens.map((item: any) => ({
      ...item,
      valorUnitario: (100 + Math.random() * 50).toFixed(2)
    }))
  };
}

async function makeRequest(workerId: number, requestIndex: number): Promise<LoadTestMetrics> {
  const startTime = performance.now();
  const startCpu = process.cpuUsage();
  const startMemory = process.memoryUsage();
  
  const payload = generateVariation(basePedido, requestIndex);
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/trpc/pedidos.createPedidoSafe`,
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
          'X-Worker-Id': workerId.toString(),
          'X-Request-Index': requestIndex.toString()
        },
        timeout: TIMEOUT_MS,
        validateStatus: () => true
      }
    );

    const endTime = performance.now();
    const responseTime = endTime - startTime;
    const endCpu = process.cpuUsage(startCpu);
    const endMemory = process.memoryUsage();

    return {
      timestamp: Date.now(),
      workerId,
      success: response.status >= 200 && response.status < 300,
      responseTime,
      status: response.status,
      cpuUsage: (endCpu.user + endCpu.system) / 1000000, // Convert to seconds
      memoryUsage: endMemory
    };

  } catch (error) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    const endCpu = process.cpuUsage(startCpu);
    const endMemory = process.memoryUsage();

    if (error instanceof AxiosError) {
      return {
        timestamp: Date.now(),
        workerId,
        success: false,
        responseTime,
        status: error.response?.status,
        error: error.message,
        cpuUsage: (endCpu.user + endCpu.system) / 1000000,
        memoryUsage: endMemory
      };
    }

    return {
      timestamp: Date.now(),
      workerId,
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      cpuUsage: (endCpu.user + endCpu.system) / 1000000,
      memoryUsage: endMemory
    };
  }
}

// Worker function
async function workerFunction(data: LoadTestWorkerData): Promise<LoadTestMetrics[]> {
  const { baseUrl, requestsPerSecond, duration, workerId, timeout } = data;
  const metrics: LoadTestMetrics[] = [];
  const intervalMs = 1000 / requestsPerSecond;
  const endTime = Date.now() + duration;
  let requestIndex = 0;

  while (Date.now() < endTime) {
    const metric = await makeRequest(workerId, requestIndex++);
    metrics.push(metric);
    
    // Control rate limiting
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return metrics;
}

// Main thread worker management
async function runLoadLevel(requestsPerSecond: number, duration: number): Promise<LoadTestMetrics[]> {
  const numWorkers = Math.min(os.cpus().length, 8); // Max 8 workers
  const requestsPerWorker = Math.ceil(requestsPerSecond / numWorkers);
  
  console.log(`🚀 Executando carga ${requestsPerSecond} req/s com ${numWorkers} workers (${requestsPerWorker} req/s por worker)`);
  
  const workers: Promise<LoadTestMetrics[]>[] = [];
  
  for (let i = 0; i < numWorkers; i++) {
    const workerPromise = new Promise<LoadTestMetrics[]>((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          baseUrl: BASE_URL,
          requestsPerSecond: requestsPerWorker,
          duration,
          workerId: i,
          timeout: TIMEOUT_MS
        } as LoadTestWorkerData
      });

      worker.on('message', (metrics: LoadTestMetrics[]) => {
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
  return results.flat();
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function generateSummary(metrics: LoadTestMetrics[]) {
  const responseTimes = metrics.map(m => m.responseTime);
  const successfulRequests = metrics.filter(m => m.success).length;
  const failedRequests = metrics.length - successfulRequests;
  
  // Calculate errors
  const errorCounts = new Map<string, number>();
  metrics.forEach(m => {
    if (!m.success && m.error) {
      errorCounts.set(m.error, (errorCounts.get(m.error) || 0) + 1);
    }
  });

  // Calculate actual RPS based on duration
  const timeSpan = Math.max(...metrics.map(m => m.timestamp)) - Math.min(...metrics.map(m => m.timestamp));
  const actualRPS = (metrics.length / timeSpan) * 1000;

  return {
    totalRequests: metrics.length,
    successfulRequests,
    failedRequests,
    averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
    minResponseTime: Math.min(...responseTimes),
    maxResponseTime: Math.max(...responseTimes),
    p95: calculatePercentile(responseTimes, 95),
    p99: calculatePercentile(responseTimes, 99),
    requestsPerSecond: actualRPS,
    successRate: (successfulRequests / metrics.length) * 100,
    errorRate: (failedRequests / metrics.length) * 100,
    averageCpuUsage: metrics.reduce((sum, m) => sum + (m.cpuUsage || 0), 0) / metrics.length,
    peakMemoryUsage: Math.max(...metrics.map(m => m.memoryUsage?.heapUsed || 0)),
    errors: Array.from(errorCounts.entries()).map(([error, count]) => ({ error, count }))
  };
}

async function runLoadTest(): Promise<LoadTestReport> {
  console.log('🔥 INICIANDO TESTE DE CARGA PROGRESSIVO');
  console.log(`📍 Target: ${BASE_URL}`);
  console.log(`📊 Níveis de carga: ${LOAD_LEVELS.join(' → ')} req/s`);
  console.log(`⏱️ Duração por nível: ${DURATION_PER_LEVEL / 1000}s`);
  
  const results: LoadTestReport['results'] = {};

  for (const loadLevel of LOAD_LEVELS) {
    console.log(`\n--- Testando ${loadLevel} req/s ---`);
    
    const metrics = await runLoadLevel(loadLevel, DURATION_PER_LEVEL);
    results[loadLevel] = {
      metrics,
      summary: generateSummary(metrics)
    };

    console.log(`✅ ${loadLevel} req/s concluído`);
    console.log(`   📊 Taxa de sucesso: ${results[loadLevel].summary.successRate.toFixed(2)}%`);
    console.log(`   ⏱️ Tempo médio: ${results[loadLevel].summary.averageResponseTime.toFixed(2)}ms`);
    console.log(`   🚨 Taxa de erro: ${results[loadLevel].summary.errorRate.toFixed(2)}%`);
    
    // Pausa entre níveis
    if (loadLevel !== LOAD_LEVELS[LOAD_LEVELS.length - 1]) {
      console.log('⏸️ Pausando 10 segundos antes do próximo nível...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      baseUrl: BASE_URL,
      loadLevels: LOAD_LEVELS,
      durationPerLevel: DURATION_PER_LEVEL,
      timeout: TIMEOUT_MS
    },
    results,
    systemMetrics: {
      cpuCores: os.cpus().length,
      totalMemory: os.totalmem(),
      platform: os.platform()
    }
  };
}

function printReport(report: LoadTestReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 RELATÓRIO DE TESTE DE CARGA');
  console.log('='.repeat(80));
  
  console.log(`\n📅 Data/Hora: ${report.timestamp}`);
  console.log(`🖥️ Sistema: ${report.systemMetrics.platform} (${report.systemMetrics.cpuCores} cores)`);
  console.log(`💾 Memória total: ${(report.systemMetrics.totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB`);
  
  for (const [loadLevel, data] of Object.entries(report.results)) {
    const level = parseInt(loadLevel);
    const summary = data.summary;
    
    console.log(`\n🔥 CARGA ${level} req/s:`);
    console.log(`   📊 Requests: ${summary.successfulRequests}/${summary.totalRequests} (${summary.successRate.toFixed(2)}% sucesso)`);
    console.log(`   ⏱️ Tempos (ms): Média=${summary.averageResponseTime.toFixed(2)} | P95=${summary.p95.toFixed(2)} | P99=${summary.p99.toFixed(2)}`);
    console.log(`   🚨 Erros: ${summary.errorRate.toFixed(2)}%`);
    console.log(`   💻 CPU: ${summary.averageCpuUsage.toFixed(4)}s | Memória pico: ${(summary.peakMemoryUsage / 1024 / 1024).toFixed(2)}MB`);
    
    if (summary.errors.length > 0) {
      console.log('   🚨 Erros encontrados:');
      summary.errors.forEach(({ error, count }) => {
        console.log(`     ${error}: ${count}`);
      });
    }
    
    // Verificações de performance
    const maxAcceptableResponseTime = 5000; // 5s
    const minAcceptableSuccessRate = 95;
    
    if (summary.averageResponseTime > maxAcceptableResponseTime) {
      console.log(`   ❌ FALHA: Tempo médio acima de ${maxAcceptableResponseTime}ms`);
    }
    
    if (summary.successRate < minAcceptableSuccessRate) {
      console.log(`   ❌ FALHA: Taxa de sucesso abaixo de ${minAcceptableSuccessRate}%`);
    }
    
    if (summary.p99 > maxAcceptableResponseTime * 2) {
      console.log(`   ⚠️ ALERTA: P99 acima de ${maxAcceptableResponseTime * 2}ms`);
    }
  }
  
  // Análise de escalabilidade
  console.log('\n📈 ANÁLISE DE ESCALABILIDADE:');
  const levels = Object.keys(report.results).map(Number).sort();
  
  for (let i = 1; i < levels.length; i++) {
    const prevLevel = levels[i - 1];
    const currLevel = levels[i];
    const prevSummary = report.results[prevLevel].summary;
    const currSummary = report.results[currLevel].summary;
    
    const responseTimeIncrease = (currSummary.averageResponseTime - prevSummary.averageResponseTime) / prevSummary.averageResponseTime * 100;
    const successRateDecrease = prevSummary.successRate - currSummary.successRate;
    
    console.log(`   ${prevLevel} → ${currLevel} req/s: +${responseTimeIncrease.toFixed(2)}% tempo | -${successRateDecrease.toFixed(2)}% sucesso`);
    
    if (responseTimeIncrease > 100) {
      console.log(`   ❌ FALHA: Degradação de performance >100% entre ${prevLevel} e ${currLevel} req/s`);
    }
    
    if (successRateDecrease > 10) {
      console.log(`   ❌ FALHA: Queda de taxa de sucesso >10% entre ${prevLevel} e ${currLevel} req/s`);
    }
  }
}

async function main(): Promise<void> {
  try {
    const report = await runLoadTest();
    printReport(report);
    
    // Salva relatório
    const fs = await import('fs/promises');
    await fs.writeFile(
      `./load-test-report-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n💾 Relatório salvo em: load-test-report-${Date.now()}.json`);
    
  } catch (error) {
    console.error('❌ Erro ao executar teste:', error);
    process.exit(1);
  }
}

// Executa como worker se receber dados
if (!isMainThread && workerData) {
  workerFunction(workerData as LoadTestWorkerData)
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

export { runLoadTest, LoadTestReport };
