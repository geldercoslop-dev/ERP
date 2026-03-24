#!/usr/bin/env node

/**
 * DEBUG: Verificar resposta do login
 */

const http = require('http');

const payload = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

const req = http.request({
  hostname: 'localhost',
  port: 3004,
  path: '/api/trpc/auth.login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
}, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Body:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(payload);
req.end();
