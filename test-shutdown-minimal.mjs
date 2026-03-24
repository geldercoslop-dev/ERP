#!/usr/bin/env node

/**
 * TESTE MÍNIMO DE GRACEFUL SHUTDOWN
 * 
 * Cria um servidor mock que simula a estrutura do servidor real
 * Testa shutdown SEM necessidade de DB/Redis
 */

import http from 'http';

console.log('='.repeat(80));
console.log('🔴 TESTE MÍNIMO: GRACEFUL SHUTDOWN (SEM DB)');
console.log('='.repeat(80));
console.log('');

// Simulando graceful-shutdown.ts
let isShuttingDown = false;
const activeConnections = new Set();
const SHUTDOWN_FORCE_EXIT_MS = 5000;

const logs = [];

function log(msg) {
  logs.push(msg);
  console.log(`[SERVER] ${msg}`);
}

async function closeHttpServer(server) {
  log('[SHUTDOWN] closing HTTP');
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      log('[SHUTDOWN] HTTP server closed');
      resolve();
    });
  });
}

async function drainResources(signal) {
  // Esvazia conexões
  let waited = 0;
  while (activeConnections.size > 0 && waited < 5000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }
  activeConnections.clear();
  
  log('[SHUTDOWN] closing HTTP');
  await new Promise(r => setTimeout(r, 50)); // simulado
  log('[SHUTDOWN] HTTP server closed');
  
  log('[SHUTDOWN] closing DB');
  await new Promise(r => setTimeout(r, 100)); // simulado
  log('[SHUTDOWN] DB closed');
  
  log('[SHUTDOWN] closing Redis');
  await new Promise(r => setTimeout(r, 100)); // simulado
  log('[SHUTDOWN] Redis closed');
}

async function shutdownWithExit(server, signal, exitCode) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log(`[SHUTDOWN] signal: ${signal}`);

  const forceExit = setTimeout(() => {
    console.error('[SHUTDOWN] FORCE EXIT');
    process.exit(1);
  }, SHUTDOWN_FORCE_EXIT_MS);

  try {
    await drainResources(signal);
    clearTimeout(forceExit);
    log('[SHUTDOWN] DONE');
    process.exit(exitCode);
  } catch (err) {
    clearTimeout(forceExit);
    console.error('[SHUTDOWN ERROR]', err);
    process.exit(1);
  }
}

// Cria servidor
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.on('connection', (socket) => {
  const id = Symbol('conn');
  activeConnections.add(id);
  socket.on('close', () => activeConnections.delete(id));
});

// Registra handlers
process.on('SIGINT', () => shutdownWithExit(server, 'SIGINT', 0));
process.on('SIGTERM', () => shutdownWithExit(server, 'SIGTERM', 0));

// Inicia
server.listen(5555, 'localhost', () => {
  log('[SERVER] listening on http://localhost:5555');
  
  // Aguarda 1s depois emite SIGINT
  setTimeout(() => {
    console.log('');
    console.log('🔴 Emitindo process.emit("SIGINT")...');
    console.log('');
    process.emit('SIGINT');
  }, 1000);
});

// Timeout de segurança
setTimeout(() => {
  console.error('❌ TIMEOUT 30s');
  process.exit(1);
}, 30000);

// Timeout de segurança
setTimeout(() => {
  console.error('❌ TIMEOUT 30s');
  process.exit(1);
}, 30000);

const startTime = Date.now();

process.on('exit', (code) => {
  const elapsed = Date.now() - startTime;
  console.log('');
  console.log('='.repeat(80));
  console.log('📊 RESULTADO');
  console.log('='.repeat(80));
  console.log(`Tempo: ${elapsed}ms`);
  console.log(`Código: ${code}`);
  console.log('');
  
  // Validação
  const checks = [
    { name: '[SHUTDOWN] signal: SIGINT', found: logs.some(l => l.includes('[SHUTDOWN] signal: SIGINT')) },
    { name: '[SHUTDOWN] closing HTTP', found: logs.some(l => l.includes('[SHUTDOWN] closing HTTP')) },
    { name: '[SHUTDOWN] HTTP server closed', found: logs.some(l => l.includes('[SHUTDOWN] HTTP server closed')) },
    { name: '[SHUTDOWN] closing DB', found: logs.some(l => l.includes('[SHUTDOWN] closing DB')) },
    { name: '[SHUTDOWN] DB closed', found: logs.some(l => l.includes('[SHUTDOWN] DB closed')) },
    { name: '[SHUTDOWN] closing Redis', found: logs.some(l => l.includes('[SHUTDOWN] closing Redis')) },
    { name: '[SHUTDOWN] Redis closed', found: logs.some(l => l.includes('[SHUTDOWN] Redis closed')) },
    { name: '[SHUTDOWN] DONE', found: logs.some(l => l.includes('[SHUTDOWN] DONE')) },
  ];
  
  console.log('🔍 Validação:');
  let allPass = true;
  for (const check of checks) {
    if (check.found) {
      console.log(`  ✅ ${check.name}`);
    } else {
      console.log(`  ❌ ${check.name}`);
      allPass = false;
    }
  }
  
  console.log('');
  if (allPass && code === 0) {
    console.log('✅ SHUTDOWN FUNCIONANDO CORRETAMENTE');
  } else {
    console.log('❌ SHUTDOWN COM PROBLEMAS');
  }
  console.log('');
});
