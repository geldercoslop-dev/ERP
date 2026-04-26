/**
 * TESTE REAL DE CONCORRÊNCIA VIA HTTP - 20 EXECUÇÕES SIMULTÂNEAS
 * 
 * Este teste simula 20 requests simultâneos via HTTP para criar pedidos
 * com potencial de conflito (mesmo produto, mesmo cliente)
 * e verifica se o sistema mantém consistência
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Carregar .env
dotenv.config();

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || process.argv[2] || 1;
const NUM_CONCURRENT_REQUESTS = 20;

console.log(`📋 API URL: ${API_BASE_URL}`);
console.log(`📋 Tenant ID: ${TENANT_ID}`);
console.log(`📋 Requisições simultâneas: ${NUM_CONCURRENT_REQUESTS}`);

// Payload controlado - mesmo produto para gerar potencial conflito de estoque
const pedidoData = {
  vendedorId: 1,
  clienteId: 1,
  cliente: {
    nome: 'Cliente Teste Concorrência',
    telefone: '11999999999',
    rua: 'Rua Teste',
    numero: '123',
    bairro: 'Centro',
    cidade: 'São Paulo',
    uf: 'SP'
  },
  subtotal: 100.00,
  desconto: 0,
  frete: 0,
  total: 100.00,
  formaPagamento: 'DINHEIRO',
  itens: [
    {
      tipo: 'CATALOGO',
      produtoId: 1,
      descricao: 'Produto Teste Concorrência',
      quantidade: 1,
      valorUnitario: 100.00,
      custo: 50.00
    }
  ]
};

async function createPedido() {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/pedidos`, pedidoData, {
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID
      },
      timeout: 30000
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runTest() {
  console.log('\n🧪 INICIANDO TESTE REAL DE CONCORRÊNCIA (20 EXECUÇÕES)...');
  
  const startTime = Date.now();
  
  // 🔄 SIMULAR 20 REQUESTS SIMULTÂNEOS
  console.log('🚀 Enviando 20 requests simultâneos...');
  
  const promises = Array.from({ length: NUM_CONCURRENT_REQUESTS }, () => createPedido());
  const results = await Promise.allSettled(promises);
  const duration = Date.now() - startTime;
  
  console.log(`⏱️  Tempo total: ${duration}ms`);
  console.log('📊 RESULTADOS:');
  
  const successfulResults = [];
  const failedResults = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        successfulResults.push(result.value.data);
        console.log(`Request ${index + 1}:`, {
          success: true,
          pedidoId: result.value.data.pedidoId,
          numero: result.value.data.numero
        });
      } else {
        failedResults.push(result.value.error);
        console.log(`Request ${index + 1} ERROR:`, result.value.error);
      }
    } else {
      failedResults.push(result.reason);
      console.log(`Request ${index + 1} REJECTED:`, result.reason);
    }
  });
  
  // 🎯 VERIFICAR RESULTADO ESPERADO
  const successfulCount = successfulResults.length;
  const failedCount = failedResults.length;
  
  console.log('\n🔍 ANÁLISE:');
  console.log(`✅ Requests bem-sucedidos: ${successfulCount}`);
  console.log(`❌ Requests falhados: ${failedCount}`);
  
  // Verificar duplicação de números
  const numeros = successfulResults.map((r) => r.numero);
  const uniqueNumeros = new Set(numeros);
  console.log(`🔢 Números gerados: ${numeros.length}`);
  console.log(`🔢 Números únicos: ${uniqueNumeros.size}`);
  
  if (numeros.length !== uniqueNumeros.size) {
    console.log('❌ DUPLICAÇÃO DE NÚMEROS DETECTADA!');
    const duplicates = numeros.filter((n, i) => numeros.indexOf(n) !== i);
    console.log('Números duplicados:', duplicates);
  }
  
  // Conclusão
  console.log('\n📋 CONCLUSÃO:');
  const hasDuplication = numeros.length !== uniqueNumeros.size;
  if (!hasDuplication && successfulCount > 0) {
    console.log('✅ SISTEMA CONSISTENTE - Sem duplicação de números');
  } else if (hasDuplication) {
    console.log('❌ PROBLEMA ENCONTRADO - Duplicação de números detectada');
  } else {
    console.log('⚠️ Nenhum pedido criado - possivelmente erro de validação ou API não disponível');
  }
  
  return {
    success: true,
    successfulCount,
    failedCount,
    numerosGerados: numeros.length,
    numerosUnicos: uniqueNumeros.size,
    duration,
    hasDuplication
  };
}

// Executar teste
runTest().then((result) => {
  console.log('\n🎯 TESTE FINALIZADO');
  process.exit(result.success && !result.hasDuplication ? 0 : 1);
}).catch((error) => {
  console.error('💥 Erro fatal:', error);
  process.exit(1);
});
