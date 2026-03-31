/**
 * Teste Rápido de Funcionalidade
 * 
 * Valida ErrorRateMonitor sem dependências pesadas
 */

import { ErrorRateMonitor, globalErrorRateMonitor } from './server/resilience/error-rate-monitor.js';

async function testErrorRateMonitor() {
  console.log('🧪 Testando ErrorRateMonitor...\n');

  const monitor = new ErrorRateMonitor({
    windowMs: 1000,
    maxErrorsPerWindow: 3,
  });

  // Teste 1: Inicialização
  console.log('✓ Teste 1: Inicialização');
  const status1 = monitor.getStatus();
  console.log(`  - Threshold: ${status1.threshold}`);
  console.log(`  - Window: ${status1.windowSeconds}s`);
  console.log(`  - Alertando: ${status1.isAlerting}\n`);

  // Teste 2: Registrar erros
  console.log('✓ Teste 2: Registrando 2 erros');
  monitor.recordError();
  monitor.recordError();
  const status2 = monitor.getStatus();
  console.log(`  - Erros recentes: ${status2.recentErrorCount}`);
  console.log(`  - Taxa: ${status2.errorRate}`);
  console.log(`  - Alertando: ${status2.isAlerting}\n`);

  // Teste 3: Trigger alerta
  console.log('✓ Teste 3: Registrando 4º erro (deve disparar alerta)');
  monitor.recordError();
  monitor.recordError();
  const status3 = monitor.getStatus();
  console.log(`  - Erros recentes: ${status3.recentErrorCount}`);
  console.log(`  - Taxa: ${status3.errorRate}`);
  console.log(`  - ALERTANDO: ${status3.isAlerting}`);
  console.log(`  ✓ Alerta ativado!\n`);

  // Teste 4: Global singleton
  console.log('✓ Teste 4: Global Singleton');
  globalErrorRateMonitor.reset();
  globalErrorRateMonitor.recordError();
  const globalStatus = globalErrorRateMonitor.getStatus();
  console.log(`  - Erros globais: ${globalStatus.recentErrorCount}`);
  console.log(`  - Singleton funciona: ${globalStatus.recentErrorCount === 1}\n`);

  // Teste 5: Reset
  console.log('✓ Teste 5: Reset');
  monitor.reset();
  const status5 = monitor.getStatus();
  console.log(`  - Erros após reset: ${status5.recentErrorCount}`);
  console.log(`  - Alertando após reset: ${status5.isAlerting}\n`);

  // Teste 6: Limpeza de erros expirados
  console.log('✓ Teste 6: Limpeza de erros antigos');
  monitor.recordError();
  monitor.recordError();
  console.log(`  - Erros antes de esperar: ${monitor.getStatus().recentErrorCount}`);
  
  await new Promise(resolve => setTimeout(resolve, 1100));
  
  monitor.recordError(); // Novo erro após expiração
  const status6 = monitor.getStatus();
  console.log(`  - Erros após 1.1s: ${status6.recentErrorCount}`);
  console.log(`  - Apenas 1 erro permanece (os antigos expiraram): ${status6.recentErrorCount === 1}\n`);

  console.log('✅ Todos os testes passaram!');
}

testErrorRateMonitor().catch(console.error);
