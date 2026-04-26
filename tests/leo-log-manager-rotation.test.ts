#!/usr/bin/env tsx
/**
 * FASE 6: Teste de Rotação de Logs - LeoLogManager
 * 
 * Simula cenários de erro e valida comportamento fail-safe
 */

import { initEnv } from "../server/_core/env/bootstrapEnv.js";
import { existsSync, rmSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { leoLogManager } from '../server/leo/utils/leo-log-manager.js';

// Bootstrap ENV
initEnv();

const TEST_LOG_DIR = join(process.cwd(), 'logs-test-rotation');

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function logResult(test: string, status: 'PASS' | 'FAIL', details: string) {
  results.push({ test, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${test}: ${details}`);
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     FASE 6: TESTE DE ROTAÇÃO DE LOGS                      ║');
  console.log('║     LeoLogManager Fail-Safe Validation                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Access the singleton instance
  const manager = leoLogManager as any;
  const originalConfig = { ...manager.config };
  const originalLogFile = manager.currentLogFile;

  // ============================================================================
  // TEST 1: Diretório inexistente
  // ============================================================================
  console.log('TEST 1: Diretório inexistente');
  console.log('='.repeat(70));

  try {
    // Remover diretório de teste se existir
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }

    // Alterar configuração para usar diretório de teste
    manager.config.logDirectory = TEST_LOG_DIR;
    manager.setupCurrentLogFile();

    // Tentar escrever log
    manager.writeLog({
      timestamp: new Date(),
      level: 'INFO',
      module: 'TEST',
      message: 'Teste com diretório inexistente',
    });

    // Verificar se diretório foi criado
    if (existsSync(TEST_LOG_DIR)) {
      logResult('TEST 1', 'PASS', 'Diretório criado automaticamente');
    } else {
      logResult('TEST 1', 'FAIL', 'Diretório não foi criado');
    }

    // Limpar
    rmSync(TEST_LOG_DIR, { recursive: true, force: true });

  } catch (error) {
    logResult('TEST 1', 'FAIL', `Erro: ${error instanceof Error ? error.message : String(error)}`);
    // Limpar
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  }

  // ============================================================================
  // TEST 2: Arquivo inexistente
  // ============================================================================
  console.log('\nTEST 2: Arquivo inexistente');
  console.log('='.repeat(70));

  try {
    // Criar diretório de teste
    if (!existsSync(TEST_LOG_DIR)) {
      mkdirSync(TEST_LOG_DIR, { recursive: true });
    }

    // Alterar configuração para usar diretório de teste
    manager.config.logDirectory = TEST_LOG_DIR;
    manager.setupCurrentLogFile();

    // Tentar escrever log
    manager.writeLog({
      timestamp: new Date(),
      level: 'INFO',
      module: 'TEST',
      message: 'Teste com arquivo inexistente',
    });

    // Verificar se arquivo foi criado
    const logFile = manager.currentLogFile;
    if (existsSync(logFile)) {
      logResult('TEST 2', 'PASS', 'Arquivo criado automaticamente');
    } else {
      logResult('TEST 2', 'FAIL', 'Arquivo não foi criado');
    }

    // Limpar
    rmSync(TEST_LOG_DIR, { recursive: true, force: true });

  } catch (error) {
    logResult('TEST 2', 'FAIL', `Erro: ${error instanceof Error ? error.message : String(error)}`);
    // Limpar
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  }

  // ============================================================================
  // TEST 3: Rotação simultânea
  // ============================================================================
  console.log('\nTEST 3: Rotação simultânea');
  console.log('='.repeat(70));

  try {
    // Criar diretório de teste
    if (!existsSync(TEST_LOG_DIR)) {
      mkdirSync(TEST_LOG_DIR, { recursive: true });
    }

    // Alterar configuração para usar diretório de teste
    manager.config.logDirectory = TEST_LOG_DIR;
    manager.setupCurrentLogFile();

    // Simular rotação simultânea
    const rotationPromises = [];
    for (let i = 0; i < 5; i++) {
      rotationPromises.push(
        new Promise<void>((resolve) => {
          manager.rotateLogFile();
          resolve();
        })
      );
    }

    await Promise.all(rotationPromises);

    // Verificar se não houve crash
    logResult('TEST 3', 'PASS', 'Rotações simultâneas não causaram crash');

    // Limpar
    rmSync(TEST_LOG_DIR, { recursive: true, force: true });

  } catch (error) {
    logResult('TEST 3', 'FAIL', `Erro: ${error instanceof Error ? error.message : String(error)}`);
    // Limpar
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  }

  // ============================================================================
  // TEST 4: Erro de IO (permissão negada simulada)
  // ============================================================================
  console.log('\nTEST 4: Erro de IO');
  console.log('='.repeat(70));

  try {
    // Criar diretório de teste
    if (!existsSync(TEST_LOG_DIR)) {
      mkdirSync(TEST_LOG_DIR, { recursive: true });
    }

    // Alterar configuração para usar diretório de teste
    manager.config.logDirectory = TEST_LOG_DIR;
    manager.setupCurrentLogFile();

    // Simular erro de IO usando caminho inválido
    const originalPath = manager.config.logDirectory;
    manager.config.logDirectory = '/invalid/path/that/does/not/exist';

    // Tentar escrever log (não deve crashar)
    manager.writeLog({
      timestamp: new Date(),
      level: 'INFO',
      module: 'TEST',
      message: 'Teste com erro de IO',
    });

    // Restaurar caminho
    manager.config.logDirectory = originalPath;

    logResult('TEST 4', 'PASS', 'Erro de IO não causou crash (fail-safe)');

    // Limpar
    rmSync(TEST_LOG_DIR, { recursive: true, force: true });

  } catch (error) {
    logResult('TEST 4', 'FAIL', `Erro: ${error instanceof Error ? error.message : String(error)}`);
    // Limpar
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  }

  // ============================================================================
  // TEST 5: Logs continuam sendo gravados após erro
  // ============================================================================
  console.log('\nTEST 5: Logs continuam sendo gravados após erro');
  console.log('='.repeat(70));

  try {
    // Criar diretório de teste
    if (!existsSync(TEST_LOG_DIR)) {
      mkdirSync(TEST_LOG_DIR, { recursive: true });
    }

    // Alterar configuração para usar diretório de teste
    manager.config.logDirectory = TEST_LOG_DIR;
    manager.setupCurrentLogFile();

    // Resetar tamanho para evitar rotação durante teste
    manager.currentFileSize = 0;

    // Escrever log normal
    manager.writeLog({
      timestamp: new Date(),
      level: 'INFO',
      module: 'TEST',
      message: 'Log antes do erro',
    });

    // Simular erro - desabilitar rotação temporariamente
    const originalMaxSize = manager.config.maxFileSize;
    const originalDailyRotation = manager.config.enableDailyRotation;
    manager.config.maxFileSize = 999999; // Muito grande para evitar rotação
    manager.config.enableDailyRotation = false; // Desabilitar rotação diária

    const originalPath = manager.config.logDirectory;
    manager.config.logDirectory = '/invalid/path';
    manager.writeLog({
      timestamp: new Date(),
      level: 'INFO',
      module: 'TEST',
      message: 'Log com erro',
    });

    // Restaurar caminho
    manager.config.logDirectory = originalPath;
    manager.setupCurrentLogFile();
    manager.currentFileSize = 0; // Resetar tamanho

    // Escrever log após erro
    manager.writeLog({
      timestamp: new Date(),
      level: 'INFO',
      module: 'TEST',
      message: 'Log após erro',
    });

    // Restaurar configuração
    manager.config.maxFileSize = originalMaxSize;
    manager.config.enableDailyRotation = originalDailyRotation;

    // Verificar se arquivo tem conteúdo
    const logFile = manager.currentLogFile;
    if (existsSync(logFile)) {
      const content = readFileSync(logFile, 'utf8');
      if (content.includes('Log antes do erro') && content.includes('Log após erro')) {
        logResult('TEST 5', 'PASS', 'Logs continuam sendo gravados após erro');
      } else {
        logResult('TEST 5', 'FAIL', 'Logs não foram gravados corretamente');
      }
    } else {
      logResult('TEST 5', 'FAIL', 'Arquivo de log não existe');
    }

    // Limpar
    rmSync(TEST_LOG_DIR, { recursive: true, force: true });

  } catch (error) {
    logResult('TEST 5', 'FAIL', `Erro: ${error instanceof Error ? error.message : String(error)}`);
    // Limpar
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  }

  // ============================================================================
  // TEST 6: Sistema não para após erro de log
  // ============================================================================
  console.log('\nTEST 6: Sistema não para após erro de log');
  console.log('='.repeat(70));

  try {
    // Alterar configuração para usar caminho inválido
    const originalPath = manager.config.logDirectory;
    const originalMaxSize = manager.config.maxFileSize;
    const originalDailyRotation = manager.config.enableDailyRotation;
    manager.config.logDirectory = '/invalid/path';
    manager.config.maxFileSize = 999999; // Evitar rotação
    manager.config.enableDailyRotation = false; // Evitar rotação diária

    // Tentar escrever múltiplos logs
    for (let i = 0; i < 10; i++) {
      manager.writeLog({
        timestamp: new Date(),
        level: 'INFO',
        module: 'TEST',
        message: `Log ${i}`,
      });
    }

    // Restaurar caminho
    manager.config.logDirectory = originalPath;
    manager.config.maxFileSize = originalMaxSize;
    manager.config.enableDailyRotation = originalDailyRotation;

    logResult('TEST 6', 'PASS', 'Sistema não parou após múltiplos erros de log');

  } catch (error) {
    logResult('TEST 6', 'FAIL', `Erro: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Restaurar configuração original
  manager.config = originalConfig;
  manager.currentLogFile = originalLogFile;

  // ============================================================================
  // RESUMO
  // ============================================================================
  console.log('\n' + '='.repeat(70));
  console.log('RESUMO DOS TESTES');
  console.log('='.repeat(70));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\nTotal: ${results.length}`);
  console.log(`✅ Passou: ${passed}`);
  console.log(`❌ Falhou: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ TESTES FALHARAM');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`   - ${r.test}: ${r.details}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ TODOS OS TESTES PASSARAM');
    console.log('✔ Nenhum crash');
    console.log('✔ Logs continuam sendo gravados');
    console.log('✔ Sistema não para');
    process.exit(0);
  }
}

runTests().catch((error) => {
  console.error('Fatal error during tests:', error);
  process.exit(1);
});
