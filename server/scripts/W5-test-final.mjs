#!/usr/bin/env node

/**
 * W5-TEST-FINAL.mjs
 * 
 * FASE W5 - VALIDAÇÃO FINAL REAL
 * 1. Rodar check:infra
 * 2. Iniciar servidor
 * 3. Validar resposta externo
 * 4. Gerar relatório final
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { setTimeout as sleep } from 'timers/promises';

const execAsync = promisify(exec);
const BASE_URL = 'http://localhost:3001';
const TIMEOUT = 30000;

let results = [];
let serverProcess = null;

function log(title, status, details) {
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${title}`);
  if (details) console.log(`   📍 ${details}`);
  results.push({ title, status, details });
}

async function checkInfra() {
  console.log('\n📊 1. Executando check:infra...');
  try {
    const { stdout, stderr } = await execAsync('node server/scripts/check-infra.mjs', {
      cwd: 'c:\\ERP',
      timeout: 15000,
    });
    
    if (stdout.includes('✅') && !stderr.includes('erro')) {
      log('check:infra', 'PASS', 'DB e Redis validados');
      return true;
    } else {
      log('check:infra', 'FAIL', 'Infra check falhou');
      return false;
    }
  } catch (error) {
    log('check:infra', 'FAIL', error.message);
    return false;
  }
}

async function startServer() {
  console.log('\n📊 2. Iniciando servidor (start:prod)...');
  try {
    // Assuming pnpm build já foi feito
    return new Promise((resolve) => {
      const proc = exec('node dist/server/_core/index.js', {
        cwd: 'c:\\ERP',
        timeout: 30000,
      });
      
      serverProcess = proc;
      
      proc.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('listening') || output.includes('ready')) {
          log('Server Start', 'PASS', 'Servidor iniciado com sucesso');
          resolve(true);
        }
      });

      proc.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('error') || output.includes('Error')) {
          log('Server Start', 'FAIL', `Erro: ${output.substring(0, 100)}`);
          resolve(false);
        }
      });

      // Timeout de 10s para inicialização
      setTimeout(() => {
        resolve(true); // Assume que iniciou
      }, 10000);
    });
  } catch (error) {
    log('Server Start', 'FAIL', error.message);
    return false;
  }
}

async function waitForServer() {
  console.log('\n📊 3. Aguardando servidor ficar pronto...');
  let attempts = 0;
  const maxAttempts = 20; // 20 segundos

  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(`${BASE_URL}/api/health`, {
        timeout: 5000,
      });
      
      if (response.status === 200) {
        log('Server Ready', 'PASS', 'Servidor respondendo');
        return true;
      }
    } catch (error) {
      // Server ainda não está pronto
    }
    
    attempts++;
    await sleep(1000);
  }

  log('Server Ready', 'FAIL', 'Timeout aguardando servidor');
  return false;
}

async function testEndpoints() {
  console.log('\n📊 4. Testando endpoints básicos...');

  // Health Check
  try {
    const health = await axios.get(`${BASE_URL}/api/health`, { timeout: 5000 });
    if (health.status === 200) {
      log('Health Endpoint', 'PASS', 'Respondendo');
    }
  } catch (error) {
    log('Health Endpoint', 'FAIL', error.message);
  }

  // Login Endpoint
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'test@windsurf.test',
      password: 'TestPass123',
    }, { timeout: 5000 }).catch(err => ({
      status: err.response?.status,
      data: err.response?.data,
    }));

    if ([200, 401, 400].includes(loginRes.status)) {
      log('Auth Endpoint', 'PASS', `Status ${loginRes.status}`);
    } else {
      log('Auth Endpoint', 'FAIL', `Status ${loginRes.status}`);
    }
  } catch (error) {
    log('Auth Endpoint', 'FAIL', error.message);
  }
}

async function runW5Tests() {
  console.log('\n' + '='.repeat(60));
  console.log('🌊 WINDSURF W5 - VALIDAÇÃO FINAL REAL');
  console.log('='.repeat(60));

  try {
    // 1. CHECK INFRA
    const infraOk = await checkInfra();
    if (!infraOk) {
      log('W5 Sequence', 'FAIL', 'Infra não pré-validada, abortar');
      process.exit(1);
    }

    // 2. START SERVER
    await startServer();
    
    // 3. WAIT FOR SERVER
    const serverReady = await waitForServer();
    
    // 4. TEST ENDPOINTS
    if (serverReady) {
      await testEndpoints();
    }

    // 5. FINAL VALIDATION
    console.log('\n📊 5. Validação TypeScript (tsc)...');
    try {
      const { stdout } = await execAsync('pnpm exec tsc -p tsconfig.server.json --noEmit', {
        cwd: 'c:\\ERP',
        timeout: 60000,
      });
      log('TypeScript Check', 'PASS', 'Zero erros de tipo');
    } catch (error) {
      log('TypeScript Check', 'FAIL', 'Erros de tipo encontrados');
    }

  } catch (error) {
    console.error('\n❌ Erro fatal:', error.message);
  } finally {
    // Kill server
    if (serverProcess) {
      serverProcess.kill();
    }
  }

  // RELATÓRIO FINAL
  console.log('\n' + '='.repeat(60));
  console.log('📋 RELATÓRIO W5 - FINAL');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`\n✅ PASSOU: ${passed}`);
  console.log(`❌ FALHOU: ${failed}`);
  console.log(`📊 Total: ${results.length}\n`);

  if (failed === 0 && passed >= 5) {
    console.log('✨✨✨ W5 APROVADO: SISTEMA PRONTO PARA PRODUÇÃO\n');
    console.log('✅ Sobe limpo');
    console.log('✅ Responde externo');
    console.log('✅ Sem erros de tipo\n');
    process.exit(0);
  } else {
    console.log('⚠️  W5 REPROVADO: Corrija os erros acima\n');
    process.exit(1);
  }
}

runW5Tests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
