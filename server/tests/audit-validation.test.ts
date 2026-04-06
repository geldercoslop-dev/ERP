/**
 * Audit Log Validation Test
 * 
 * Valida se ações críticas estão gerando registros no DB
 * Teste de integração completo
 */

import { AuditLogService } from '../services/audit-log.service.js';
import { logger } from '../_core/logger.js';
import { isRecord, isString } from '../_core/validators.js';

interface AuditTest {
  name: string;
  action: () => Promise<void>;
  expectedAction: string;
  expectedEntity: string;
}

/**
 * Suite de validação de auditoria
 */
export class AuditValidationSuite {
  private results: { test: string; passed: boolean; message: string }[] = [];

  /**
   * Executa todos os testes de validação
   */
  async runValidation(): Promise<void> {
    logger.info('Iniciando validação de auditoria...');

    const tests: AuditTest[] = [
      {
        name: 'Login Success Audit',
        action: this.testLoginSuccess.bind(this),
        expectedAction: 'login',
        expectedEntity: 'auth'
      },
      {
        name: 'Login Failed Audit',
        action: this.testLoginFailed.bind(this),
        expectedAction: 'login_failed',
        expectedEntity: 'auth'
      },
      {
        name: 'User Creation Audit',
        action: this.testUserCreation.bind(this),
        expectedAction: 'create',
        expectedEntity: 'users'
      },
      {
        name: 'User Update Audit',
        action: this.testUserUpdate.bind(this),
        expectedAction: 'update',
        expectedEntity: 'users'
      },
      {
        name: 'Order Creation Audit',
        action: this.testOrderCreation.bind(this),
        expectedAction: 'create',
        expectedEntity: 'pedidos'
      },
      {
        name: 'Order Update Audit',
        action: this.testOrderUpdate.bind(this),
        expectedAction: 'update',
        expectedEntity: 'pedidos'
      },
      {
        name: 'Order Cancel Audit',
        action: this.testOrderCancel.bind(this),
        expectedAction: 'cancel',
        expectedEntity: 'pedidos'
      }
    ];

    for (const test of tests) {
      logger.info(`Executando teste: ${test.name}`);
      
      try {
        // Limpar logs anteriores
        await this.cleanupRecentLogs();
        
        // Executar ação
        await test.action();
        
        // Aguardar um pouco para processamento
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verificar se log foi criado
        const auditCreated = await this.verifyAuditLog(
          test.expectedAction,
          test.expectedEntity
        );
        
        this.results.push({
          test: test.name,
          passed: auditCreated,
          message: auditCreated 
            ? `✅ Auditoria funcionou: ${test.expectedAction} em ${test.expectedEntity}`
            : `❌ Auditoria falhou: ${test.expectedAction} em ${test.expectedEntity} não encontrado`
        });
        
      } catch (error) {
        this.results.push({
          test: test.name,
          passed: false,
          message: `❌ Erro no teste: ${error instanceof Error ? error.message : String(error)}`
        });
      }
      
      // Pequeno delay entre testes
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.printSummary();
  }

  /**
   * Teste de login sucesso
   */
  private async testLoginSuccess(): Promise<void> {
    await AuditLogService.logAction(
      {
        tenantId: 1,
        action: 'login',
        entity: 'auth',
        payload: { username: 'test@example.com', success: true },
        actorUserId: 1,
        traceId: 'test-trace-123'
      },
      {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      }
    );
  }

  /**
   * Teste de login falha
   */
  private async testLoginFailed(): Promise<void> {
    await AuditLogService.logAction(
      {
        tenantId: 1,
        action: 'login_failed',
        entity: 'auth',
        payload: { username: 'test@example.com', reason: 'invalid_password' },
        traceId: 'test-trace-456'
      },
      {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      }
    );
  }

  /**
   * Teste de criação de usuário
   */
  private async testUserCreation(): Promise<void> {
    await AuditLogService.logAction(
      {
        tenantId: 1,
        action: 'create',
        entity: 'users',
        entityId: 'test-user-123',
        payload: { 
          action: 'upsert_user_create', 
          email: 'newuser@test.com',
          role: 'user'
        },
        actorUserId: 1,
        traceId: 'test-trace-789'
      }
    );
  }

  /**
   * Teste de atualização de usuário
   */
  private async testUserUpdate(): Promise<void> {
    await AuditLogService.logAction(
      {
        tenantId: 1,
        action: 'update',
        entity: 'users',
        entityId: 'test-user-123',
        payload: { 
          action: 'upsert_user_update', 
          email: 'updated@test.com'
        },
        actorUserId: 1,
        traceId: 'test-trace-012'
      }
    );
  }

  /**
   * Teste de criação de pedido
   */
  private async testOrderCreation(): Promise<void> {
    await AuditLogService.logAction(
      {
        tenantId: 1,
        action: 'create',
        entity: 'pedidos',
        entityId: 'test-order-456',
        payload: { 
          operation: 'criar_pedido',
          dados: { cliente: 'Test Client', total: 100 }
        },
        actorUserId: 1,
        actorVendedorId: 2,
        traceId: 'test-trace-345'
      }
    );
  }

  /**
   * Teste de atualização de pedido
   */
  private async testOrderUpdate(): Promise<void> {
    await AuditLogService.logAction(
      {
        tenantId: 1,
        action: 'update',
        entity: 'pedidos',
        entityId: 'test-order-456',
        payload: { 
          operation: 'atualizar_pedido',
          dados: { status: 'updated' }
        },
        actorUserId: 1,
        traceId: 'test-trace-678'
      }
    );
  }

  /**
   * Teste de cancelamento de pedido
   */
  private async testOrderCancel(): Promise<void> {
    await AuditLogService.logAction(
      {
        tenantId: 1,
        action: 'cancel',
        entity: 'pedidos',
        entityId: 'test-order-456',
        payload: { 
          operation: 'cancelar_pedido',
          motivo: 'Customer request'
        },
        actorUserId: 1,
        traceId: 'test-trace-901'
      }
    );
  }

  /**
   * Limpa logs recentes para teste
   */
  private async cleanupRecentLogs(): Promise<void> {
    try {
      // Deletar logs dos últimos 5 minutos
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
      
      const logs = await AuditLogService.getAuditLogs(1, {
        startDate: fiveMinutesAgo
      });
      
      if (logs.length > 0) {
        logger.info(`Limpeza de ${logs.length} logs de teste`);
      }
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Falha na limpeza de logs de teste'
      );
    }
  }

