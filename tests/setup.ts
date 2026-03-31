/**
 * Configuração global dos testes
 */

import { beforeAll, afterAll } from 'vitest';

// Antes de qualquer import que chame parseEnv() / getDb() — obrigatório para integração.
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? "test-jwt-access-secret-min-10-chars";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? "test-jwt-refresh-secret-min10chars";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "mysql://root:@localhost:3306/vendas_app";
}

// Configuração do ambiente de teste
beforeAll(async () => {
  console.log('🧪 Inicializando ambiente de testes');
  
  // Configurar variáveis de ambiente para testes
  process.env.NODE_ENV = 'test';
  process.env.DEFAULT_TENANT_ID = '1';
  process.env.ADMIN_INITIAL_PASSWORD = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO9W'; // hash de "TestAdmin123!"
  process.env.LOG_LEVEL = 'error';
  // getDb exige contexto ALS salvo (service-entry-guard); testes usam caminho direto.
  process.env.SERVICE_ENTRY_GUARD = '0';
});

afterAll(async () => {
  console.log('🧪 Finalizando ambiente de testes');
  
  // Limpeza do ambiente
  process.env.NODE_ENV = 'development';
});
