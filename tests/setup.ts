/**
 * Configuração global dos testes
 */

import { beforeAll, afterAll } from 'vitest';

// Configuração do ambiente de teste
beforeAll(async () => {
  console.log('🧪 Inicializando ambiente de testes');
  
  // Configurar variáveis de ambiente para testes
  process.env.NODE_ENV = 'test';
  process.env.DEFAULT_TENANT_ID = '1';
  process.env.ADMIN_INITIAL_PASSWORD = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO9W'; // hash de "TestAdmin123!"
  // Usar banco de dados de desenvolvimento para testes se o de teste não estiver disponível
  // ou configurar uma URL válida que o sistema consiga conectar
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'mysql://root:@localhost:3306/vendas_app';
  }
  process.env.LOG_LEVEL = 'error';
  // getDb exige contexto ALS salvo (service-entry-guard); testes usam caminho direto.
  process.env.SERVICE_ENTRY_GUARD = '0';
});

afterAll(async () => {
  console.log('🧪 Finalizando ambiente de testes');
  
  // Limpeza do ambiente
  process.env.NODE_ENV = 'development';
});
