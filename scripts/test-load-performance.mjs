/**
 * Script para testar a carga e validar os tempos de resposta
 */
import axios from 'axios';
import dotenv from 'dotenv';
import { performance } from 'perf_hooks';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração
const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TENANT_ID = process.env.TENANT_ID || '1';
const NUM_CONCURRENT_REQUESTS = 10;
const NUM_ITERATIONS = 5;

// Cliente HTTP com token de autenticação
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Função para medir o tempo de resposta de uma requisição
async function measureRequestTime(endpoint, params = {}) {
  const start = performance.now();
  try {
    await apiClient.get(endpoint, { params });
    const end = performance.now();
    return { time: end - start, success: true };
  } catch (error) {
    const end = performance.now();
    return { time: end - start, success: false, error: error.message };
  }
}

// Função para executar múltiplas requisições em paralelo
async function runConcurrentRequests(endpoint, params = {}, concurrency = NUM_CONCURRENT_REQUESTS) {
  const requests = [];
  for (let i = 0; i < concurrency; i++) {
    requests.push(measureRequestTime(endpoint, params));
  }
  return Promise.all(requests);
}

// Função para calcular estatísticas de tempo
function calculateStats(results) {
  const times = results.filter(r => r.success).map(r => r.time);
  const failures = results.filter(r => !r.success).length;
  
  if (times.length === 0) return { min: 0, max: 0, avg: 0, p95: 0, failures };
  
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
  
  // Percentil 95
  const sortedTimes = [...times].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedTimes.length * 0.95);
  const p95 = sortedTimes[p95Index];
  
  return { min, max, avg, p95, failures };
}

// Função para formatar o tempo em ms
function formatTime(ms) {
  return `${ms.toFixed(2)}ms`;
}

// Função para executar os testes
async function runTests() {
  console.log('Iniciando testes de carga e performance...');
  console.log(`API URL: ${API_BASE_URL}`);
  console.log(`Requisições concorrentes: ${NUM_CONCURRENT_REQUESTS}`);
  console.log(`Número de iterações: ${NUM_ITERATIONS}`);
  console.log('---------------------------------------------------');
  
  // Lista de endpoints para testar
  const endpoints = [
    {
      name: 'Listar Produtos (Paginado)',
      endpoint: '/api/produtos/paginado',
      params: { tenantId: TENANT_ID, page: 1, pageSize: 20 }
    },
    {
      name: 'Listar Pedidos',
      endpoint: '/api/pedidos',
      params: { tenantId: TENANT_ID, page: 1, pageSize: 20 }
    },
    {
      name: 'Listar Contas a Receber',
      endpoint: '/api/financeiro/contas-receber',
      params: { tenantId: TENANT_ID, page: 1, pageSize: 20 }
    },
    {
      name: 'Listar Promoções',
      endpoint: '/api/promocoes',
      params: { tenantId: TENANT_ID, page: 1, pageSize: 20 }
    }
  ];
  
  // Executar testes para cada endpoint
  for (const { name, endpoint, params } of endpoints) {
    console.log(`\nTestando: ${name} (${endpoint})`);
    
    const allResults = [];
    
    // Executar múltiplas iterações
    for (let i = 0; i < NUM_ITERATIONS; i++) {
      console.log(`Iteração ${i + 1}/${NUM_ITERATIONS}...`);
      const results = await runConcurrentRequests(endpoint, params);
      allResults.push(...results);
      
      // Pequena pausa entre iterações para não sobrecarregar
      if (i < NUM_ITERATIONS - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Calcular estatísticas
    const stats = calculateStats(allResults);
    
    console.log('Resultados:');
    console.log(`  Requisições: ${allResults.length} total, ${allResults.length - stats.failures} sucesso, ${stats.failures} falhas`);
    console.log(`  Tempo mínimo: ${formatTime(stats.min)}`);
    console.log(`  Tempo máximo: ${formatTime(stats.max)}`);
    console.log(`  Tempo médio: ${formatTime(stats.avg)}`);
    console.log(`  Percentil 95: ${formatTime(stats.p95)}`);
  }
}

// Executar os testes
runTests().catch(error => {
  console.error('Erro ao executar testes:', error);
  process.exit(1);
});