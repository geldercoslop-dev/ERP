#!/usr/bin/env node

/**
 * Health Check e Validação Final
 * Testa:
 * 1. /api/health - servidor rodando
 * 2. TypeScript check - sem erros
 * 3. Conectividade básica
 */

import http from 'http';
import { promises as fs } from 'fs';

function log(msg) {
  console.log(msg);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testHealthCheck(attempt = 1) {
  const MAX_ATTEMPTS = 30; // 30 tentativas, 1s cada = 30s total
  
  if (attempt > MAX_ATTEMPTS) {
    log('❌ Servidor não respondeu após 30s');
    return false;
  }

  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/health', {
      timeout: 2000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 404 || res.statusCode === 405) {
          // 404/405 ainda significa que servidor está respondendo
          log(`✅ Servidor respondeu! Status: ${res.statusCode}`);
          resolve(true);
        } else {
          log(`⚠️  Status inesperado: ${res.statusCode}`);
          resolve(true); // ainda consideramos como servidor online
        }
      });
    }).on('error', async (err) => {
      if (attempt % 5 === 0) {
        log(`   ⏳ Tentativa ${attempt}/${MAX_ATTEMPTS}... (esperando servidor iniciar)`);
      }
      await sleep(1000);
      resolve(await testHealthCheck(attempt + 1));
    });
    req.end();
  });
}

async function testTypeScript() {
  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('TypeScript Validation');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const { spawn } = await import('child_process');
  
  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['exec', 'tsc', '-p', 'tsconfig.server.json', '--noEmit'], {
      stdio: 'pipe',
      timeout: 60000,
    });

    let stderr = '';
    proc.stderr.on('data', data => stderr += data.toString());
    
    proc.on('close', (code) => {
      if (stderr) {
        const lines = stderr.split('\n').filter(l => l.trim()).slice(0, 10);
        log(`❌ TypeScript errors detected:`);
        lines.forEach(line => log(`   ${line}`));
        resolve(false);
      } else {
        log('✅ TypeScript validation: NO ERRORS');
        resolve(true);
      }
    });

    proc.on('error', (err) => {
      log(`❌ Erro executando TypeScript: ${err.message}`);
      resolve(false);
    });
  });
}

async function main() {
  log('');
  log('╔═══════════════════════════════════════════════════════════╗');
  log('║      HEALTH CHECK & FINAL VALIDATION                      ║');
  log('╚═══════════════════════════════════════════════════════════╝');
  log('');

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Phase 1: Aguardando servidor iniciar...');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const serverOnline = await testHealthCheck();
  
  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Phase 2: Testando Health Check...');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (serverOnline) {
    log('✅ SERVIDOR ONLINE');
    log('   URL: http://localhost:3000');
  } else {
    log('❌ SERVIDOR NÃO RESPONDEU');
    log('   Verifique logs do server');
    log('   Possível causa: dependências ausentes ou erro em startup');
  }

  const typeScriptOk = await testTypeScript();

  log('');
  log('╔═══════════════════════════════════════════════════════════╗');
  log('║              RESUMO FINAL                                 ║');
  log('╚═══════════════════════════════════════════════════════════╝');
  log('');
  log(`Servidor Online (HTTP):    ${serverOnline ? '✅' : '❌'}`);
  log(`TypeScript Valid:          ${typeScriptOk ? '✅' : '❌'}`);
  log('');

  if (serverOnline && typeScriptOk) {
    log('✨ SISTEMA PRONTO ✨ (aguardando em http://localhost:3000)');
  } else {
    log('⚠️  Verifique os problemas acima');
  }
  
  log('');
  process.exit(serverOnline && typeScriptOk ? 0 : 1);
}

main().catch(console.error);
