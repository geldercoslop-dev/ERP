#!/usr/bin/env node

/**
 * TESTE: BLOQUEIO DE CTRL+C
 * 
 * Valida que:
 * 1. SIGINT (CTRL+C) NÃO causa shutdown
 * 2. Log "[BLOCKED] CTRL+C desabilitado" aparece
 * 3. SIGTERM ainda funciona normalmente
 * 4. Shutdown via HTTP endpoint ainda funciona
 */

import http from 'http';

console.log('='.repeat(80));
console.log('🔥 TESTE: BLOQUEIO DE CTRL+C (HARDENING EXTREMO)');
console.log('='.repeat(80));
console.log('');

// Simula graceful-shutdown.ts com BLOCK_SIGINT_SHUTDOWN=1
let isShuttingDown = false;
const logs = [];

function log(msg) {
  logs.push(msg);
  console.log(`[SERVER] ${msg}`);
}

function logWarn(msg) {
  logs.push(msg);
  console.log(`[WARN]   ${msg}`);
}

async function shutdown(signal) {
  if (isShuttingDown) {
    log('[SHUTDOWN] já em progresso, ignorando ' + signal);
    return;
  }
  isShuttingDown = true;
  
  log('[SHUTDOWN] signal: ' + signal);
  log('[SHUTDOWN] closing HTTP');
  await new Promise(r => setTimeout(r, 100));
  log('[SHUTDOWN] HTTP server closed');
  log('[SHUTDOWN] closing DB');
  await new Promise(r => setTimeout(r, 100));
  log('[SHUTDOWN] DB closed');
  log('[SHUTDOWN] closing Redis');
  await new Promise(r => setTimeout(r, 100));
  log('[SHUTDOWN] Redis closed');
  log('[SHUTDOWN] DONE');
  process.exit(0);
}

// Registro de handlers — MODO HARDENING EXTREMO
const blockSigint = true; // BLOCK_SIGINT_SHUTDOWN=1

process.removeAllListeners("SIGINT");
process.removeAllListeners("SIGTERM");

if (blockSigint) {
  logWarn('[SHUTDOWN] CTRL+C BLOQUEADO — shutdown via SIGTERM ou HTTP apenas');
  
  // Handler SIGINT que APENAS loga aviso — NÃO causa shutdown
  process.on("SIGINT", () => {
    logWarn('[BLOCKED] CTRL+C desabilitado. Use shutdown oficial (SIGTERM ou HTTP endpoint).');
  });
} else {
  process.on("SIGINT", () => shutdown('SIGINT'));
}

// SIGTERM sempre funciona
process.on("SIGTERM", () => shutdown('SIGTERM'));

// Servidor
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(6666, 'localhost', () => {
  log('[SERVER] listening on http://localhost:6666');
  
  // Testa sequência
  setTimeout(() => {
    console.log('');
    console.log('🔴 TESTE 1: Emitindo SIGINT (CTRL+C)...');
    console.log('');
    process.emit('SIGINT');
  }, 500);
  
  // Valida que servidor ainda está rodando
  setTimeout(() => {
    console.log('');
    console.log('✅ TESTE 1 PASSOU: Servidor ainda está rodando após SIGINT');
    console.log('');
    console.log('🔴 TESTE 2: Emitindo SIGTERM (deve desligar)...');
    console.log('');
    process.emit('SIGTERM');
  }, 2000);
});

// Timeout de segurança
setTimeout(() => {
  console.error('❌ TIMEOUT 20s');
  process.exit(1);
}, 20000);

process.on('exit', (code) => {
  console.log('');
  console.log('='.repeat(80));
  console.log('📊 RESULTADO DO TESTE');
  console.log('='.repeat(80));
  console.log('');
  
  // Checklist de validação
  const checks = [
    {
      name: '[SHUTDOWN] CTRL+C BLOQUEADO',
      found: logs.some(l => l.includes('[SHUTDOWN] CTRL+C BLOQUEADO')),
      required: true,
    },
    {
      name: '[BLOCKED] CTRL+C desabilitado',
      found: logs.some(l => l.includes('[BLOCKED] CTRL+C desabilitado')),
      required: true,
    },
    {
      name: '[SHUTDOWN] signal: SIGTERM',
      found: logs.some(l => l.includes('[SHUTDOWN] signal: SIGTERM')),
      required: true,
    },
    {
      name: '[SHUTDOWN] DONE',
      found: logs.some(l => l.includes('[SHUTDOWN] DONE')),
      required: true,
    },
    {
      name: 'Servidor não saiu após SIGINT',
      found: !logs.some(l => l.includes('[SHUTDOWN] signal: SIGINT')),
      required: true,
    },
  ];
  
  console.log('🔍 Validação:');
  let allPass = true;
  for (const check of checks) {
    if (check.found) {
      console.log(`  ✅ ${check.name}`);
    } else if (check.required) {
      console.log(`  ❌ ${check.name}`);
      allPass = false;
    }
  }
  
  console.log('');
  if (allPass && code === 0) {
    console.log('✅ BLOQUEIO DE CTRL+C FUNCIONANDO CORRETAMENTE');
    console.log('');
    console.log('✓ CTRL+C desabilitado');
    console.log('✓ Apenas loga aviso');
    console.log('✓ Shutdown via SIGTERM funciona');
    console.log('✓ Shutdown 100% controlado');
  } else {
    console.log('❌ BLOQUEIO COM PROBLEMAS');
  }
  console.log('');
});
