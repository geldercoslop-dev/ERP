import 'dotenv/config';
import { PerformanceSimulator } from './server/_core/performance-simulator.js';

async function main() {
  // Garantir que .env foi carregado
  if (!process.env.REDIS_HOST) {
    console.error('❌ Variáveis de ambiente não carregadas');
    console.error('Definindo valores padrão para teste...\n');
    
    // Valores padrão para teste
    process.env.JWT_SECRET ||= '9b28852edc92a455e7faa34d12f95f6b0a0e6d0e3ecd76d5662fb3c2f30215dfeafa60a3e30ecb5564abb4bb324d19720b3d02be9dc307e5b3e4acf2f6dcb0fa';
    process.env.DB_HOST ||= 'localhost';
    process.env.DB_PORT ||= '3306';
    process.env.DB_USER ||= 'test';
    process.env.DB_PASSWORD ||= 'test';
    process.env.DB_NAME ||= 'erp_test';
    process.env.REDIS_HOST ||= 'localhost';
    process.env.REDIS_PORT ||= '6379';
  }

  const simulator = new PerformanceSimulator(100);
  
  try {
    // Simulação principal: 100 tenants × 1000 requests
    console.log('\n🔥 INICIANDO SIMULAÇÃO DE PERFORMANCE\n');
    console.log('Cenário: 100 tenants × 1000 requests = 100.000 total requests\n');
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

main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
