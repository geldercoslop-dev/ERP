/**
 * Script para testar o sistema de monitoramento
 * 
 * Simula erros e requisições para validar o sistema de logs e alertas
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração
const API_URL = process.env.API_URL || 'http://localhost:3003';
const NUM_REQUESTS = 50;
const DELAY_BETWEEN_REQUESTS = 100; // ms

// Função para esperar um tempo
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para fazer uma requisição com um requestId
async function makeRequest(path, options = {}) {
  try {
    const requestId = Math.random().toString(36).substring(2, 12);
    const response = await axios({
      url: `${API_URL}${path}`,
      method: options.method || 'GET',
      headers: {
        'X-Request-ID': requestId,
        'User-Agent': 'MonitoringTest/1.0',
        ...options.headers
      },
      params: options.params,
      data: options.data,
      timeout: options.timeout || 5000
    });
    
    return {
      success: true,
      status: response.status,
      data: response.data,
      requestId
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 0,
      error: error.message,
      data: error.response?.data
    };
  }
}

// Função para simular um erro específico várias vezes
async function simulateRepeatedError(path, count = 10) {
  console.log(`\nSimulando ${count} erros no endpoint ${path}...`);
  
  const results = [];
  for (let i = 0; i < count; i++) {
    const result = await makeRequest(path);
    results.push(result);
    console.log(`  Requisição ${i+1}/${count}: ${result.success ? 'Sucesso' : 'Erro'} (${result.status})`);
    await sleep(DELAY_BETWEEN_REQUESTS);
  }
  
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.length - successCount;
  
  console.log(`Resultado: ${successCount} sucessos, ${errorCount} erros`);
  return results;
}

// Função para simular uma requisição lenta
async function simulateSlowRequest(path) {
  console.log(`\nSimulando requisição lenta para ${path}...`);
  
  const result = await makeRequest(`${path}?delay=12000`, { timeout: 15000 });
  
  console.log(`Resultado: ${result.success ? 'Sucesso' : 'Erro'} (${result.status})`);
  if (!result.success) {
    console.log(`  Erro: ${result.error}`);
    if (result.data) {
      console.log(`  Detalhes: ${JSON.stringify(result.data)}`);
    }
  }
  
  return result;
}

// Função para testar o health check
async function testHealthCheck() {
  console.log('\nTestando health check...');
  
  const result = await makeRequest('/health');
  
  console.log(`Resultado: ${result.success ? 'Sucesso' : 'Erro'} (${result.status})`);
  if (result.success) {
    console.log(`  Status: ${result.data.status}`);
    console.log(`  Checks: ${Object.keys(result.data.checks).join(', ')}`);
  }
  
  return result;
}

// Função para testar as métricas
async function testMetrics() {
  console.log('\nTestando métricas...');
  
  const result = await makeRequest('/api/metrics');
  
  console.log(`Resultado: ${result.success ? 'Sucesso' : 'Erro'} (${result.status})`);
  if (result.success) {
    console.log(`  Requests: ${result.data.requests.total}`);
    console.log(`  Avg Response Time: ${result.data.requests.averageResponseTime}ms`);
    console.log(`  Error Rate: ${result.data.requests.errorRate}%`);
  }
  
  return result;
}

// Função principal
async function runTests() {
  console.log('Iniciando testes de monitoramento...');
  console.log(`API URL: ${API_URL}`);
  
  // Testar health check
  await testHealthCheck();
  
  // Simular erros repetidos para testar sistema de alertas
  await simulateRepeatedError('/api/non-existent-endpoint', 10);
  
  // Simular requisição lenta para testar timeout
  await simulateSlowRequest('/api/slow-endpoint');
  
  // Testar métricas após os testes
  await testMetrics();
  
  console.log('\nTestes concluídos!');
}

// Executar testes
runTests().catch(error => {
  console.error('Erro ao executar testes:', error);
  process.exit(1);
});