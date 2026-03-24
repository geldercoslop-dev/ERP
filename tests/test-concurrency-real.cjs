#!/usr/bin/env node

/**
 * TESTE CONCORRÊNCIA - VERSÃO JS PURA
 * 🔐 10 Requests Simultâneos com Validação
 */

const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:3004';
const TRPC_ENDPOINT = '/api/trpc/pedidos.createVenda';

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

async function makeRequest(requestNum, idempotencyKey, payload) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(TRPC_ENDPOINT, BASE_URL);
    
    const postData = JSON.stringify({
      json: payload,
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: TRPC_ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        console.log(`  [REQ ${requestNum}] Status ${res.statusCode} | ${responseTime}ms`);
        
        try {
          const parsed = JSON.parse(data);
          const result = parsed?.result?.data ?? parsed;
          
          resolve({
            status: res.statusCode === 200 ? 'SUCCESS' : 'ERROR',
            pedidoId: result?.pedidoId,
            numero: result?.numero,
            isDuplicate: result?.isDuplicate ?? result?.fromMemoryCache ?? false,
            responseTime,
            error: null,
          });
        } catch (e) {
          resolve({
            status: 'ERROR',
            responseTime,
            error: 'Invalid JSON response',
          });
        }
      });
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      console.log(`  [REQ ${requestNum}] ❌ Erro (${responseTime}ms): ${error.message}`);
      
      resolve({
        status: 'ERROR',
        responseTime,
        error: error.message,
      });
    });

    req.write(postData);
    req.end();
  });
}

async function runTest() {
  console.log('📊 TESTE DE CONCORRÊNCIA REAL - ERP PEDIDOS');
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log('-------------------------------------------\n');

  const idempotencyKey = generateId();
  
  const payload = {
    cliente: {
      nome: `Cliente ${Date.now()}`,
      telefone: '11999999999',
    },
    subtotal: 100.00,
    desconto: 0,
    frete: 10.00,
    total: 110.00,
    itens: [
      {
        tipo: 'LIVRE',
        descricao: 'Produto Teste para Concorrência',
        quantidade: 1,
        valorUnitario: 100.00,
        custo: 50.00,
        prazoGarantia: 0,
      }
    ],
    idempotencyKey,
  };

  console.log(`🔄 Enviando 10 requisições simultâneas com idempotencyKey: ${idempotencyKey}\n`);

  const startTime = Date.now();
  
  // Criar 10 requisições simultâneas
  const promises = Array.from({ length: 10 }, (_, i) => {
    console.log(`  [REQ ${i + 1}] Enviando...`);
    return makeRequest(i + 1, idempotencyKey, payload);
  });

  // Aguardar todas
  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;

  // Análise
  console.log('\n-------------------------------------------');
  console.log('📊 RESULTADOS');
  console.log('-------------------------------------------\n');

  const sucessos = results.filter(r => r.status === 'SUCCESS');
  const duplicatas = sucessos.filter(r => r.isDuplicate);
  const novos = sucessos.filter(r => !r.isDuplicate);

  const pedidoIds = new Set(sucessos.map(r => r.pedidoId).filter(Boolean));
  const numeros = new Set(sucessos.map(r => r.numero).filter(Boolean));

  console.log(`⏱️  Tempo total: ${totalTime}ms`);
  console.log(`✅ Sucessos: ${sucessos.length}/10`);
  console.log(`🔁 Duplicatas (cache): ${duplicatas.length}`);
  console.log(`📝 Novos pedidos: ${novos.length}`);
  console.log(`🎯 Pedidos únicos: ${pedidoIds.size}`);
  console.log(`🔢 Números únicos: ${numeros.size}\n`);

  // Validações
  console.log('🔍 VALIDAÇÕES:');
  const checks = [
    { ok: pedidoIds.size === 1, msg: '✅ Apenas 1 pedido criado' },
    { ok: duplicatas.length === 9 || duplicatas.length === 10, msg: '✅ Demais retornam do cache' },
    { ok: numeros.size === 1, msg: '✅ Número único' },
    { ok: totalTime < 10000, msg: '✅ Tempo < 10s' },
  ];

  let allPassed = true;
  checks.forEach(check => {
    console.log(`  ${check.ok ? '✅' : '❌'} ${check.msg}`);
    if (!check.ok) allPassed = false;
  });

  console.log('\n-------------------------------------------');
  console.log(allPassed ? '🎉 TESTE PASSOU!' : '❌ TESTE FALHOU!');
  console.log('-------------------------------------------\n');

  // Lista de pedidos
  console.log('📋 DETALHES:');
  sucessos.forEach((r, i) => {
    console.log(`  ${r.isDuplicate ? '🔁' : '📝'} REQ ${i + 1} | Pedido #${r.numero} (ID: ${r.pedidoId})`);
  });

  process.exit(allPassed ? 0 : 1);
}

// Inicia teste
runTest().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
