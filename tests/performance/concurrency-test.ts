import { performance } from 'perf_hooks';
import axios, { AxiosError } from 'axios';
import { createHash } from 'crypto';

// Configurações
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const CONCURRENT_REQUESTS = 50;
const TIMEOUT_MS = 30000;

// Payload base para pedido
const basePedido = {
  tenantId: Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99),
  vendedorId: 1,
  clienteId: 1,
  cliente: {
    nome: 'Cliente Teste Concorrência',
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
  observacoes: 'Teste de concorrência',
  itens: [
    {
      tipo: 'CATALOGO',
      produtoId: 1,
      descricao: 'Produto Teste Concorrência',
      quantidade: 1,
      valorUnitario: '100.00',
      custo: '50.00'
    }
  ]
};

interface TestResult {
  success: boolean;
  responseTime: number;
  status?: number;
  error?: string;
  pedidoId?: number;
  traceId?: string;
  idempotencyKey?: string;
}

interface ConcurrencyTestReport {
  timestamp: string;
  config: {
    baseUrl: string;
    concurrentRequests: number;
    timeout: number;
  };
  results: TestResult[];
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    successRate: number;
    duplicatePedidos: number;
    uniqueTraceIds: number;
    errors: Array<{ error: string; count: number }>;
  };
  duplicates: Array<{ pedidoId: number; count: number; traceIds: string[] }>;
  traceIdCollisions: Array<{ traceId: string; count: number }>;
}

function generateIdempotencyKey(data: any): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 32);
}

function generateVariation(base: any, index: number): any {
  // Gera variação única para cada request para testar idempotência real
  return {
    ...base,
    cliente: {
      ...base.cliente,
      nome: `${base.cliente.nome} #${index}`
    },
    observacoes: `${base.observacoes} - Request ${index}`,
    itens: base.itens.map((item: any, i: number) => ({
      ...item,
      quantidade: 1 + (index % 3), // Varia quantidade entre 1-3
      valorUnitario: (100 + (index % 5) * 10).toString() // Varia preço
    }))
  };
}

async function makeRequest(index: number): Promise<TestResult> {
  const startTime = performance.now();
  const payload = generateVariation(basePedido, index);
  const idempotencyKey = generateIdempotencyKey(payload);
  
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
          'X-Idempotency-Key': idempotencyKey,
          'X-Request-Index': index.toString()
        },
        timeout: TIMEOUT_MS,
        validateStatus: () => true // Aceita qualquer status
      }
    );

    const endTime = performance.now();
    const responseTime = endTime - startTime;

    return {
      success: response.status >= 200 && response.status < 300,
      responseTime,
      status: response.status,
      pedidoId: response.data?.result?.data?.json?.pedidoId,
      traceId: response.data?.result?.data?.json?.traceId,
      idempotencyKey
    };

  } catch (error) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;

    if (error instanceof AxiosError) {
      return {
        success: false,
        responseTime,
        status: error.response?.status,
        error: error.message,
        idempotencyKey
      };
    }

    return {
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      idempotencyKey
    };
  }
}

async function runConcurrencyTest(): Promise<ConcurrencyTestReport> {
  console.log(`🚀 Iniciando teste de concorrência: ${CONCURRENT_REQUESTS} requests simultâneos`);
  console.log(`📍 Target: ${BASE_URL}`);
  
  const startTime = performance.now();
  
  // Executa todas as requests em paralelo
  const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => makeRequest(i));
  const results = await Promise.all(promises);
  
  const endTime = performance.now();
  const totalTestTime = endTime - startTime;

  // Análise dos resultados
  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.length - successfulRequests;
  const responseTimes = results.map(r => r.responseTime);
  
  // Verifica duplicações de pedidoId
  const pedidoIds = results
    .filter(r => r.pedidoId)
    .map(r => r.pedidoId!);
  
  const pedidoIdCounts = new Map<number, { count: number; traceIds: string[] }>();
  pedidoIds.forEach(id => {
    const existing = pedidoIdCounts.get(id) || { count: 0, traceIds: [] };
    const result = results.find(r => r.pedidoId === id);
    if (result?.traceId) {
      existing.traceIds.push(result.traceId);
    }
    existing.count++;
    pedidoIdCounts.set(id, existing);
  });
  
  const duplicates = Array.from(pedidoIdCounts.entries())
    .filter(([_, data]) => data.count > 1)
    .map(([pedidoId, data]) => ({ pedidoId, count: data.count, traceIds: data.traceIds }));

  // Verifica colisões de traceId
  const traceIds = results
    .filter(r => r.traceId)
    .map(r => r.traceId!);
  
  const traceIdCounts = new Map<string, number>();
  traceIds.forEach(id => {
    traceIdCounts.set(id, (traceIdCounts.get(id) || 0) + 1);
  });
  
  const traceIdCollisions = Array.from(traceIdCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([traceId, count]) => ({ traceId, count }));

  // Agrupa erros
  const errorCounts = new Map<string, number>();
  results.forEach(r => {
    if (!r.success && r.error) {
      errorCounts.set(r.error, (errorCounts.get(r.error) || 0) + 1);
    }
  });

  const report: ConcurrencyTestReport = {
    timestamp: new Date().toISOString(),
    config: {
      baseUrl: BASE_URL,
      concurrentRequests: CONCURRENT_REQUESTS,
      timeout: TIMEOUT_MS
    },
    results,
    summary: {
      totalRequests: results.length,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      successRate: (successfulRequests / results.length) * 100,
      duplicatePedidos: duplicates.length,
      uniqueTraceIds: new Set(traceIds).size,
      errors: Array.from(errorCounts.entries()).map(([error, count]) => ({ error, count }))
    },
    duplicates,
    traceIdCollisions
  };

  return report;
}

