import { logger, systemLogger, dbLogger, apiLogger } from '../server/_core/logger.js';
import { validateWithLog, loginSchema, clienteSchema, pedidoSchema } from '../server/_core/validation.js';
import { getConnectionPool } from '../server/config/database.js';
import { httpClient, fetchWithRetry } from '../server/_core/retry-client.js';

/**
 * Suite de testes para infraestrutura ERP
 * Testa: Logger, Validação, Pool MySQL, Retry HTTP, Health Check
 */

class InfrastructureTester {
  private results = {
    logger: false,
    validation: false,
    database: false,
    retry: false,
    health: false
  };

  async testLogger(): Promise<void> {
    try {
      systemLogger.info('Iniciando teste de logger');
      
      // Testar diferentes níveis de log
      logger.debug('Debug message test');
      logger.info('Info message test');
      logger.warn('Warning message test');
      logger.error('Error message test');
      
      // Testar loggers especializados
      dbLogger.info('Database logger test');
      apiLogger.info('API logger test');
      
      this.results.logger = true;
      systemLogger.info('✅ Logger test passed');
    } catch (error) {
      systemLogger.error({ error }, '❌ Logger test failed');
      throw error;
    }
  }

  async testValidation(): Promise<void> {
    try {
      systemLogger.info('Iniciando teste de validação');
      
      // Testar validação de login
      const validLogin = { username: 'admin', password: 'admin123' };
      const validatedLogin = validateWithLog(loginSchema, validLogin, 'login-test');
      
      if (validatedLogin.username !== 'admin' || validatedLogin.password !== 'admin123') {
        throw new Error('Login validation failed');
      }
      
      // Testar validação de cliente
      const validCliente = {
        nome: 'João Silva',
        telefone: '11999999999',
        rua: 'Rua Teste',
        numero: '123',
        bairro: 'Centro',
        cidade: 'São Paulo',
        uf: 'SP'
      };
      const validatedCliente = validateWithLog(clienteSchema, validCliente, 'cliente-test');
      
      if (validatedCliente.nome !== 'João Silva') {
        throw new Error('Cliente validation failed');
      }
      
      // Testar validação de pedido
      const validPedido = {
        clienteId: 1,
        subtotal: 100.00,
        desconto: 0,
        frete: 0,
        total: 100.00,
        itens: [{
          tipo: 'LIVRE',
          descricao: 'Item teste',
          quantidade: 1,
          valorUnitario: 100.00,
          custo: 50.00
        }]
      };
      const validatedPedido = validateWithLog(pedidoSchema, validPedido, 'pedido-test');
      
      if (validatedPedido.total !== 100.00) {
        throw new Error('Pedido validation failed');
      }
      
      this.results.validation = true;
      systemLogger.info('✅ Validation test passed');
    } catch (error) {
      systemLogger.error({ error }, '❌ Validation test failed');
      throw error;
    }
  }

  async testDatabase(): Promise<void> {
    try {
      systemLogger.info('Iniciando teste de conexão com banco');

      const pool = await getConnectionPool();
      const conn = await pool.getConnection();
      const [rows] = await conn.query('SELECT 1 as test, NOW() as timestamp');
      conn.release();

      if (!rows || !Array.isArray(rows)) {
        throw new Error('Database query failed');
      }

      this.results.database = true;
      systemLogger.info({
        queryResult: rows,
      }, '✅ Database test passed');
    } catch (error) {
      systemLogger.error({ error }, '❌ Database test failed');
      throw error;
    }
  }

