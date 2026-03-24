#!/usr/bin/env node

/**
 * DEBUG: Verificar requisição createVenda
 */

const http = require('http');

// Primeiro fazer login
const loginPayload = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

let cookies = '';

const loginReq = http.request({
  hostname: 'localhost',
  port: 3004,
  path: '/api/trpc/auth.login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginPayload),
  },
}, (res) => {
  const setCookie = res.headers['set-cookie'];
  if (Array.isArray(setCookie)) {
    cookies = setCookie.map(c => c.split(';')[0]).join('; ');
  }

  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('✅ Login OK, cookies:', cookies.slice(0, 40));

    // Agora fazer createVenda
    setTimeout(() => {
      testCreateVenda();
    }, 500);
  });
});

loginReq.write(loginPayload);
loginReq.end();

function testCreateVenda() {
  console.log('\nTestando createVenda...');
  
  const payload = JSON.stringify({
    vendedorId: 1,
    cliente: { nome: 'Test', telefone: '1199999999' },
    subtotal: 100.00,
    desconto: 0,
    frete: 10.00,
    total: 110.00,
    itens: [{
      tipo: 'LIVRE',
      descricao: 'Test',
      quantidade: 1,
      valorUnitario: 100.00,
      custo: 50.00,
      prazoGarantia: 0,
    }],
    idempotencyKey: 'debug-' + Date.now(),
  });

  const req = http.request({
    hostname: 'localhost',
    port: 3004,
    path: '/api/trpc/pedidos.createVenda',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Cookie': cookies,
    },
  }, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2).slice(0, 300));
    
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('Body:');
      try {
        const json = JSON.parse(data);
        console.log(JSON.stringify(json, null, 2).slice(0, 500));
      } catch (e) {
        console.log(data.slice(0, 300));
      }
    });
  });

  req.on('error', (e) => {
    console.error('Error:', e.message);
  });

  req.write(payload);
  req.end();
}
