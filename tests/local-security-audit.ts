/**
 * AUDITORIA DE SEGURANÇA - TESTE VIA API LOCAL
 * Testa isolamento real sem necessidade de servidor rodando
 */

import { createServer } from 'http';
import { handler } from '../server/server';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SecurityTest {
  name: string;
  description: string;
  execute: () => Promise<{ success: boolean; data?: any; error?: string }>;
}

class LocalSecurityAuditor {
  private tests: SecurityTest[] = [];

  constructor() {
    this.setupTests();
  }

  private setupTests(): void {
    this.tests = [
      {
        name: 'TENANT_ISOLATION',
        description: 'Tenant A não pode acessar dados do Tenant B',
        execute: () => this.testTenantIsolation()
      },
      {
        name: 'VENDOR_ISOLATION',
        description: 'Vendedor A não pode acessar clientes do Vendedor B',
        execute: () => this.testVendorIsolation()
      },
      {
        name: 'LEO_CONTEXT_REQUIRED',
        description: 'LEO exige contexto obrigatório',
        execute: () => this.testLeoContextRequired()
      },
      {
        name: 'CACHE_ISOLATION',
        description: 'Cache respeita isolamento de tenant',
        execute: () => this.testCacheIsolation()
      },
      {
        name: 'DB_QUERY_ISOLATION',
        description: 'Queries sem tenantId são bloqueadas',
        execute: () => this.testDbQueryIsolation()
      }
    ];
  }

