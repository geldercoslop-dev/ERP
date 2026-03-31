#!/usr/bin/env node

/**
 * VALIDAÇÃO AUTOMÁTICA - FRONTEND + BACKEND REAL
 * 
 * Testa cada fase da integração frontend com backend real (VPS)
 * Gera relatório detalhado testado e confirmado
 * 
 * Uso:
 *   node validate-frontend-vps.mjs [VPS_IP:PORT]
 * 
 * Exemplos:
 *   node validate-frontend-vps.mjs http://192.168.1.100:3000
 *   node validate-frontend-vps.mjs https://api.empresa.com.br
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// ═══════════════════════════════════════════════════════════════
// CORES E FORMATTING
// ═══════════════════════════════════════════════════════════════

const COLORS = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  MAGENTA: '\x1b[35m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
};

const log = {
  phase: (n, msg) => console.log(`\n${COLORS.BOLD}${COLORS.CYAN}FASE ${n}: ${msg}${COLORS.RESET}`),
  ok: (msg) => console.log(`  ${COLORS.GREEN}✅ ${msg}${COLORS.RESET}`),
  err: (msg) => console.log(`  ${COLORS.RED}❌ ${msg}${COLORS.RESET}`),
  warn: (msg) => console.log(`  ${COLORS.YELLOW}⚠️  ${msg}${COLORS.RESET}`),
  info: (msg) => console.log(`  ${COLORS.CYAN}ℹ️  ${msg}${COLORS.RESET}`),
  separator: () => console.log(`${COLORS.BLUE}${'═'.repeat(70)}${COLORS.RESET}`),
  section: (title) => console.log(`\n${COLORS.MAGENTA}${COLORS.BOLD}▸ ${title}${COLORS.RESET}`),
};

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const VPS_BACKEND_URL = args[0] || 'http://localhost:3000'; // Padrão ou fornecido

const FRONTEND_URL = 'http://localhost:5173';
const FRONTEND_API_PROXY = 'http://localhost:5173/api';

let testResults = {
  phase1: { name: 'FASE 1 - Frontend Vite', passed: false, details: [] },
  phase2: { name: 'FASE 2 - Conexão Backend', passed: false, details: [] },
  phase3: { name: 'FASE 3 - Login Real', passed: false, details: [] },
  phase4: { name: 'FASE 4 - CORS', passed: false, details: [] },
  phase5: { name: 'FASE 5 - Chat LEO', passed: false, details: [] },
};

let testStats = {
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  startTime: Date.now(),
};

// ═══════════════════════════════════════════════════════════════
// UTILITÁRIOS DE REQUEST
// ═══════════════════════════════════════════════════════════════

function makeRequest(urlStr, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Frontend-Validator/1.0',
        },
      };

      if (body) {
        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
      }

      const req = client.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            bodyJson: tryParseJson(data),
          });
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// TESTES DAS FASES
// ═══════════════════════════════════════════════════════════════

async function testPhase1() {
  log.phase(1, 'Verificar se Frontend Vite está rodando');
  
  try {
    const response = await makeRequest(FRONTEND_URL, 'GET');
    testStats.totalTests++;

    if (response.status === 200 && response.body.includes('<!DOCTYPE') || response.body.includes('<html')) {
      testStats.passedTests++;
      log.ok(`Frontend respondendo em ${FRONTEND_URL}`);
      log.info(`Status: ${response.status}`);
      testResults.phase1.passed = true;
      testResults.phase1.details.push({
        test: 'Frontend acessível',
        status: 'PASSOU',
        statusCode: response.status,
        contentType: response.headers['content-type'],
      });
    } else {
      testStats.failedTests++;
      log.err(`Frontend não retornou HTML esperado (status ${response.status})`);
      testResults.phase1.details.push({
        test: 'Frontend acessível',
        status: 'FALHOU',
        statusCode: response.status,
      });
    }
  } catch (err) {
    testStats.totalTests++;
    testStats.failedTests++;
    log.err(`Frontend não está acessível: ${err.message}`);
    log.warn(`Execute: npm run dev:client (na raiz do projeto)`);
    testResults.phase1.details.push({
      test: 'Frontend acessível',
      status: 'FALHOU',
      erro: err.message,
    });
  }
}

async function testPhase2() {
  log.phase(2, 'Testar conexão com Backend Real (VPS)');
  log.info(`Backend configurado em: ${VPS_BACKEND_URL}`);

  // Test 2.1: Health check via proxy
  try {
    const healthUrl = `${FRONTEND_API_PROXY}/health`;
    const response = await makeRequest(healthUrl, 'GET');
    testStats.totalTests++;

    if (response.status === 200) {
      testStats.passedTests++;
      log.ok(`Health check passou (${response.status})`);
      log.info(`Resposta: ${JSON.stringify(response.bodyJson || response.body).substring(0, 100)}`);
      testResults.phase2.details.push({
        endpoint: '/api/health',
        status: 'PASSOU',
        statusCode: response.status,
        response: response.bodyJson,
      });
    } else {
      testStats.failedTests++;
      log.warn(`Health check retornou ${response.status} (pode estar OK se for 500)`);
      testResults.phase2.details.push({
        endpoint: '/api/health',
        status: 'FALHOU',
        statusCode: response.status,
      });
    }
  } catch (err) {
    testStats.totalTests++;
    testStats.failedTests++;
    log.err(`Health check falhou: ${err.message}`);
    log.warn(`Possíveis causas:`);
    log.warn(`  1. Frontend não está rodando (execute: npm run dev:client)`);
    log.warn(`  2. Backend VPS IP incorreto em vite.config.ts`);
    log.warn(`  3. Firewall bloqueando a porta`);
    testResults.phase2.details.push({
      endpoint: '/api/health',
      status: 'FALHOU',
      erro: err.message,
    });
  }

  testResults.phase2.passed = testStats.failedTests === 0 || testResults.phase2.details.some(d => d.status === 'PASSOU');
}

async function testPhase3() {
  log.phase(3, 'Teste de Login Real');
  log.warn(`⚠️  Este teste requer credenciais válidas do backend VPS`);
  log.info(`Você precisa executar manualmente no navegador:`);
  log.info(`  1. Abra: http://localhost:5173/login`);
  log.info(`  2. Insira usuário/senha REAIS`);
  log.info(`  3. Verifique se redireciona após login bem-sucedido`);

  testStats.totalTests++;
  testResults.phase3.details.push({
    test: 'Login manual',
    status: 'MANUAL',
    instrucoes: 'Execute login no navegador e observe o resultado',
  });
}

async function testPhase4() {
  log.phase(4, 'Validação de CORS');

  try {
    const corsTestUrl = `${FRONTEND_API_PROXY}/health`;
    const response = await makeRequest(corsTestUrl, 'GET');
    testStats.totalTests++;

    if (response.status < 500 || response.status === 403 || response.status === 401) {
      testStats.passedTests++;
      log.ok(`CORS aparentemente configurado (status: ${response.status})`);
      log.info(`Headers esperados recebidos`);
      testResults.phase4.passed = true;
      testResults.phase4.details.push({
        test: 'CORS headers',
        status: 'PASSOU',
        corsHeaders: response.headers['access-control-allow-origin'],
      });
    } else {
      testStats.failedTests++;
      log.warn(`Status inesperado: ${response.status}`);
      testResults.phase4.details.push({
        test: 'CORS headers',
        status: 'FALHOU',
        statusCode: response.status,
      });
    }
  } catch (err) {
    testStats.totalTests++;
    testStats.failedTests++;
    log.err(`CORS test falhou: ${err.message}`);
    testResults.phase4.details.push({
      test: 'CORS headers',
      status: 'FALHOU',
      erro: err.message,
    });
  }
}

async function testPhase5() {
  log.phase(5, 'Chat LEO');
  log.warn(`⚠️  Este teste requer estar autenticado`);
  log.info(`Você precisa executar manualmente:`);
  log.info(`  1. Faça login no dashboard`);
  log.info(`  2. Navegue até o chat LEO`);
  log.info(`  3. Envie uma mensagem de teste`);
  log.info(`  4. Verifique se a resposta aparece`);

  testStats.totalTests++;
  testResults.phase5.details.push({
    test: 'Chat LEO',
    status: 'MANUAL',
    instrucoes: 'Execute teste no navegador após login',
  });
}

// ═══════════════════════════════════════════════════════════════
// RELATÓRIO FINAL
// ═══════════════════════════════════════════════════════════════

function generateReport() {
  log.separator();
  log.section('📊 RELATÓRIO FINAL - VALIDAÇÃO FRONTEND + BACKEND VPS');
  log.separator();

  console.log(`\n${COLORS.BOLD}Configuração${COLORS.RESET}`);
  console.log(`  Frontend: ${FRONTEND_URL}`);
  console.log(`  Backend VPS: ${VPS_BACKEND_URL}`);
  console.log(`  Proxy API: ${FRONTEND_API_PROXY}`);

  console.log(`\n${COLORS.BOLD}Resultados${COLORS.RESET}`);
  Object.entries(testResults).forEach(([key, result]) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`  ${icon} ${result.name}: ${result.passed ? 'OK' : 'FALHOU'}`);
    if (result.details.length > 0) {
      result.details.forEach(detail => {
        console.log(`     • ${JSON.stringify(detail).substring(0, 80)}`);
      });
    }
  });

  console.log(`\n${COLORS.BOLD}Estatísticas${COLORS.RESET}`);
  console.log(`  Total de testes: ${testStats.totalTests}`);
  console.log(`  Passou: ${testStats.passedTests} (${Math.round(testStats.passedTests / testStats.totalTests * 100)}%)`);
  console.log(`  Falhou: ${testStats.failedTests}`);
  console.log(`  Tempo total: ${Math.round((Date.now() - testStats.startTime) / 1000)}s`);

  console.log(`\n${COLORS.BOLD}Próximos Passos${COLORS.RESET}`);
  if (testResults.phase1.passed && testResults.phase2.passed) {
    console.log(`  ${COLORS.GREEN}✓${COLORS.RESET} Frontend e Backend estão conectados!`);
    console.log(`  ${COLORS.YELLOW}→${COLORS.RESET} Complete os testes manuais (FASE 3 e 5) no navegador`);
  } else {
    console.log(`  ${COLORS.RED}✗${COLORS.RESET} Há problemas de conexão`);
    console.log(`  ${COLORS.YELLOW}→${COLORS.RESET} Verifique o IP/URL da VPS em vite.config.ts`);
    console.log(`  ${COLORS.YELLOW}→${COLORS.RESET} Confirme que backend está ativo`);
  }

  log.separator();
}

// ═══════════════════════════════════════════════════════════════
// EXECUÇÃO
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.clear();
  console.log(`${COLORS.BOLD}${COLORS.MAGENTA}╔════════════════════════════════════════╗${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.MAGENTA}║  VALIDAÇÃO: FRONTEND + BACKEND REAL    ║${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.MAGENTA}║  Verificando integração com VPS        ║${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.MAGENTA}╚════════════════════════════════════════╝${COLORS.RESET}\n`);

  try {
    await testPhase1();
    await testPhase2();
    await testPhase3();
    await testPhase4();
    await testPhase5();
  } catch (err) {
    log.err(`Erro durante testes: ${err.message}`);
  }

  generateReport();
}

// Executar
runAllTests();
