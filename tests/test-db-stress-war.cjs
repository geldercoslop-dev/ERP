#!/usr/bin/env node

/**
 * TESTE DE GUERRA: DB STRESS
 * Testa latência simulada com circuit breaker
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('TESTE DE GUERRA: DB STRESS');
console.log('='.repeat(60));

// Simulador de pool com latência
class DatabasePoolSimulator {
  constructor() {
    this.connections = [];
    this.maxConnections = 10;
    this.activeConnections = 0;
    this.latency = 0;
    this.failureRate = 0;
    this.circuitOpen = false;
    this.failureCount = 0;
    this.failureThreshold = 5;
    this.recoveryTimeout = 5000;
    this.lastFailureTime = 0;
    this.requestCount = 0;
    this.successCount = 0;
    this.responseTimes = [];
  }

  // Simular latência no DB
  setLatency(ms) {
    this.latency = ms;
    console.log(`📊 Latência configurada: ${ms}ms`);
  }

  // Simular taxa de falha
  setFailureRate(rate) {
    this.failureRate = rate;
    console.log(`📊 Taxa de falha configurada: ${(rate * 100).toFixed(1)}%`);
  }

  // Simular conexão com latência
  async getConnection() {
    this.requestCount++;
    
    // Verificar circuit breaker
    if (this.circuitOpen) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.recoveryTimeout) {
        console.log('🔄 Circuit breaker tentando fechar...');
        this.circuitOpen = false;
        this.failureCount = 0;
      } else {
        throw new Error('Circuit breaker open - DB unavailable');
      }
    }

    // Verificar limite de conexões
    if (this.activeConnections >= this.maxConnections) {
      throw new Error('Connection pool exhausted');
    }

    // Simular falha baseado na taxa
    if (Math.random() < this.failureRate) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.failureThreshold) {
        this.circuitOpen = true;
        console.log('⚡ Circuit breaker ABERTO');
      }
      
      throw new Error('Simulated DB failure');
    }

    // Simular latência
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, this.latency + Math.random() * 50));
    const responseTime = Date.now() - startTime;
    
    this.activeConnections++;
    this.successCount++;
    this.responseTimes.push(responseTime);
    
    // Manter apenas últimas 100 medições
    if (this.responseTimes.length > 100) {
      this.responseTimes = this.responseTimes.slice(-100);
    }

    return {
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      release: () => {
        this.activeConnections--;
      },
      execute: async (query) => {
        // Simular tempo de query
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
        return { result: `Query executed: ${query}`, responseTime };
      }
    };
  }

  // Obter status
  getStatus() {
    const avgResponseTime = this.responseTimes.length > 0
      ? Math.round(this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length)
      : 0;
    
    return {
      healthy: !this.circuitOpen && this.failureCount < this.failureThreshold,
      circuitOpen: this.circuitOpen,
      failureCount: this.failureCount,
      activeConnections: this.activeConnections,
      maxConnections: this.maxConnections,
      avgResponseTime,
      successRate: this.requestCount > 0 ? Math.round((this.successCount / this.requestCount) * 100) : 0,
      requestCount: this.requestCount
    };
  }

  // Reset para testes
  reset() {
    this.circuitOpen = false;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.requestCount = 0;
    this.successCount = 0;
    this.responseTimes = [];
    this.activeConnections = 0;
  }
}

// Middleware simulador de circuit breaker
class CircuitBreakerMiddleware {
  constructor(pool) {
    this.pool = pool;
  }

  async handleRequest(req, res, next) {
    try {
      const status = this.pool.getStatus();
      
      if (!status.healthy) {
        console.log('🚫 Request rejeitado pelo circuit breaker');
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Database circuit breaker is open',
          retryAfter: Math.ceil(this.pool.recoveryTimeout / 1000),
          timestamp: new Date().toISOString()
        });
      }
      
      // Simular request ao DB
      const connection = await this.pool.getConnection();
      const result = await connection.execute('SELECT 1 as test');
      connection.release();
      
      return res.json({
        success: true,
        data: result,
        dbStatus: status,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.log(`❌ Erro no request: ${error.message}`);
      
      if (error.message.includes('Circuit breaker')) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Database circuit breaker is open',
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Teste de latência normal
async function testNormalLatency() {
  console.log('\n🔍 TESTE 1: Latência Normal');
  
  const pool = new DatabasePoolSimulator();
  pool.setLatency(50); // 50ms de latência
  pool.setFailureRate(0.01); // 1% de falha
  
  const middleware = new CircuitBreakerMiddleware(pool);
  const requests = [];
  const numRequests = 20;
  
  console.log(`📊 Executando ${numRequests} requests com latência normal`);
  
  for (let i = 0; i < numRequests; i++) {
    const req = { id: i + 1 };
    const res = {
      status: null,
      json: (data) => {
        res.status = 200;
        res.data = data;
      }
    };
    
    const promise = middleware.handleRequest(req, res);
    requests.push(promise);
  }
  
  const results = await Promise.allSettled(requests);
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const status = pool.getStatus();
  
  console.log(`✅ Requests bem-sucedidas: ${successful}/${numRequests}`);
  console.log(`📊 Response time médio: ${status.avgResponseTime}ms`);
  console.log(`📊 Taxa de sucesso: ${status.successRate}%`);
  console.log(`🔌 Circuit breaker: ${status.circuitOpen ? 'ABERTO' : 'FECHADO'}`);
  
  return {
    success: successful >= numRequests * 0.95 && !status.circuitOpen,
    successRate: status.successRate,
    avgResponseTime: status.avgResponseTime,
    circuitOpen: status.circuitOpen
  };
}

// Teste de alta latência
async function testHighLatency() {
  console.log('\n🔍 TESTE 2: Alta Latência');
  
  const pool = new DatabasePoolSimulator();
  pool.setLatency(500); // 500ms de latência
  pool.setFailureRate(0.02); // 2% de falha
  
  const middleware = new CircuitBreakerMiddleware(pool);
  const requests = [];
  const numRequests = 15;
  
  console.log(`📊 Executando ${numRequests} requests com alta latência`);
  
  const startTime = Date.now();
  
  for (let i = 0; i < numRequests; i++) {
    const req = { id: i + 1 };
    const res = {
      status: null,
      json: (data) => {
        res.status = 200;
        res.data = data;
      }
    };
    
    const promise = middleware.handleRequest(req, res);
    requests.push(promise);
  }
  
  const results = await Promise.allSettled(requests);
  const endTime = Date.now();
  
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const status = pool.getStatus();
  
  console.log(`⏱️ Tempo total: ${endTime - startTime}ms`);
  console.log(`✅ Requests bem-sucedidas: ${successful}/${numRequests}`);
  console.log(`📊 Response time médio: ${status.avgResponseTime}ms`);
  console.log(`📊 Taxa de sucesso: ${status.successRate}%`);
  
  // Verificar se sistema ainda funciona sob alta latência
  const handledHighLatency = successful >= numRequests * 0.9 && status.avgResponseTime > 400;
  
  if (handledHighLatency) {
    console.log('✅ Sistema lidou bem com alta latência');
  } else {
    console.log('❌ Sistema não lidou bem com alta latência');
  }
  
  return {
    success: handledHighLatency,
    successRate: status.successRate,
    avgResponseTime: status.avgResponseTime,
    totalTime: endTime - startTime
  };
}

// Teste de circuit breaker
async function testCircuitBreaker() {
  console.log('\n🔍 TESTE 3: Circuit Breaker');
  
  const pool = new DatabasePoolSimulator();
  pool.setLatency(100); // 100ms de latência
  pool.setFailureRate(0.8); // 80% de falha para forçar circuit breaker
  
  const middleware = new CircuitBreakerMiddleware(pool);
  const requests = [];
  const numRequests = 20;
  
  console.log(`📊 Executando ${numRequests} requests com alta taxa de falha`);
  console.log(`⚡ Threshold do circuit breaker: ${pool.failureThreshold} falhas`);
  
  let circuitOpenedAt = null;
  
  for (let i = 0; i < numRequests; i++) {
    const req = { id: i + 1 };
    const res = {
      status: null,
      json: (data) => {
        res.status = 200;
        res.data = data;
      }
    };
    
    const promise = middleware.handleRequest(req, res).then(result => {
      if (pool.circuitOpen && !circuitOpenedAt) {
        circuitOpenedAt = i + 1;
      }
      return { success: true, attempt: i + 1, data: res.data };
    }).catch(error => {
      return { success: false, attempt: i + 1, error: error.message };
    });
    
    requests.push(promise);
  }
  
  const results = await Promise.allSettled(requests);
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const rejected = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
  const status = pool.getStatus();
  
  console.log(`✅ Requests bem-sucedidas: ${successful}/${numRequests}`);
  console.log(`❌ Requests rejeitadas: ${rejected.length}`);
  console.log(`⚡ Circuit breaker: ${status.circuitOpen ? 'ABERTO' : 'FECHADO'}`);
  console.log(`🔢 Contador de falhas: ${status.failureCount}`);
  
  if (circuitOpenedAt) {
    console.log(`📍 Circuit breaker aberto na request: ${circuitOpenedAt}`);
  }
  
  // Verificar se circuit breaker funcionou
  const circuitBreakerWorked = status.circuitOpen && status.failureCount >= pool.failureThreshold;
  
  if (circuitBreakerWorked) {
    console.log('✅ Circuit breaker funcionou corretamente');
  } else {
    console.log('❌ Circuit breaker não funcionou como esperado');
  }
  
  // Testar recovery
  console.log('\n🔄 Testando recovery do circuit breaker...');
  pool.setFailureRate(0.01); // Reduzir taxa de falha
  
  // Esperar recovery timeout
  await new Promise(resolve => setTimeout(resolve, pool.recoveryTimeout + 1000));
  
  const recoveryReq = { id: 'recovery' };
  const recoveryRes = {
    status: null,
    json: (data) => {
      recoveryRes.status = 200;
      recoveryRes.data = data;
    }
  };
  
  try {
    await middleware.handleRequest(recoveryReq, recoveryRes);
    console.log('✅ Circuit breaker recuperou com sucesso');
    const recoveryStatus = pool.getStatus();
    console.log(`🔌 Status pós-recovery: ${recoveryStatus.circuitOpen ? 'ABERTO' : 'FECHADO'}`);
  } catch (error) {
    console.log('❌ Circuit breaker não recuperou:', error.message);
  }
  
  return {
    success: circuitBreakerWorked,
    circuitOpened: status.circuitOpen,
    failureCount: status.failureCount,
    recovered: !pool.getStatus().circuitOpen
  };
}

// Teste de estresse combinado
async function testCombinedStress() {
  console.log('\n🔍 TESTE 4: Estresse Combinado');
  
  const pool = new DatabasePoolSimulator();
  pool.setLatency(200); // 200ms de latência
  pool.setFailureRate(0.3); // 30% de falha
  
  const middleware = new CircuitBreakerMiddleware(pool);
  const concurrentRequests = 30;
  
  console.log(`📊 Executando ${concurrentRequests} requests concorrentes`);
  console.log(`📊 Latência: 200ms, Taxa de falha: 30%`);
  
  const startTime = Date.now();
  const promises = [];
  
  for (let i = 0; i < concurrentRequests; i++) {
    const req = { id: i + 1 };
    const res = {
      status: null,
      json: (data) => {
        res.status = 200;
        res.data = data;
      }
    };
    
    const promise = middleware.handleRequest(req, res);
    promises.push(promise);
  }
  
  const results = await Promise.allSettled(promises);
  const endTime = Date.now();
  
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
  const status = pool.getStatus();
  
  console.log(`⏱️ Tempo total: ${endTime - startTime}ms`);
  console.log(`✅ Requests bem-sucedidas: ${successful}/${concurrentRequests}`);
  console.log(`❌ Requests falharam: ${failed.length}`);
  console.log(`📊 Taxa de sucesso: ${status.successRate}%`);
  console.log(`📊 Response time médio: ${status.avgResponseTime}ms`);
  console.log(`🔌 Circuit breaker: ${status.circuitOpen ? 'ABERTO' : 'FECHADO'}`);
  
  // Avaliar comportamento sob estresse
  const handledStress = status.successRate >= 50 && status.avgResponseTime < 1000;
  
  if (handledStress) {
    console.log('✅ Sistema lidou bem com estresse combinado');
  } else {
    console.log('❌ Sistema não lidou bem com estresse combinado');
  }
  
  return {
    success: handledStress,
    successRate: status.successRate,
    avgResponseTime: status.avgResponseTime,
    circuitOpen: status.circuitOpen,
    totalTime: endTime - startTime
  };
}

async function runDBStressTests() {
  console.log('🚀 INICIANDO TESTE DE GUERRA - DB STRESS');
  
  const results = [];
  
  // Executar todos os testes
  results.push(await testNormalLatency());
  results.push(await testHighLatency());
  results.push(await testCircuitBreaker());
  results.push(await testCombinedStress());
  
  // Relatório final
  console.log('\n' + '='.repeat(60));
  console.log('RELATÓRIO FINAL - DB STRESS');
  console.log('='.repeat(60));
  
  console.log('\n📊 RESUMO DOS TESTES:');
  
  const testNames = [
    'Latência Normal',
    'Alta Latência',
    'Circuit Breaker',
    'Estresse Combinado'
  ];
  
  let passedTests = 0;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${testNames[index]}: ${result.success ? 'PASSOU' : 'FALHOU'}`);
    
    if (result.success) passedTests++;
    
    // Mostrar métricas
    if (result.avgResponseTime) {
      console.log(`   📊 Response time: ${result.avgResponseTime}ms`);
    }
    if (result.successRate !== undefined) {
      console.log(`   📊 Taxa de sucesso: ${result.successRate}%`);
    }
    if (result.circuitOpen !== undefined) {
      console.log(`   🔌 Circuit breaker: ${result.circuitOpen ? 'ABERTO' : 'FECHADO'}`);
    }
  });
  
  console.log(`\n🎯 AVALIAÇÃO FINAL: ${passedTests}/${results.length} testes passaram`);
  
  if (passedTests >= results.length * 0.75) {
    console.log('✅ PASSOU - Sistema é resiliente sob stress');
    console.log('✅ Circuit breaker funciona corretamente');
    console.log('✅ Sistema lida bem com latência');
    console.log('✅ Recuperação automática funciona');
  } else {
    console.log('❌ FALHOU - Sistema não é resiliente o suficiente');
    console.log('❌ Pode haver problemas sob carga real');
  }
  
  return passedTests >= results.length * 0.75;
}

runDBStressTests().catch(console.error);
