import { PerformanceSimulator } from './server/_core/performance-simulator.js';

async function main() {
  const simulator = new PerformanceSimulator(100);
  
  try {
    // Simulação principal
    console.log('\n🔥 INICIANDO SIMULAÇÃO DE PERFORMANCE\n');
    await simulator.simulateLoad(1000);
    
    // Stress test progressivo
    console.log('\n🔥 INICIANDO STRESS TEST PROGRESSIVO\n');
    await simulator.progressiveStressTest();
    
  } catch (error) {
    console.error('❌ Erro na simulação:', error);
    process.exit(1);
  } finally {
    console.log('\n=== SIMULAÇÃO CONCLUÍDA ===\n');
    process.exit(0);
  }
}

main();
