// Teste para validar carregamento das variáveis Redis
import { config } from 'dotenv';

// Carregar .env
config();

console.log('=== VALIDAÇÃO DE VARIÁVEIS REDIS ===');
console.log('REDIS_HOST:', process.env.REDIS_HOST);
console.log('REDIS_PORT:', process.env.REDIS_PORT);
console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD);
console.log('REDIS_URL:', process.env.REDIS_URL);

// Validação obrigatória
const requiredVars = ['REDIS_HOST', 'REDIS_PORT'];
const missing = requiredVars.filter(varName => !process.env[varName]);

if (missing.length > 0) {
  console.error('\n❌ VARIÁVEIS OBRIGATÓRIAS FALTANDO:', missing);
  throw new Error(`Variáveis obrigatórias faltando: ${missing.join(', ')}`);
} else {
  console.log('\n✅ TODAS AS VARIÁVEIS OBRIGATÓRIAS CARREGADAS');
}

// Testar conexão Redis real
import Redis from 'ioredis';

async function testRedisConnection() {
  console.log('\n=== TESTANDO CONEXÃO REDIS ===');
  
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD || undefined,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  });

  try {
    await redis.connect();
    console.log('✅ Conectado ao Redis com sucesso');
    
    // Testar operação básica
    await redis.set('test-key', 'test-value');
    const value = await redis.get('test-key');
    console.log('✅ Operação SET/GET funcionando:', value);
    
    await redis.del('test-key');
    console.log('✅ Operação DEL funcionando');
    
  } catch (error) {
    console.error('❌ Erro na conexão Redis:', error.message);
    throw error;
  } finally {
    await redis.disconnect();
  }
}

testRedisConnection().then(() => {
  console.log('\n🎉 REDIS CONFIGURADO CORRETAMENTE');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ FALHA NA CONFIGURAÇÃO REDIS:', error.message);
  process.exit(1);
});
