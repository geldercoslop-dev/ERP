#!/usr/bin/env node

/**
 * FINAL-VALIDATION-REAL.mjs
 * 
 * Validação REAL de produção - SEM MAKE, VERDADE MESMO
 * 
 * FASE V1: Valida .env.production com todas as vars obrigatórias
 * FASE V2: Roda pnpm run check:infra (DB + Redis)
 * FASE V3: Inicia servidor e valida endpoints
 * VALIDAÇÃO FINAL: Roda typecheck
 * 
 * Gera RELATÓRIO DE VERDADE com diagnóstico completo
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import axios from 'axios';
import { spawn, exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

// ============================================================================
// CARREGAR .env.production
// ============================================================================
const envPath = '.env.production';
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  for (const line of envLines) {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  }
}

const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  BOLD: '\x1b[1m',
};

const log = {
  title: (msg) => console.log(`\n${COLORS.BOLD}${COLORS.BLUE}═══════════════════════════════════════${COLORS.RESET}`),
  phase: (n, msg) => console.log(`\n${COLORS.BOLD}${COLORS.CYAN}FASE V${n}: ${msg}${COLORS.RESET}`),
  ok: (msg) => console.log(`  ${COLORS.GREEN}✅ ${msg}${COLORS.RESET}`),
  err: (msg) => console.log(`  ${COLORS.RED}❌ ${msg}${COLORS.RESET}`),
  warn: (msg) => console.log(`  ${COLORS.YELLOW}⚠️  ${msg}${COLORS.RESET}`),
  info: (msg) => console.log(`  ${COLORS.CYAN}ℹ️  ${msg}${COLORS.RESET}`),
  separator: () => console.log(`${COLORS.BLUE}${'═'.repeat(41)}${COLORS.RESET}`),
};

const results = {
  v1: { name: 'V1 - ENV REAL', passed: false, details: [] },
  v2: { name: 'V2 - CHECK-INFRA', passed: false, details: [] },
  v3: { name: 'V3 - START REAL', passed: false, details: [] },
  final: { name: 'VALIDAÇÃO FINAL - TYPECHECK', passed: false, details: [] },
};

// ============================================================================
// FASE V1: Validar .env.production
// ============================================================================
async function phaseV1() {
  log.phase(1, 'ENV REAL - Validando .env.production');

  const requiredVars = [
    'DATABASE_URL',
    'REDIS_HOST',
    'REDIS_PORT',
    'APP_SECRET',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  const envPath = '.env.production';
  
  if (!existsSync(envPath)) {
    log.err(`.env.production não encontrado em: ${process.cwd()}`);
    results.v1.details.push('Arquivo .env.production não existe');
    return false;
  }

  log.ok(`.env.production encontrado`);

  try {
    const envContent = readFileSync(envPath, 'utf8');
    const envLines = envContent
      .split('\n')
      .filter(line => line.trim() && !line.startsWith('#'));

    const envVars = {};
    for (const line of envLines) {
      const [key, value] = line.split('=');
      if (key && value) {
        envVars[key.trim()] = value.trim();
      }
    }

    let allPresent = true;
    for (const varName of requiredVars) {
      if (!envVars[varName] || envVars[varName].includes('sua_')) {
        log.warn(`${varName} não configurado ou com valor de placeholder`);
        allPresent = false;
        results.v1.details.push(`${varName}: NÃO CONFIGURADO`);
      } else {
        log.ok(`${varName}: CONFIGURADO`);
        results.v1.details.push(`${varName}: OK`);
      }
    }

    if (!allPresent) {
      log.err('Algunas variáveis obrigatórias não estão configuradas!');
      log.info('Edite .env.production com valores reais (não use placeholders)');
      results.v1.passed = false;
      return false;
    }

    results.v1.passed = true;
    log.ok('Todas as variáveis obrigatórias estão configuradas');
    return true;
  } catch (error) {
    log.err(`Erro ao ler .env.production: ${error.message}`);
    results.v1.details.push(`Erro na leitura: ${error.message}`);
    return false;
  }
}

// ============================================================================
// FASE V2: Rodar check-infra
// ============================================================================
async function phaseV2() {
  log.phase(2, 'CHECK-INFRA REAL - Validando DB + Redis');

  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const args = process.platform === 'win32' 
      ? ['/c', 'pnpm run check:infra']
      : ['-c', 'pnpm run check:infra'];

    const checkInfraProcess = spawn(shell, args, {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env },  // Passar todas as variáveis de env
    });

    let output = '';
    let errorOutput = '';

    checkInfraProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    checkInfraProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    checkInfraProcess.on('close', (code) => {
      if (code === 0) {
        log.ok('Database conectado');
        log.ok('Redis conectado');
        results.v2.passed = true;
        results.v2.details.push('Database: CONECTADO');
        results.v2.details.push('Redis: CONECTADO');
        resolve(true);
      } else {
        // Analisa output para saber qual falhou
        if (output.includes('✅ MySQL')) {
          log.ok('Database conectado');
          results.v2.details.push('Database: CONECTADO');
        } else {
          log.err('Database não respondeu');
          results.v2.details.push('Database: FALHOU');
        }

        if (output.includes('✅ Redis')) {
          log.ok('Redis conectado');
          results.v2.details.push('Redis: CONECTADO');
        } else {
          log.err('Redis não respondeu');
          results.v2.details.push('Redis: FALHOU');
        }

        results.v2.passed = false;
        resolve(false);
      }
    });
  });
}

// ============================================================================
// FASE V3: Start e validar API
// ============================================================================
async function phaseV3() {
  log.phase(3, 'START REAL - Iniciando servidor');

  return new Promise((resolve) => {
    const serverProcess = spawn('node', ['dist/server/_core/index.js'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    });

    let isReady = false;
    let apiResponds = false;
    let startTime = Date.now();
    const timeout = 30000; // 30 segundos para o servidor iniciar

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('listening') || output.includes('Server') || output.includes('started')) {
        isReady = true;
        log.ok('Servidor iniciado');
      }
    });

    // Tenta conectar à API a cada 1 segundo
    const checkInterval = setInterval(async () => {
      if (!isReady && Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        serverProcess.kill();
        log.err('Timeout ao aguardar servidor iniciar');
        results.v3.details.push('Servidor: TIMEOUT (30s)');
        results.v3.passed = false;
        resolve(false);
        return;
      }

      try {
        const response = await axios.get('http://localhost:3001/api/health', {
          timeout: 5000,
        });

        if (response.status === 200) {
          apiResponds = true;
          clearInterval(checkInterval);
          log.ok('API responde em http://localhost:3001');
          
          // Tenta fazer um segundo request para validar sem crash
          setTimeout(async () => {
            try {
              await axios.get('http://localhost:3001/api/health', { timeout: 5000 });
              log.ok('Sem crash (segundo request OK)');
              results.v3.details.push('Servidor: INICIADO');
              results.v3.details.push('API: RESPONDENDO');
              results.v3.details.push('Crash: NÃO DETECTADO');
              results.v3.passed = true;
              serverProcess.kill();
              resolve(true);
            } catch {
              log.err('Servidor crashou após primeiro request');
              results.v3.details.push('Servidor: CRASH DETECTADO');
              results.v3.passed = false;
              serverProcess.kill();
              resolve(false);
            }
          }, 1000);
        }
      } catch {
        // Ainda tentando conectar
        if (!isReady) {
          // noop - aguarda mais
        }
      }
    }, 1000);

    // Cleanup se o servidor morrer inesperadamente
    serverProcess.on('exit', (code) => {
      clearInterval(checkInterval);
      if (!apiResponds) {
        log.err(`Servidor encerrado com código ${code}`);
        results.v3.details.push(`Servidor: ENCERRADO (code ${code})`);
        results.v3.passed = false;
        resolve(false);
      }
    });
  });
}

// ============================================================================
// VALIDAÇÃO FINAL: TypeScript Check
// ============================================================================
async function validationFinal() {
  log.phase('FINAL', 'TYPECHECK - Zero erros TS');

  try {
    const { stdout, stderr } = await exec(
      'pnpm exec tsc -p tsconfig.server.json --noEmit',
      { cwd: process.cwd(), timeout: 60000 }
    );

    if (stderr && stderr.includes('error')) {
      log.err('Erros de TypeScript encontrados!');
      log.info(stderr);
      results.final.details.push(`Erros TS detectados`);
      results.final.passed = false;
      return false;
    }

    log.ok('ZERO erros de TypeScript');
    results.final.details.push('TypeScript: ZERO ERROS');
    results.final.passed = true;
    return true;
  } catch (error) {
    log.err(`Erro ao rodar typecheck: ${error.message}`);
    results.final.details.push(`Typecheck falhou: ${error.message}`);
    results.final.passed = false;
    return false;
  }
}

// ============================================================================
// Gerar relatório final
// ============================================================================
function generateFinalReport() {
  log.separator();
  console.log(`\n${COLORS.BOLD}═════════════════════════════════════════${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.CYAN}📊 RELATÓRIO DE VERDADE - VALIDAÇÃO REAL${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}═════════════════════════════════════════${COLORS.RESET}`);

  const allPassed = Object.values(results).every((r) => r.passed);

  console.log(`\n${COLORS.BOLD}Resultados:${COLORS.RESET}`);
  for (const [key, result] of Object.entries(results)) {
    const status = result.passed
      ? `${COLORS.GREEN}✅ APROVADO${COLORS.RESET}`
      : `${COLORS.RED}❌ REPROVADO${COLORS.RESET}`;
    console.log(`  ${result.name}: ${status}`);
    if (result.details.length > 0) {
      result.details.forEach((detail) => {
        console.log(`    • ${detail}`);
      });
    }
  }

  console.log(`\n${COLORS.BOLD}Conclusão:${COLORS.RESET}`);
  if (allPassed) {
    console.log(
      `${COLORS.GREEN}${COLORS.BOLD}✅ SISTEMA PRONTO PARA PRODUÇÃO${COLORS.RESET}`
    );
    console.log(`${COLORS.GREEN}Todos os testes passaram com sucesso.${COLORS.RESET}\n`);
  } else {
    console.log(
      `${COLORS.RED}${COLORS.BOLD}❌ PROBLEMAS ENCONTRADOS - CORREÇÃO NECESSÁRIA${COLORS.RESET}`
    );
    const failed = Object.entries(results)
      .filter(([, r]) => !r.passed)
      .map(([, r]) => r.name);
    console.log(`Fases que falharam: ${failed.join(', ')}\n`);
  }

  // Salvar relatório em arquivo
  const reportContent = `RELATÓRIO DE VALIDAÇÃO REAL - ${new Date().toISOString()}
═════════════════════════════════════════════════════════════════

RESUMO EXECUTIVO
━━━━━━━━━━━━━━━━━
Status Geral: ${allPassed ? '✅ APROVADO - PRONTO PARA PRODUÇÃO' : '❌ REPROVADO - CORREÇÃO NECESSÁRIA'}

DETALHES
━━━━━━━━━━━━━━━━━
${Object.entries(results)
  .map(([key, result]) => {
    const status = result.passed ? 'APROVADO' : 'REPROVADO';
    return `
${result.name}: ${status}
${result.details.map((d) => `  • ${d}`).join('\n')}`;
  })
  .join('\n')}

TIMESTAMP
━━━━━━━━━━━━━━━━━
${new Date().toISOString()}
`;

  writeFileSync('FINAL-VALIDATION-REAL-REPORT.txt', reportContent);
  console.log(`${COLORS.CYAN}📄 Relatório salvo em: FINAL-VALIDATION-REAL-REPORT.txt${COLORS.RESET}\n`);

  process.exit(allPassed ? 0 : 1);
}

// ============================================================================
// Orquestrador principal
// ============================================================================
async function main() {
  console.log(`\n${COLORS.BOLD}${COLORS.BLUE}╔════════════════════════════════════════╗${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.BLUE}║  VALIDAÇÃO FINAL REAL - SEM MAKE       ║${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.BLUE}║  Testado • Aprovado ou Reprovado       ║${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.BLUE}╚════════════════════════════════════════╝${COLORS.RESET}\n`);

  try {
    // FASE V1
    const v1Pass = await phaseV1();
    if (!v1Pass) {
      log.err('V1 falhou, interrompendo validação');
      generateFinalReport();
      return;
    }

    // FASE V2
    const v2Pass = await phaseV2();
    if (!v2Pass) {
      log.err('V2 falhou, interrompendo validação');
      generateFinalReport();
      return;
    }

    // FASE V3
    const v3Pass = await phaseV3();
    if (!v3Pass) {
      log.err('V3 falhou, interrompendo validação');
      generateFinalReport();
      return;
    }

    // VALIDAÇÃO FINAL
    await validationFinal();

    // Gerar relatório final
    generateFinalReport();
  } catch (error) {
    log.err(`Erro inesperado: ${error.message}`);
    results.v1.details.push(`Erro: ${error.message}`);
    generateFinalReport();
  }
}

main();
