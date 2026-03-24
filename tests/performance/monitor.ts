import { performance } from 'perf_hooks';
import * as os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import axios from 'axios';

interface MonitorWorkerData {
  targetUrl: string;
  interval: number;
  duration: number;
  workerId: number;
}

interface SystemMetrics {
  timestamp: number;
  workerId: number;
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  network: {
    targetResponseTime?: number;
    targetStatus?: number;
    targetError?: string;
  };
  process: {
    uptime: number;
    pid: number;
  };
}

interface MonitoringReport {
  timestamp: string;
  config: {
    targetUrl: string;
    interval: number;
    duration: number;
    workers: number;
  };
  metrics: SystemMetrics[];
  summary: {
    totalSamples: number;
    duration: number;
    cpu: {
      average: number;
      max: number;
      min: number;
      p95: number;
      p99: number;
    };
    memory: {
      averageUsed: number;
      maxUsed: number;
      peakHeapUsed: number;
      memoryLeakDetected: boolean;
      memoryGrowthRate: number;
    };
    network: {
      averageResponseTime: number;
      maxResponseTime: number;
      errorRate: number;
      totalErrors: number;
    };
  };
  alerts: Array<{
    timestamp: number;
    type: 'CPU_HIGH' | 'MEMORY_HIGH' | 'MEMORY_LEAK' | 'RESPONSE_TIME_HIGH' | 'ERROR_RATE_HIGH';
    message: string;
    value: number;
    threshold: number;
  }>;
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  return 100 - (totalIdle / totalTick) * 100;
}

