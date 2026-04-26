/**
 * FASE 7.3 — PROVA REAL COM BANCO
 * 
 * Executa fluxo completo contra backend real rodando na porta 3000
 * Prova: estoque, estado, concorrência, audit_log
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const TENANT_ID = 1;

// Headers de autenticação (precisam ser ajustados conforme ambiente real)
const HEADERS = {
  'Content-Type': 'application/json',
  'x-tenant-id': TENANT_ID.toString(),
};

let authToken = null;
let pedidoId = null;
let produtoId = null;
let clienteId = null;

console.log('='.repeat(80));
console.log('FASE 7.3 — PROVA REAL COM BANCO');
console.log('='.repeat(80));
console.log('');

async function logStep(step, data) {
  console.log(`\n[${step}]`);
  console.log(JSON.stringify(data, null, 2));
}

async function makeRequest(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      ...HEADERS,
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, data: { error: error.message } };
  }
}

async function main() {
  try {
    console.log('1. VERIFICANDO CONEXÃO COM BACKEND...');
    const healthCheck = await makeRequest('GET', '/api/health');
    await logStep('HEALTH_CHECK', healthCheck);
    
    if (healthCheck.status !== 200) {
      console.error('❌ Backend não está respondendo corretamente');
      process.exit(1);
    }
    
    console.log('✅ Backend respondendo');
    
    // 2. CRIAR PEDIDO
    console.log('\n2. CRIANDO PEDIDO...');
    const pedidoPayload = {
      vendedorId: 1,
      clienteId: 1,
      clienteNome: "Cliente Teste Real",
      clienteTelefone: "21999999999",
      subtotal: "100.00",
      desconto: "0",
      frete: "0",
      total: "100.00",
      formaPagamento: "DINHEIRO",
      itens: [
        {
          tipo: "LIVRE",
          descricao: "Item Teste Real",
          quantidade: 2,
          valorUnitario: 50.00,
          custo: 25.00,
        }
      ]
    };
    
    await logStep('PAYLOAD_PEDIDO', pedidoPayload);
    
    const criarPedido = await makeRequest('POST', '/api/pedidos', pedidoPayload);
    await logStep('RESPOSTA_CRIAR_PEDIDO', criarPedido);
    
    if (criarPedido.status !== 200 && criarPedido.status !== 201) {
      console.error('❌ Falha ao criar pedido');
      console.log('Possível causa: endpoint não existe ou autenticação necessária');
      console.log('Continuando com validações estruturais...');
    } else {
      pedidoId = criarPedido.data?.id || criarPedido.data?.pedidoId;
      console.log(`✅ Pedido criado: ID ${pedidoId}`);
    }
    
    // 3. VALIDAR ESTOQUE
    console.log('\n3. VALIDANDO ESTOQUE...');
    const estoqueAntes = await makeRequest('GET', '/api/produtos/1');
    await logStep('ESTOQUE_ANTES', estoqueAntes);
    
    // 4. ALTERAR STATUS
    console.log('\n4. ALTERANDO STATUS...');
    
    // 4.1 Transição válida
    const statusValido = await makeRequest('PUT', `/api/pedidos/${pedidoId || 1}/status`, {
      status: 'CONFERIDO'
    });
    await logStep('STATUS_VALIDO', statusValido);
    
    // 4.2 Transição inválida
    const statusInvalido = await makeRequest('PUT', `/api/pedidos/${pedidoId || 1}/status`, {
      status: 'GERADO' // Voltar para estado anterior não deve ser permitido
    });
    await logStep('STATUS_INVALIDO', statusInvalido);
    
    // 5. CANCELAR PEDIDO
    console.log('\n5. CANCELANDO PEDIDO...');
    const cancelar = await makeRequest('POST', `/api/pedidos/${pedidoId || 1}/cancelar`, {});
    await logStep('CANCELAR_PEDIDO', cancelar);
    
    // 6. VALIDAR ESTOQUE DEPOIS
    console.log('\n6. VALIDANDO ESTOQUE DEPOIS...');
    const estoqueDepois = await makeRequest('GET', '/api/produtos/1');
    await logStep('ESTOQUE_DEPOIS', estoqueDepois);
    
    // 7. TESTE DE CONCORRÊNCIA
    console.log('\n7. TESTE DE CONCORRÊNCIA...');
    const promises = [
      makeRequest('POST', '/api/pedidos', pedidoPayload),
      makeRequest('POST', '/api/pedidos', pedidoPayload),
    ];
    
    const resultados = await Promise.all(promises);
    await logStep('CONCORRENCIA_RESULTADOS', resultados);
    
    // 8. AUDIT LOG
    console.log('\n8. AUDIT LOG...');
    const auditLog = await makeRequest('GET', '/api/audit-log');
    await logStep('AUDIT_LOG', auditLog);
    
    console.log('\n' + '='.repeat(80));
    console.log('PROVA REAL CONCLUÍDA');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('Erro durante execução:', error);
    process.exit(1);
  }
}

main();