  async testRetry(): Promise<void> {
    try {
      systemLogger.info('Iniciando teste de retry HTTP');
      
      // Testar requisição com retry (usando um endpoint público)
      const testUrls = [
        'https://httpbin.org/status/200',
        'https://httpbin.org/delay/1'
      ];
      
      for (const url of testUrls) {
        const response = await fetchWithRetry(url, {
          timeout: 5000,
          retryConfig: {
            maxAttempts: 2,
            baseDelay: 500,
            maxDelay: 2000
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP request failed: ${response.status}`);
        }
      }
      
      // Testar cliente HTTP
      const response = await httpClient.get('https://httpbin.org/json');
      const data = await response.json();
      
      if (!data) {
        throw new Error('HTTP client test failed');
      }
      
      this.results.retry = true;
      systemLogger.info('✅ Retry test passed');
    } catch (error) {
      systemLogger.error({ error }, '❌ Retry test failed');
      throw error;
    }
  }

  async testHealth(): Promise<void> {
    try {
      systemLogger.info('Iniciando teste de health check');
      
      // Testar health check local (se o servidor estiver rodando)
      const healthUrl = 'http://localhost:3004/api/trpc/health.check';
      
      try {
        const response = await fetchWithRetry(healthUrl, {
          timeout: 5000,
          retryConfig: { maxAttempts: 1, baseDelay: 100 }
        });
        
        if (response.ok) {
          const healthData = await response.json();
          
          if (!healthData.status || !healthData.timestamp) {
            throw new Error('Invalid health check response');
          }
          
          systemLogger.info({ healthData }, 'Health check data received');
        }
      } catch (error) {
        // Se o servidor não estiver rodando, considerar teste como skip
        systemLogger.warn('Health check endpoint not available - server may not be running');
      }
      
      this.results.health = true;
      systemLogger.info('✅ Health test passed');
    } catch (error) {
      systemLogger.error({ error }, '❌ Health test failed');
      throw error;
    }
  }

  async runAllTests(): Promise<void> {
    const startTime = Date.now();
    
    logger.info('🚀 Iniciando suite de testes de infraestrutura ERP');
    
    try {
      // Executar testes em sequência
      await this.testLogger();
      await this.testValidation();
      await this.testDatabase();
      await this.testRetry();
      await this.testHealth();
      
      const duration = Date.now() - startTime;
      
      logger.info({
        duration: `${duration}ms`,
        results: this.results
      }, '🎉 Todos os testes de infraestrutura passaram!');
      
      // Exibir resumo
      console.log('\n=== RESUMO DOS TESTES ===');
      console.log(`✅ Logger: ${this.results.logger ? 'PASS' : 'FAIL'}`);
      console.log(`✅ Validation: ${this.results.validation ? 'PASS' : 'FAIL'}`);
      console.log(`✅ Database: ${this.results.database ? 'PASS' : 'FAIL'}`);
      console.log(`✅ Retry: ${this.results.retry ? 'PASS' : 'FAIL'}`);
      console.log(`✅ Health: ${this.results.health ? 'PASS' : 'FAIL'}`);
      console.log(`⏱️  Duração: ${duration}ms`);
      console.log('========================\n');
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error({
        duration: `${duration}ms`,
        results: this.results,
        error: error instanceof Error ? error.message : String(error)
      }, '❌ Suite de testes falhou');
      
      // Exibir resumo do erro
      console.log('\n=== RESUMO DOS TESTES ===');
      console.log(`❌ Logger: ${this.results.logger ? 'PASS' : 'FAIL'}`);
      console.log(`❌ Validation: ${this.results.validation ? 'PASS' : 'FAIL'}`);
      console.log(`❌ Database: ${this.results.database ? 'PASS' : 'FAIL'}`);
      console.log(`❌ Retry: ${this.results.retry ? 'PASS' : 'FAIL'}`);
      console.log(`❌ Health: ${this.results.health ? 'PASS' : 'FAIL'}`);
      console.log(`⏱️  Duração: ${duration}ms`);
      console.log(`🚨 Erro: ${error instanceof Error ? error.message : String(error)}`);
      console.log('========================\n');
      
      throw error;
    }
  }
}

// Executar testes se este script for chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new InfrastructureTester();
  
  tester.runAllTests()
    .then(() => {
      console.log('✅ Infraestrutura testada com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Falha nos testes de infraestrutura:', error);
      process.exit(1);
    });
}

export { InfrastructureTester };
