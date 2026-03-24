#!/usr/bin/env node

/**
 * TESTE REAL DE GRACEFUL SHUTDOWN
 * 
 * Sem CTRL+C, sem PowerShell, sem Stop-Process
 * Emite SIGINT programaticamente DENTRO do servidor rodando
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// 1️⃣ INICIA SERVIDOR
// ============================================================================

console.log('='.repeat(80));
console.log('🔴 TEST: GRACEFUL SHUTDOWN REAL');
console.log('='.repeat(80));
console.log('');

const child = spawn('node', ['--import', 'tsx', 'server/_core/index.ts'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: '3001',
    SHUTDOWN_FORCE_EXIT_MS: '15000',
    DATABASE_URL: process.env.DATABASE_URL || 'mysql://root:@localhost/test_erp',
  },
});

const startTime = Date.now();
let serverReady = false;
let shutdownStarted = false;
let shutdownComplete = false;
const logs = [];

// ============================================================================
// 2️⃣ MONITORA LOGS
// ============================================================================

child.stdout.on('data', (data) => {
  const msg = data.toString().trim();
  if (!msg) return;
  
  logs.push(msg);
  console.log(`[SERVER] ${msg}`);
  
  // Detecta server pronto
  if (msg.includes('listening on') || msg.includes('Server started')) {
    serverReady = true;
    console.log('');
    console.log('✅ Server ready! → Emitindo SIGINT em 2 segundos...');
    console.log('');
    
    // Agenda shutdown após 2 segundos
    setTimeout(() => {
      console.log('🔴 Emitindo SIGINT (shutdown programático)...');
      console.log('');
      shutdownStarted = true;
      child.kill('SIGINT');
    }, 2000);
  }
  
  // Detecta shutdown completo
  if (msg.includes('[SHUTDOWN] DONE')) {
    shutdownComplete = true;
    console.log('');
    console.log('✅ SHUTDOWN COMPLETO!');
  }
});

child.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  if (!msg) return;
  logs.push(`[STDERR] ${msg}`);
  console.log(`[ERROR] ${msg}`);
});

// ============================================================================
// 3️⃣ MONITORA SAÍDA DO PROCESSO
// ============================================================================

child.on('exit', (code, signal) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('');
  console.log('='.repeat(80));
  console.log('📊 RESULTADO DO TESTE');
  console.log('='.repeat(80));
  console.log(`Tempo total: ${elapsed}s`);
  console.log(`Código de saída: ${code}`);
  console.log(`Signal: ${signal}`);
  console.log('');
  
  // ========================================================================
  // 4️⃣ VALIDAÇÃO: VERIFICA SE TODOS OS LOGS ESPERADOS APARECEM
  // ========================================================================
  
  console.log('🔍 VALIDAÇÃO DE LOGS:');
  console.log('');
  
  const checks = [
    { name: 'Server iniciou', pattern: /listening on|Server started/i, required: true },
    { name: '[SHUTDOWN] signal: SIGINT', pattern: /\[SHUTDOWN\] signal: SIGINT/i, required: true },
    { name: '[SHUTDOWN] closing HTTP', pattern: /\[SHUTDOWN\] closing HTTP/i, required: true },
    { name: '[SHUTDOWN] HTTP server closed', pattern: /\[SHUTDOWN\] HTTP server closed/i, required: true },
    { name: '[SHUTDOWN] closing DB', pattern: /\[SHUTDOWN\] closing DB/i, required: true },
    { name: '[SHUTDOWN] DB closed', pattern: /\[SHUTDOWN\] DB closed/i, required: false }, // pode não existir
    { name: '[SHUTDOWN] closing Redis', pattern: /\[SHUTDOWN\] closing Redis/i, required: true },
    { name: '[SHUTDOWN] Redis closed', pattern: /\[SHUTDOWN\] Redis closed/i, required: false }, // pode não existir
    { name: '[SHUTDOWN] DONE', pattern: /\[SHUTDOWN\] DONE/i, required: true },
  ];
  
  const results = {
    passed: [],
    failed: [],
    successful: true,
  };
  
  for (const check of checks) {
    const found = logs.some(log => check.pattern.test(log));
    
    if (found) {
      results.passed.push(check.name);
      console.log(`  ✅ ${check.name}`);
    } else if (check.required) {
      results.failed.push(check.name);
      console.log(`  ❌ ${check.name} [REQUIRED]`);
      results.successful = false;
    } else {
      console.log(`  ⚠️  ${check.name} [optional]`);
    }
  }
  
  console.log('');
  
  // ========================================================================
  // 5️⃣ DETECTA POSSÍVEIS FALHAS
  // ========================================================================
  
  console.log('⚠️  ANÁLISE DE FALHAS:');
  console.log('');
  
  const issues = [];
  
  if (!serverReady) {
    issues.push('❌ Server nunca ficou ready');
  }
  
  if (!shutdownStarted) {
    issues.push('❌ Shutdown nunca foi triggerado');
  }
  
  if (!shutdownComplete) {
    issues.push('❌ Log "[SHUTDOWN] DONE" nunca apareceu');
  }
  
  if (code !== 0 && code !== null) {
    issues.push(`❌ Processo saiu com código ${code} (esperado: 0)`);
  }
  
  if (logs.some(l => l.includes('[SHUTDOWN] FORCE EXIT'))) {
    issues.push('⚠️  Timeout forçado foi acionado (recurso travou por > 15s)');
    results.successful = false;
  }
  
  if (results.failed.length > 0) {
    issues.push(`❌ ${results.failed.length} log(s) esperado(s) não encontrado(s)`);
  }
  
  if (issues.length === 0) {
    console.log('✅ NENHUM PROBLEMA DETECTADO!');
  } else {
    issues.forEach(issue => console.log(`  ${issue}`));
  }
  
  console.log('');
  console.log('='.repeat(80));
  console.log('📋 RESUMO');
  console.log('='.repeat(80));
  
  if (results.successful && code === 0) {
    console.log('✅ SHUTDOWN FUNCIONANDO CORRETAMENTE');
    console.log('');
    console.log('Status: PASSA [OK]');
  } else {
    console.log('❌ SHUTDOWN COM PROBLEMAS');
    console.log('');
    console.log('Status: FALHA [FIX NECESSÁRIO]');
  }
  
  console.log('');
  
  process.exit(results.successful && code === 0 ? 0 : 1);
});

// Timeout segurança: se não sair em 60 segundos, força
setTimeout(() => {
  console.error('');
  console.error('❌ TIMEOUT: Processo não saiu em 60s');
  child.kill('SIGKILL');
  process.exit(1);
}, 60000);