async function checkTargetHealth(url: string): Promise<{ responseTime: number; status: number; error?: string }> {
  const startTime = performance.now();
  
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    const responseTime = performance.now() - startTime;
    
    return {
      responseTime,
      status: response.status
    };
    
  } catch (error) {
    const responseTime = performance.now() - startTime;
    
    return {
      responseTime,
      status: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function collectMetrics(data: MonitorWorkerData): Promise<SystemMetrics[]> {
  const { targetUrl, interval, duration, workerId } = data;
  const metrics: SystemMetrics[] = [];
  const endTime = Date.now() + duration;
  
  while (Date.now() < endTime) {
    const timestamp = Date.now();
    
    // Coletar métricas de CPU
    const cpuUsage = getCpuUsage();
    const loadAverage = os.loadavg();
    
    // Coletar métricas de memória
    const memInfo = os.freemem();
    const totalMem = os.totalmem();
    const usedMem = totalMem - memInfo;
    const processMem = process.memoryUsage();
    
    // Coletar métricas de rede (health check do target)
    const networkMetrics = await checkTargetHealth(targetUrl);
    
    const metric: SystemMetrics = {
      timestamp,
      workerId,
      cpu: {
        usage: cpuUsage,
        loadAverage,
        cores: os.cpus().length
      },
      memory: {
        total: totalMem,
        free: memInfo,
        used: usedMem,
        heapUsed: processMem.heapUsed,
        heapTotal: processMem.heapTotal,
        external: processMem.external,
        rss: processMem.rss
      },
      network: {
        targetResponseTime: networkMetrics.responseTime,
        targetStatus: networkMetrics.status,
        targetError: networkMetrics.error
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid
      }
    };
    
    metrics.push(metric);
    
    // Espera próximo intervalo
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return metrics;
}

// Worker function
async function workerFunction(data: MonitorWorkerData): Promise<SystemMetrics[]> {
  return await collectMetrics(data);
}

async function runMonitoring(targetUrl: string, duration: number = 60000, interval: number = 1000): Promise<MonitoringReport> {
  console.log('🔍 INICIANDO MONITORAMENTO DE SISTEMA');
  console.log(`📍 Target: ${targetUrl}`);
  console.log(`⏱️ Duração: ${duration / 1000}s`);
  console.log(`📊 Intervalo: ${interval}ms`);
  
  const numWorkers = Math.min(os.cpus().length, 4); // Max 4 workers for monitoring
  const metricsPerWorker = Math.ceil(duration / interval);
  
  console.log(`👥 Usando ${numWorkers} workers para coleta paralela`);
  
  const workers: Promise<SystemMetrics[]>[] = [];
  
  for (let i = 0; i < numWorkers; i++) {
    const workerPromise = new Promise<SystemMetrics[]>((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          targetUrl,
          interval,
          duration,
          workerId: i
        } as MonitorWorkerData
      });

      worker.on('message', (metrics: SystemMetrics[]) => {
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

  // Análise das métricas
  const cpuValues = allMetrics.map(m => m.cpu.usage);
  const memoryUsedValues = allMetrics.map(m => m.memory.used);
  const heapUsedValues = allMetrics.map(m => m.memory.heapUsed);
  const responseTimeValues = allMetrics
    .filter(m => m.network.targetResponseTime !== undefined)
    .map(m => m.network.targetResponseTime!);
  
  const networkErrors = allMetrics.filter(m => m.network.targetError).length;
  const totalNetworkChecks = allMetrics.filter(m => m.network.targetResponseTime !== undefined).length;

  // Detecção de memory leak
  const memoryGrowthRate = detectMemoryGrowth(heapUsedValues);
  const memoryLeakDetected = memoryGrowthRate > 10; // 10% growth rate threshold

  // Geração de alerts
  const alerts: MonitoringReport['alerts'] = [];
  
  // CPU alerts
  const avgCpu = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
  if (avgCpu > 80) {
    alerts.push({
      timestamp: Date.now(),
      type: 'CPU_HIGH',
      message: `CPU média alta: ${avgCpu.toFixed(2)}%`,
      value: avgCpu,
      threshold: 80
    });
  }
  
  // Memory alerts
  const maxMemoryUsage = Math.max(...memoryUsedValues);
  const memoryUsagePercent = (maxMemoryUsage / os.totalmem()) * 100;
  if (memoryUsagePercent > 85) {
    alerts.push({
      timestamp: Date.now(),
      type: 'MEMORY_HIGH',
      message: `Uso de memória alto: ${memoryUsagePercent.toFixed(2)}%`,
      value: memoryUsagePercent,
      threshold: 85
    });
  }
  
  if (memoryLeakDetected) {
    alerts.push({
      timestamp: Date.now(),
      type: 'MEMORY_LEAK',
      message: `Possível memory leak detectado: taxa de crescimento ${memoryGrowthRate.toFixed(2)}%`,
      value: memoryGrowthRate,
      threshold: 10
    });
  }
  
  // Response time alerts
  if (responseTimeValues.length > 0) {
    const avgResponseTime = responseTimeValues.reduce((a, b) => a + b, 0) / responseTimeValues.length;
    if (avgResponseTime > 2000) { // 2 segundos
      alerts.push({
        timestamp: Date.now(),
        type: 'RESPONSE_TIME_HIGH',
        message: `Tempo de resposta alto: ${avgResponseTime.toFixed(2)}ms`,
        value: avgResponseTime,
        threshold: 2000
      });
    }
  }
  
  // Error rate alerts
  const errorRate = totalNetworkChecks > 0 ? (networkErrors / totalNetworkChecks) * 100 : 0;
  if (errorRate > 5) { // 5% error rate
    alerts.push({
      timestamp: Date.now(),
      type: 'ERROR_RATE_HIGH',
      message: `Taxa de erro alta: ${errorRate.toFixed(2)}%`,
      value: errorRate,
      threshold: 5
    });
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      targetUrl,
      interval,
      duration,
      workers: numWorkers
    },
    metrics: allMetrics,
    summary: {
      totalSamples: allMetrics.length,
      duration,
      cpu: {
        average: avgCpu,
        max: Math.max(...cpuValues),
        min: Math.min(...cpuValues),
        p95: calculatePercentile(cpuValues, 95),
        p99: calculatePercentile(cpuValues, 99)
      },
      memory: {
        averageUsed: memoryUsedValues.reduce((a, b) => a + b, 0) / memoryUsedValues.length,
        maxUsed: maxMemoryUsage,
        peakHeapUsed: Math.max(...heapUsedValues),
        memoryLeakDetected,
        memoryGrowthRate
      },
      network: {
        averageResponseTime: responseTimeValues.length > 0 
          ? responseTimeValues.reduce((a, b) => a + b, 0) / responseTimeValues.length 
          : 0,
        maxResponseTime: responseTimeValues.length > 0 ? Math.max(...responseTimeValues) : 0,
        errorRate,
        totalErrors: networkErrors
      }
    },
    alerts
  };
}

function detectMemoryGrowth(heapValues: number[]): number {
  if (heapValues.length < 10) return 0;
  
  const firstQuartile = heapValues.slice(0, Math.floor(heapValues.length / 4));
  const lastQuartile = heapValues.slice(-Math.floor(heapValues.length / 4));
  
  const avgFirst = firstQuartile.reduce((a, b) => a + b, 0) / firstQuartile.length;
  const avgLast = lastQuartile.reduce((a, b) => a + b, 0) / lastQuartile.length;
  
  if (avgFirst === 0) return 0;
  
  return ((avgLast - avgFirst) / avgFirst) * 100;
}

function printReport(report: MonitoringReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 RELATÓRIO DE MONITORAMENTO');
  console.log('='.repeat(80));
  
  console.log(`\n📅 Data/Hora: ${report.timestamp}`);
  console.log(`⏱️ Duração: ${report.summary.duration / 1000}s`);
  console.log(`📊 Amostras: ${report.summary.totalSamples}`);
  
  console.log('\n💻 CPU:');
  console.log(`   Média: ${report.summary.cpu.average.toFixed(2)}%`);
  console.log(`   Máximo: ${report.summary.cpu.max.toFixed(2)}%`);
  console.log(`   Mínimo: ${report.summary.cpu.min.toFixed(2)}%`);
  console.log(`   P95: ${report.summary.cpu.p95.toFixed(2)}%`);
  console.log(`   P99: ${report.summary.cpu.p99.toFixed(2)}%`);
  
  console.log('\n💾 MEMÓRIA:');
  console.log(`   Média usada: ${(report.summary.memory.averageUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   Máximo usada: ${(report.summary.memory.maxUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   Pico heap: ${(report.summary.memory.peakHeapUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   Memory leak: ${report.summary.memory.memoryLeakDetected ? '❌ DETECTADO' : '✅ NÃO'}`);
  console.log(`   Taxa crescimento: ${report.summary.memory.memoryGrowthRate.toFixed(2)}%`);
  
  console.log('\n🌐 REDE:');
  console.log(`   Tempo médio resposta: ${report.summary.network.averageResponseTime.toFixed(2)}ms`);
  console.log(`   Tempo máximo resposta: ${report.summary.network.maxResponseTime.toFixed(2)}ms`);
  console.log(`   Taxa de erro: ${report.summary.network.errorRate.toFixed(2)}%`);
  console.log(`   Total erros: ${report.summary.network.totalErrors}`);
  
  if (report.alerts.length > 0) {
    console.log('\n🚨 ALERTAS:');
    report.alerts.forEach(alert => {
      console.log(`   ${alert.type}: ${alert.message}`);
    });
  } else {
    console.log('\n✅ Nenhum alerta gerado');
  }
  
  // Verificações críticas
  console.log('\n🔥 VERIFICAÇÃO CRÍTICA:');
  
  if (report.summary.cpu.average > 90) {
    console.log('❌ FALHA CRÍTICA: CPU média acima de 90%!');
  }
  
  if (report.summary.memory.memoryLeakDetected) {
    console.log('❌ FALHA CRÍTICA: Memory leak detectado!');
  }
  
  if (report.summary.network.errorRate > 10) {
    console.log('❌ FALHA CRÍTICA: Taxa de erro acima de 10%!');
  }
  
  if (report.summary.network.averageResponseTime > 5000) {
    console.log('❌ FALHA CRÍTICA: Tempo médio de resposta acima de 5s!');
  }
  
  if (report.alerts.length === 0) {
    console.log('✅ SISTEMA ESTÁVEL: Nenhum problema crítico detectado!');
  }
}

async function main(): Promise<void> {
  const targetUrl = process.env.TARGET_URL || 'http://localhost:3001/api/health';
  const duration = parseInt(process.env.MONITOR_DURATION || '60000'); // 60s default
  const interval = parseInt(process.env.MONITOR_INTERVAL || '1000'); // 1s default
  
  try {
    const report = await runMonitoring(targetUrl, duration, interval);
    printReport(report);
    
    // Salva relatório
    const fs = await import('fs/promises');
    await fs.writeFile(
      `./monitoring-report-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n💾 Relatório salvo em: monitoring-report-${Date.now()}.json`);
    
  } catch (error) {
    console.error('❌ Erro ao executar monitoramento:', error);
    process.exit(1);
  }
}

// Executa como worker se receber dados
if (!isMainThread && workerData) {
  workerFunction(workerData as MonitorWorkerData)
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

export { runMonitoring, MonitoringReport };
