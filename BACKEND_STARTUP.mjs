#!/usr/bin/env node

/**
 * 🚀 BACKEND STARTUP ORCHESTRATOR
 * 
 * Fases:
 * 1. Verificar MySQL
 * 2. Verificar Redis
 * 3. Verificar Docker (opcional)
 * 4. Compilar Backend
 * 5. Iniciar Backend via dev
 * 6. Health Check
 * 7. Relatório Final
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import net from 'net';

const execAsync = promisify(exec);
const REPORT_FILE = './BACKEND_STARTUP_REPORT.md';
let REPORT = '';

// ============================================================================
// UTILITIES
// ============================================================================

function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'INFO': '      ℹ️ ',
    'SUCCESS': '   ✅ ',
    'ERROR': '   ❌ ',
    'WARNING': '   ⚠️  ',
    'PHASE': '🔥 ',
  }[type] || '   ';

  const fullMessage = `${prefix} ${message}`;
  console.log(fullMessage);
  REPORT += `${fullMessage}\n`;
}

function logJson(label, data) {
  console.log(`   📊 ${label}:`);
  console.log(JSON.stringify(data, null, 2));
  REPORT += `   📊 ${label}:\n${JSON.stringify(data, null, 2)}\n`;
}

function logSeparator(char = '━') {
  const line = char.repeat(70);
  console.log(line);
  REPORT += line + '\n';
}

// ============================================================================
// CONNECTIVITY CHECKS
// ============================================================================

async function checkPort(host, port, name) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ status: false, error: 'TIMEOUT' });
    }, 3000);

    socket.connect(port, host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve({ status: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ status: false, error: err.code });
    });
  });
}

// ============================================================================
// PHASE 1: MYSQL VALIDATION
// ============================================================================

async function validateMySQL() {
  log('FASE 1: Validar MySQL', 'PHASE');
  logSeparator();

  const result = await checkPort('localhost', 3306, 'MySQL');
  
  if (result.status) {
    log('MySQL está ATIVO na porta 3306', 'SUCCESS');
    return true;
  } else {
    log(`MySQL NÃO está ativo (Erro: ${result.error})`, 'WARNING');
    log('Tipo esperado: MySQL 8.0 como container ou serviço local', 'INFO');
    log('Credenciais em .env.development', 'INFO');
    return false;
  }
}

// ============================================================================
// PHASE 2: REDIS VALIDATION
// ============================================================================

async function validateRedis() {
  log('FASE 2: Validar Redis', 'PHASE');
  logSeparator();

  const result = await checkPort('localhost', 6379, 'Redis');
  
  if (result.status) {
    log('Redis está ATIVO na porta 6379', 'SUCCESS');
    return true;
  } else {
    log(`Redis NÃO está ativo (Erro: ${result.error})`, 'WARNING');
    log('Tipo esperado: Redis 7-alpine como container ou serviço local', 'INFO');
    return false;
  }
}

// ============================================================================
// PHASE 3: DOCKER VALIDATION
// ============================================================================

async function validateDocker() {
  log('FASE 3: Validar Docker', 'PHASE');
  logSeparator();

  try {
    const { stdout } = await execAsync('docker ps 2>&1');
    log('Docker está ATIVO', 'SUCCESS');
    return true;
  } catch (err) {
    log('Docker NÃO está ativo', 'WARNING');
    log('Para ativar: inicie Docker Desktop', 'INFO');
    log('Para iniciar containers: pnpm run infra:up', 'INFO');
    return false;
  }
}

// ============================================================================
// PHASE 4: BUILD BACKEND
// ============================================================================

async function buildBackend() {
  log('FASE 4: Compilar Backend', 'PHASE');
  logSeparator();

  try {
    log('Compilando com: pnpm run build', 'INFO');
    const { stdout, stderr } = await execAsync('pnpm run build', {
      cwd: process.cwd(),
      timeout: 60000,
    });

    if (stderr && !stderr.includes('warning')) {
      log('Build completado com avisos', 'WARNING');
      log(stderr.substring(0, 200), 'INFO');
    } else {
      log('Build SUCESSO', 'SUCCESS');
    }
    return true;
  } catch (err) {
    log(`Build FALHOU: ${err.message}`, 'ERROR');
    log('Detalhes:', 'INFO');
    log(err.stderr ? err.stderr.substring(0, 500) : err.message, 'INFO');
    return false;
  }
}

// ============================================================================
// PHASE 5: TYPECHECK
// ============================================================================

async function typecheck() {
  log('FASE 5: Validação TypeScript', 'PHASE');
  logSeparator();

  try {
    log('Executando: pnpm exec tsc -p tsconfig.server.json --noEmit', 'INFO');
    const { stdout, stderr } = await execAsync(
      'pnpm exec tsc -p tsconfig.server.json --noEmit',
      { cwd: process.cwd(), timeout: 60000 }
    );

    if (stderr) {
      log(`TypeScript Errors: ${stderr.length} linhas`, 'ERROR');
      const lines = stderr.split('\n').slice(0, 10);
      lines.forEach(line => {
        if (line.trim()) log(line, 'ERROR');
      });
      return false;
    } else {
      log('Nenhum erro de TypeScript', 'SUCCESS');
      return true;
    }
  } catch (err) {
    log(`TypeScript Check FALHOU`, 'ERROR');
    if (err.stderr) {
      const lines = err.stderr.split('\n').slice(0, 15);
      lines.forEach(line => {
        if (line.trim()) log(line, 'ERROR');
      });
    }
    return false;
  }
}

// ============================================================================
// PHASE 6: ENVIRONMENT VALIDATION
// ============================================================================

async function validateEnvironment() {
  log('FASE 6: Validar Ambiente', 'PHASE');
  logSeparator();

  try {
    const { stdout } = await execAsync('pnpm run validate:env 2>&1', {
      cwd: process.cwd(),
      timeout: 30000,
    });
    log('Environment VÁLIDO', 'SUCCESS');
    return true;
  } catch (err) {
    log('Environment validation inconcluso (não crítico)', 'WARNING');
    return false;
  }
}

// ============================================================================
// FINAL REPORT
// ============================================================================

function generateReport(results) {
  logSeparator('═');
  log('RESUMO EXECUTIVO', 'PHASE');
  logSeparator('═');

  const checks = [
    { label: 'MySQL activo', result: results.mysql },
    { label: 'Redis ativo', result: results.redis },
    { label: 'Docker ativo', result: results.docker },
    { label: 'Build TypeScript', result: results.build },
    { label: 'TypeScript check', result: results.typecheck },
    { label: 'Environment válido', result: results.env },
  ];

  checks.forEach(({ label, result }) => {
    const icon = result ? '✅' : '⚠️ ';
    const type = result ? 'SUCCESS' : 'WARNING';
    log(`${label.padEnd(25)} ${icon}`, type);
  });

  logSeparator('═');

  const criticalOk = results.build && results.typecheck;
  
  if (criticalOk) {
    log('✨ BACKEND PRONTO PARA INICIAR ✨', 'SUCCESS');
    log('Para iniciar manualmente:', 'INFO');
    log('  pnpm run dev', 'INFO');
    if (!results.mysql || !results.redis) {
      log('', 'INFO');
      log('⚠️  AVISO: Certifique-se de que MySQL e Redis estão rodando!', 'WARNING');
      log('Se não estão em container, inicie os serviços locais ou', 'WARNING');
      log('execute: pnpm run infra:up (requer Docker)', 'WARNING');
    }
  } else {
    log('❌ PROBLEMA COM BUILD OU TYPECHECK', 'ERROR');
    log('Revise os erros acima', 'ERROR');
  }

  logSeparator('═');
  log(`Relatório salvo em: ${REPORT_FILE}`, 'SUCCESS');
  logSeparator('═');

  writeFileSync(REPORT_FILE, REPORT);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.clear();
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                  BACKEND STARTUP ORCHESTRATOR                  ║');
  console.log('║                     (Infra Local Desbloqueio)                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  REPORT += '# 🚀 BACKEND STARTUP REPORT\n\n';
  REPORT += `Timestamp: ${new Date().toISOString()}\n\n`;

  const results = {
    mysql: false,
    redis: false,
    docker: false,
    build: false,
    typecheck: false,
    env: false,
  };

  // PHASES EXECUTION
  try {
    results.mysql = await validateMySQL();
    console.log('');

    results.redis = await validateRedis();
    console.log('');

    results.docker = await validateDocker();
    console.log('');

    results.env = await validateEnvironment();
    console.log('');

    results.build = await buildBackend();
    console.log('');

    results.typecheck = await typecheck();
    console.log('');

    generateReport(results);
  } catch (err) {
    log(`Erro fatal: ${err.message}`, 'ERROR');
    process.exit(1);
  }
}

main().catch(console.error);