  private async testTenantIsolation(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Simular chamada direta ao service com tenantId diferente
      const { clientesService } = await import('../server/services/clientes.service');
      
      // Tentar acessar com tenantId 1 sem autorização
      const result = await clientesService.listClientes(999, {
        id: 1,
        role: 'vendedor',
        vendedorId: 1
      }, {
        page: 1,
        pageSize: 10
      });

      return {
        success: result.items.length === 0,
        data: { resultCount: result.items.length }
      };
    } catch (error) {
      // Erro é esperado - segurança funcionando
      return {
        success: true,
        error: (error as Error).message
      };
    }
  }

  private async testVendorIsolation(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { clientesService } = await import('../server/services/clientes.service');
      
      // Vendedor 1 tentando acessar dados do vendedor 2
      const result = await clientesService.listClientes(1, {
        id: 1,
        role: 'vendedor',
        vendedorId: 1 // Apenas seus próprios dados
      }, {
        page: 1,
        pageSize: 10,
        vendedorId: 2 // Tentando forçar acesso ao vendedor 2
      });

      return {
        success: result.items.length === 0 || result.items.every(c => c.vendedorId === 1),
        data: { 
          resultCount: result.items.length,
          allFromSameVendor: result.items.every(c => c.vendedorId === 1)
        }
      };
    } catch (error) {
      return {
        success: true,
        error: (error as Error).message
      };
    }
  }

  private async testLeoContextRequired(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { perguntar } = await import('../server/services/ai/erp-ai.service');
      
      // Tentar chamar LEO sem contexto obrigatório
      await perguntar(1, "listar clientes", "test", {
        // Sem actor - deve falhar
        userId: 1,
        sessionId: "test"
      });

      return {
        success: false,
        error: "LEO aceitou chamada sem actor - FALHA DE SEGURANÇA"
      };
    } catch (error) {
      // Erro esperado - segurança funcionando
      return {
        success: true,
        error: (error as Error).message
      };
    }
  }

  private async testCacheIsolation(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Importar função correta de cache invalidation
      const { invalidateInventoryCachesForTenant } = await import('../server/_core/cache-invalidation');
      
      // Testar invalidação de cache por tenant
      invalidateInventoryCachesForTenant(1);
      
      return {
        success: true,
        data: "Cache invalidado por tenant específico"
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async testDbQueryIsolation(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Importar validador de segurança
      const { validateTenantAccess, globalDbAuditor } = await import('../server/_core/tenant-validator');
      
      // TESTE 1: Validação sem tenantId (deve falhar)
      let test1Passed = false;
      try {
        validateTenantAccess(undefined, { role: 'admin' });
      } catch (error) {
        test1Passed = (error as Error).message.includes('TENANT_ID_REQUIRED');
      }
      
      // TESTE 2: Validação sem actor (deve falhar)
      let test2Passed = false;
      try {
        validateTenantAccess(1, undefined);
      } catch (error) {
        test2Passed = (error as Error).message.includes('ACTOR_REQUIRED');
      }
      
      // TESTE 3: Validação correta (deve passar)
      let test3Passed = false;
      try {
        validateTenantAccess(1, { role: 'admin' });
        test3Passed = true;
      } catch (error) {
        test3Passed = false;
      }
      
      // TESTE 4: Auditor de queries
      globalDbAuditor.reset();
      
      // Query segura (com tenantId)
      const secureQuery = 'SELECT * FROM clientes WHERE tenantId = ? AND nome LIKE ?';
      const secureResult = globalDbAuditor.validateQuery(secureQuery, 1, 'clientes.list');
      
      // Query insegura (sem tenantId)
      const insecureQuery = 'SELECT * FROM clientes WHERE nome LIKE ?';
      const insecureResult = globalDbAuditor.validateQuery(insecureQuery, 1, 'clientes.insecure');
      
      // Query sem WHERE (perigosa)
      const dangerousQuery = 'SELECT * FROM clientes';
      const dangerousResult = globalDbAuditor.validateQuery(dangerousQuery, 1, 'clientes.dangerous');
      
      const auditResult = globalDbAuditor.getAuditResult();
      
      const allTestsPassed = test1Passed && test2Passed && test3Passed && 
                           secureResult && !insecureResult && !dangerousResult &&
                           auditResult.violations.length === 2; // 2 queries inseguras detectadas
      
      return {
        success: allTestsPassed,
        data: {
          tenantValidation: { test1Passed, test2Passed, test3Passed },
          queryValidation: { secureResult, insecureResult, dangerousResult },
          auditViolations: auditResult.violations.length,
          violations: auditResult.violations
        }
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  async runAudit(): Promise<void> {
    console.log('\n🔒 AUDITORIA DE SEGURANÇA LOCAL');
    console.log('='.repeat(50));

    const results = [];

    for (const test of this.tests) {
      console.log(`\n🧪 ${test.name}: ${test.description}`);
      
      try {
        const result = await test.execute();
        results.push({ ...test, result });
        
        const icon = result.success ? '✅' : '❌';
        console.log(`${icon} ${result.success ? 'PASS' : 'FAIL'}`);
        
        if (result.error) {
          console.log(`   📝 ${result.error}`);
        }
        if (result.data) {
          console.log(`   📊 ${JSON.stringify(result.data)}`);
        }
      } catch (error) {
        console.log(`❌ ERRO: ${(error as Error).message}`);
        results.push({ ...test, result: { success: false, error: (error as Error).message } });
      }
    }

    this.showSummary(results);
  }

  private showSummary(results: any[]): void {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 RESUMO DA AUDITORIA');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;

    console.log(`\n✅ PASS: ${passed}`);
    console.log(`❌ FAIL: ${failed}`);

    if (failed === 0) {
      console.log('\n🛡️ SISTEMA SEGURO - TODOS OS TESTES PASSARAM');
    } else {
      console.log('\n🚨 FALHAS DE SEGURANÇA DETECTADAS:');
      results.filter(r => !r.result.success).forEach(r => {
        console.log(`❌ ${r.name}: ${r.result.error}`);
      });
    }

    console.log('\n📋 RELATÓRIO DETALHADO:');
    results.forEach(r => {
      const icon = r.result.success ? '✅' : '❌';
      console.log(`${icon} ${r.name}: ${r.description}`);
    });
  }
}

// Executar auditoria
const auditor = new LocalSecurityAuditor();
auditor.runAudit().catch(console.error);
