/**
 * TESTE DE CONCORRÊNCIA EM ESTOQUE
 * 
 * Este script testa a concorrência em operações de estoque
 * para verificar se o sistema está protegido contra race conditions.
 */

const axios = require('axios');

// Configuração
const API_URL = 'http://localhost:3001/api';
const PRODUTO_ID = 1; // Altere para um ID válido no seu banco
const TENANT_ID = 1;
const NUM_REQUESTS = 5; // Número de requisições concorrentes
const QUANTIDADE = 1; // Quantidade a ser alterada em cada requisição

// Token de autenticação (se necessário)
const AUTH_TOKEN = 'seu-token-aqui'; // Substitua pelo seu token

// Função para fazer uma operação de estoque
async function updateStock(tipo, quantidade, index) {
  try {
    console.log(`[${index}] Iniciando operação ${tipo} de ${quantidade} unidades para produto ${PRODUTO_ID}`);
    
    const response = await axios.post(`${API_URL}/stock/update`, {
      tenantId: TENANT_ID,
      produtoId: PRODUTO_ID,
      quantidade,
      tipo,
      motivo: `Teste concorrência #${index}`
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    console.log(`[${index}] Resposta: ${JSON.stringify(response.data)}`);
    return {
      success: true,
      index,
      data: response.data
    };
  } catch (error) {
    console.error(`[${index}] Erro: ${error.response?.data?.message || error.message}`);
    return {
      success: false,
      index,
      error: error.response?.data || error.message
    };
  }
}

// Função para verificar o estoque atual
async function checkStock() {
  try {
    const response = await axios.get(`${API_URL}/stock/check/${PRODUTO_ID}`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    return response.data;
  } catch (error) {
    console.error(`Erro ao verificar estoque: ${error.message}`);
    return null;
  }
}

// Função principal para testar concorrência
async function testConcurrency() {
  // Verificar estoque inicial
  const initialStock = await checkStock();
  console.log(`Estoque inicial: ${JSON.stringify(initialStock)}`);
  
  if (!initialStock) {
    console.error('Não foi possível obter o estoque inicial. Abortando teste.');
    return;
  }
  
  // Criar array de promessas para requisições concorrentes
  const promises = [];
  
  // Metade das operações será de entrada, metade de saída
  for (let i = 0; i < NUM_REQUESTS; i++) {
    const tipo = i % 2 === 0 ? 'entrada' : 'saida';
    promises.push(updateStock(tipo, QUANTIDADE, i));
  }
  
  // Executar todas as requisições em paralelo
  console.log(`Executando ${NUM_REQUESTS} requisições em paralelo...`);
  const results = await Promise.all(promises);
  
  // Verificar estoque final
  const finalStock = await checkStock();
  console.log(`Estoque final: ${JSON.stringify(finalStock)}`);
  
  // Analisar resultados
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  console.log('\n=== RESULTADOS ===');
  console.log(`Total de requisições: ${NUM_REQUESTS}`);
  console.log(`Sucesso: ${successCount}`);
  console.log(`Falhas: ${failureCount}`);
  
  // Verificar se o estoque final está correto
  const expectedChange = results.reduce((acc, result) => {
    if (result.success) {
      const tipo = result.index % 2 === 0 ? 'entrada' : 'saida';
      return tipo === 'entrada' ? acc + QUANTIDADE : acc - QUANTIDADE;
    }
    return acc;
  }, 0);
  
  const expectedStock = initialStock.saldo + expectedChange;
  console.log(`\nEstoque inicial: ${initialStock.saldo}`);
  console.log(`Alteração esperada: ${expectedChange}`);
  console.log(`Estoque esperado: ${expectedStock}`);
  console.log(`Estoque final real: ${finalStock.saldo}`);
  
  if (expectedStock === finalStock.saldo) {
    console.log('\n✅ TESTE PASSOU: Estoque final está correto!');
  } else {
    console.log('\n❌ TESTE FALHOU: Estoque final não corresponde ao esperado!');
    console.log(`Diferença: ${finalStock.saldo - expectedStock}`);
  }
}

// Executar o teste
testConcurrency().catch(console.error);