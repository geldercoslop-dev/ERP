import { config } from 'dotenv';

// Carregar .env antes de tudo
config();

import { PerformanceSimulator } from './_core/performance-simulator.js';

async function runRedisTest() {
  console.log('=== TESTE DE PERFORMANCE COM REDIS REAL ===');
  
  // Validar variáveis Redis antes de começar
  const requiredVars = ['REDIS_HOST', 'REDIS_PORT'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ VARIÁVEIS REDIS FALTANDO:', missing);
    process.exit(1);
  }
  
  console.log('✅ Redis configurado:', {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD ? '***' : 'none'
  });
  
  const simulator = new PerformanceSimulator(100);
  
  try {
    console.log('\n🚀 INICIANDO SIMULAÇÃO COM REDIS REAL...');
    await simulator.simulateLoad(1000);
    console.log('\n🎉 TESTE CONCLUÍDO COM REDIS REAL!');
  } catch (error) {
    console.error('\n❌ ERRO NO TESTE COM REDIS:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runRedisTest();