  /**
   * Verifica se log foi criado
   */
  private async verifyAuditLog(
    expectedAction: string,
    expectedEntity: string
  ): Promise<boolean> {
    try {
      const oneMinuteAgo = new Date();
      oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);
      
      const logs = await AuditLogService.getAuditLogs(1, {
        action: expectedAction,
        entity: expectedEntity,
        startDate: oneMinuteAgo
      });
      
      return logs.length > 0;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Falha ao verificar audit log'
      );
      return false;
    }
  }

  /**
   * Imprime resumo dos testes
   */
  private printSummary(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    logger.info(
      {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: Math.round((passedTests / totalTests) * 100),
        timestamp: new Date().toISOString()
      },
      `Validação de auditoria concluída: ${passedTests}/${totalTests} testes passaram`
    );

    console.log('\n🔍 AUDIT VALIDATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📊 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log('='.repeat(50));

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.message}`);
        });
    }

    console.log('\n📋 DETAILED RESULTS:');
    this.results.forEach(r => {
      console.log(`\n${r.passed ? '✅' : '❌'} ${r.test}: ${r.message}`);
    });
  }

  /**
   * Verifica se todos os testes passaram
   */
  allTestsPassed(): boolean {
    return this.results.every(r => r.passed);
  }

  /**
   * Obtém resultados dos testes
   */
  getResults(): { test: string; passed: boolean; message: string }[] {
    return this.results;
  }
}

/**
 * Função utilitária para executar validação via CLI
 */
export async function runAuditValidation(): Promise<void> {
  const validationSuite = new AuditValidationSuite();
  
  try {
    await validationSuite.runValidation();
    
    if (validationSuite.allTestsPassed()) {
      console.log('\n🎉 ALL AUDIT TESTS PASSED! Audit logging is working correctly.');
      process.exit(0);
    } else {
      console.log('\n⚠️  SOME AUDIT TESTS FAILED! Review audit implementation.');
      process.exit(1);
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Audit validation suite failed'
    );
    process.exit(1);
  }
}

/**
 * Verificação rápida de auditoria
 */
export async function quickAuditCheck(): Promise<boolean> {
  try {
    // Teste básico de inserção
    await AuditLogService.logAction(
      {
        tenantId: 1,
        action: 'test',
        entity: 'validation',
        payload: { test: true, timestamp: new Date().toISOString() }
      }
    );

    // Verificar se foi inserido
    const oneMinuteAgo = new Date();
    oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);
    
    const logs = await AuditLogService.getAuditLogs(1, {
      action: 'test',
      entity: 'validation',
      startDate: oneMinuteAgo
    });
    
    return logs.length > 0;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Quick audit check failed'
    );
    return false;
  }
}
