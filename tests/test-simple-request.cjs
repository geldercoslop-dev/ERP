#!/usr/bin/env node

/**
 * TESTE SIMPLES - UMA ÚNICA REQUISIÇÃO
 */

const http = require('http');

const payload = {
  json: {
    cliente: { nome: 'Test Cliente', telefone: '1199999999' },
    subtotal: 100.00,
    desconto: 0,
    frete: 10.00,
    total: 110.00,
    itens: [{
      tipo: 'LIVRE',
      descricao: 'Test Item',
      quantidade: 1,
      valorUnitario: 100.00,
      custo: 50.00,
      prazoGarantia: 0,
    }],
    idempotencyKey: 'test-' + Date.now(),
  }
};

const postData = JSON.stringify(payload);

const req = http.request({
  hostname: 'localhost',
  port: 3004,
  path: '/api/trpc/pedidos.createVenda',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
}, (res) => {
  console.log('✅ Response Status:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response Body:');
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(data.slice(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Error:', e.message);
});

req.on('timeout', () => {
  console.error('❌ Timeout');
  req.destroy();
});

console.log('📤 Enviando request...');
req.write(postData);
req.end();
