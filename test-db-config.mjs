import { parseEnv } from './server/services/env.schema.js';

// Script de teste que replica DB connection do server

console.log('🔥 ===== DATABASE CONNECTION TEST =====');
console.log('🔥 NODE_ENV:', process.env.NODE_ENV);

// Parse .env
const env = parseEnv();
console.log('🔥 DATABASE_URL from env.schema:', env.DATABASE_URL);

// Parse URL como faz database.ts
try {
  const urlString = env.DATABASE_URL.trim();
  const u = new URL(urlString);
  
  const poolConfig = {
    host: u.hostname,
    port: parseInt(u.port || '3306', 10),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '').split('/')[0],
  };
  
  console.log('\n🔥 ===== POOL CONFIG PARSED =====');
  console.log('🔥 host:', poolConfig.host);
  console.log('🔥 port:', poolConfig.port);
  console.log('🔥 database:', poolConfig.database);
  console.log('🔥 user:', poolConfig.user);
  
  // Check for cache
  if (poolConfig.host === 'localhost' || poolConfig.host === '127.0.0.1') {
    console.log('\n🔴 ⚠️ PROBLEMA CRÍTICO: Host é localhost (cacheado!)');
    console.log('   Esperado na rede Docker: vendas-mysql (nome do serviço no compose)');
    console.log('   Possível causa: env.schema.ts ou getDatabaseConfig() está retornando cache antigo');
    process.exit(1);
  } else if (poolConfig.host === 'mysql') {
    console.log('\n🔴 Host "mysql" é legado; use vendas-mysql (serviço no docker-compose)');
    process.exit(1);
  } else if (poolConfig.host === 'vendas-mysql') {
    console.log('\n✅ CORRETO: Host é vendas-mysql (Docker network)');
  }
  
  console.log('\n✅ DATABASE_URL será usado corretamente para criar pool!');

} catch (err) {
  console.error('🔴 Erro:', err.message);
  process.exit(1);
}
