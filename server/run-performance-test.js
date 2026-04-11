import { PerformanceSimulator } from './_core/performance-simulator.js';

async function runTest() {
  console.log('Iniciando teste de performance...');
  const simulator = new PerformanceSimulator(100);
  
  try {
    await simulator.simulateLoad(1000);
    console.log('Teste concluído com sucesso!');
  } catch (error) {
    console.error('Erro no teste:', error);
  }
}

runTest();