function printReport(report: ConcurrencyTestReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 RELATÓRIO DE TESTE DE CONCORRÊNCIA');
  console.log('='.repeat(80));
  
  console.log(`\n📅 Data/Hora: ${report.timestamp}`);
  console.log(`🎯 Target: ${report.config.baseUrl}`);
  console.log(`⚡ Requests simultâneas: ${report.config.concurrentRequests}`);
  
  console.log('\n📈 RESULTADOS GERAIS:');
  console.log(`✅ Requests bem-sucedidas: ${report.summary.successfulRequests}/${report.summary.totalRequests}`);
  console.log(`❌ Requests falhadas: ${report.summary.failedRequests}/${report.summary.totalRequests}`);
  console.log(`📊 Taxa de sucesso: ${report.summary.successRate.toFixed(2)}%`);
  
  console.log('\n⏱️ TEMPOS DE RESPOSTA (ms):');
  console.log(`📏 Média: ${report.summary.averageResponseTime.toFixed(2)}`);
  console.log(`⚡ Mínimo: ${report.summary.minResponseTime.toFixed(2)}`);
  console.log(`🐌 Máximo: ${report.summary.maxResponseTime.toFixed(2)}`);
  
  console.log('\n🔍 VALIDAÇÃO DE INTEGRIDADE:');
  console.log(`🔄 Pedidos duplicados: ${report.summary.duplicatePedidos}`);
  console.log(`🆔 Trace IDs únicos: ${report.summary.uniqueTraceIds}`);
  console.log(`💥 Colisões de traceId: ${report.traceIdCollisions.length}`);
  
  if (report.duplicates.length > 0) {
    console.log('\n❌ DUPLICAÇÕES ENCONTRADAS:');
    report.duplicates.forEach(dup => {
      console.log(`   Pedido ID ${dup.pedidoId}: ${dup.count} ocorrências`);
      console.log(`   Trace IDs: ${dup.traceIds.join(', ')}`);
    });
  }
  
  if (report.traceIdCollisions.length > 0) {
    console.log('\n⚠️ COLISÕES DE TRACE ID:');
    report.traceIdCollisions.forEach(collision => {
      console.log(`   TraceId ${collision.traceId}: ${collision.count} ocorrências`);
    });
  }
  
  if (report.summary.errors.length > 0) {
    console.log('\n🚨 ERROS ENCONTRADOS:');
    report.summary.errors.forEach(({ error, count }) => {
      console.log(`   ${error}: ${count} ocorrências`);
    });
  }
  
  // Verificação crítica
  console.log('\n🔥 VERIFICAÇÃO CRÍTICA:');
  if (report.summary.duplicatePedidos > 0) {
    console.log('❌ FALHA CRÍTICA: Pedidos duplicados detectados!');
    process.exit(1);
  }
  
  if (report.traceIdCollisions.length > 0) {
    console.log('❌ FALHA CRÍTICA: Colisões de traceId detectadas!');
    process.exit(1);
  }
  
  if (report.summary.successRate < 95) {
    console.log('❌ FALHA: Taxa de sucesso abaixo de 95%!');
    process.exit(1);
  }
  
  console.log('✅ TESTE PASSOU: Sistema resistiu à concorrência!');
}

async function main(): Promise<void> {
  try {
    const report = await runConcurrencyTest();
    printReport(report);
    
    // Salva relatório em arquivo
    const fs = await import('fs/promises');
    await fs.writeFile(
      `./concurrency-test-report-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n💾 Relatório salvo em: concurrency-test-report-${Date.now()}.json`);
    
  } catch (error) {
    console.error('❌ Erro ao executar teste:', error);
    process.exit(1);
  }
}

// Executa se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

export { runConcurrencyTest, ConcurrencyTestReport };
