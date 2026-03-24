/**
 * TESTE DE CONCORRÊNCIA EM GERAÇÃO DE NÚMERO DE PEDIDO
 * 
 * Este script testa a concorrência na geração de números de pedido
 * para verificar se o sistema está protegido contra race conditions.
 */

const axios = require('axios');

// Configuração
const API_URL = 'http://localhost:3001/api';
const TENANT_ID = 1;
const NUM_REQUESTS = 5; // Número de requisições concorrentes

// Token de autenticação (se necessário)
const AUTH_TOKEN = 'seu-token-aqui'; // Substitua pelo seu token

// Dados do pedido de teste
const pedidoTeste = {
  tenantId: TENANT_ID,
  vendedorId: 1,
  clienteId: 1,
  cliente: {
    nome: 'Cliente Teste Concorrência',
    telefone: '11999999999'
  },
  subtotal: 100.00,
  desconto: 0,
  frete: 0,
  total: 100.00,
  formaPagamento: 'DINHEIRO',
  itens: [
    {
      tipo: 'LIVRE', // Usando LIVRE para não afetar estoque
      descricao: 'Produto Teste Concorrência',
      quantidade: 1,
      valorUnitario: 100.00,
      custo: 50.00
    }
  ]
};

// Função para criar um pedido
async function createPedido(index) {
  try {
    console.log(`[${index}] Iniciando criação de pedido`);
    
    // Adicionar um identificador único para cada pedido
    const pedidoData = {
      ...pedidoTeste,
      observacoes: `Teste concorrência #${index} - ${Date.now()}`
    };
    
    const response = await axios.post(`${API_URL}/pedidos`, pedidoData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    console.log(`[${index}] Pedido criado: ${JSON.stringify(response.data)}`);
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

// Função principal para testar concorrência
async function testConcurrency() {
  // Criar array de promessas para requisições concorrentes
  const promises = [];
  
  // Criar múltiplos pedidos em paralelo
  for (let i = 0; i < NUM_REQUESTS; i++) {
    promises.push(createPedido(i));
  }
  
  // Executar todas as requisições em paralelo
  console.log(`Executando ${NUM_REQUESTS} requisições em paralelo...`);
  const results = await Promise.all(promises);
  
  // Analisar resultados
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  console.log('\n=== RESULTADOS ===');
  console.log(`Total de requisições: ${NUM_REQUESTS}`);
  console.log(`Sucesso: ${successCount}`);
  console.log(`Falhas: ${failureCount}`);
  
  // Verificar se houve números de pedido duplicados
  const numeros = results
    .filter(r => r.success && r.data && r.data.numero)
    .map(r => r.data.numero);
  
  const numerosUnicos = [...new Set(numeros)];
  
  console.log(`\nNúmeros de pedido gerados: ${numeros.join(', ')}`);
  console.log(`Números únicos: ${numerosUnicos.length}`);
  
  if (numeros.length === numerosUnicos.length) {
    console.log('\n✅ TESTE PASSOU: Todos os números de pedido são únicos!');
  } else {
    console.log('\n❌ TESTE FALHOU: Existem números de pedido duplicados!');
    
    // Identificar duplicatas
    const contagem = {};
    numeros.forEach(n => {
      contagem[n] = (contagem[n] || 0) + 1;
    });
    
    const duplicatas = Object.entries(contagem)
      .filter(([_, count]) => count > 1)
      .map(([numero, count]) => `${numero} (${count}x)`);
    
    console.log(`Duplicatas: ${duplicatas.join(', ')}`);
  }
}

// Executar o teste
testConcurrency().catch(console.error);