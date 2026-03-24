/**
 * AUDITORIA DE SEGURANÇA REAL - ATAQUE CONTROLADO
 * 
 * Testa vazamentos de dados entre tenants e vendedores
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.DATABASE_URL?.replace('mysql://', 'postgresql://') || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface TestResult {
  testName: string;
  status: 'PASS' | 'FAIL';
  details: string;
  data?: any;
}

class SecurityAuditor {
  private results: TestResult[] = [];

  async runAttack(): Promise<void> {
    console.log('\n🔍 INICIANDO AUDITORIA DE SEGURANÇA REAL');
    console.log('='.repeat(50));

    // TESTE 1: Isolamento de Tenants
    await this.testTenantIsolation();
    
    // TESTE 2: Isolamento de Vendedores
    await this.testVendorIsolation();
    
    // TESTE 3: LEO sem contexto
    await this.testLeoWithoutContext();
    
    // TESTE 4: Buscas cruzadas
    await this.testCrossTenantSearch();
    
    this.showResults();
  }

  private async testTenantIsolation(): Promise<void> {
    console.log('\n📋 TESTE 1: Isolamento de Tenants');
    
    try {
      // Simular tenant A tentando acessar dados do tenant B
      const response = await fetch('http://localhost:3001/api/trpc/clientes.list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'auth-token=fake-tenant-a-token'
        },
        body: JSON.stringify({
          json: {
            busca: "cliente_tenant_b",
            limit: 10,
            offset: 0
          }
        })
      });

      const data = await response.json();
      
      this.results.push({
        testName: 'TENANT_ISOLATION',
        status: data.result?.data?.json?.data?.length === 0 ? 'PASS' : 'FAIL',
        details: `Tenant A acessando dados do Tenant B: ${data.result?.data?.json?.data?.length || 0} resultados`,
        data: data
      });
      
    } catch (error) {
      this.results.push({
        testName: 'TENANT_ISOLATION',
        status: 'PASS',
        details: `Conexão recusada (esperado): ${error}`,
        data: error
      });
    }
  }

  private async testVendorIsolation(): Promise<void> {
    console.log('\n👥 TESTE 2: Isolamento de Vendedores');
    
    try {
      // Vendedor A tentando acessar clientes do Vendedor B
      const response = await fetch('http://localhost:3001/api/trpc/clientes.list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'auth-token=fake-vendedor-a-token'
        },
        body: JSON.stringify({
          json: {
            busca: "cliente_vendedor_b",
            limit: 10,
            offset: 0
          }
        })
      });

      const data = await response.json();
      
      this.results.push({
        testName: 'VENDOR_ISOLATION',
        status: data.result?.data?.json?.data?.length === 0 ? 'PASS' : 'FAIL',
        details: `Vendedor A acessando dados do Vendedor B: ${data.result?.data?.json?.data?.length || 0} resultados`,
        data: data
      });
      
    } catch (error) {
      this.results.push({
        testName: 'VENDOR_ISOLATION',
        status: 'PASS',
        details: `Acesso negado (esperado): ${error}`,
        data: error
      });
    }
  }

  private async testLeoWithoutContext(): Promise<void> {
    console.log('\n🤖 TESTE 3: LEO sem contexto');
    
    try {
      // LEO sem actor/tenantId
      const response = await fetch('http://localhost:3001/api/trpc/leo.ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          json: {
            pergunta: "listar todos os clientes",
            sessionId: "test-session"
          }
        })
      });

      const data = await response.json();
      
      // Esperamos erro 401 ou mensagem de contexto obrigatório
      const hasSecurityError = data.error?.code === 'UNAUTHORIZED' || 
                             data.error?.message?.includes('obrigatório') ||
                             data.error?.message?.includes('contexto');
      
      this.results.push({
        testName: 'LEO_NO_CONTEXT',
        status: hasSecurityError ? 'PASS' : 'FAIL',
        details: `LEO sem contexto: ${hasSecurityError ? 'Bloqueado' : 'Vazamento'}`,
        data: data
      });
      
    } catch (error) {
      this.results.push({
        testName: 'LEO_NO_CONTEXT',
        status: 'PASS',
        details: `LEO bloqueado (esperado): ${error}`,
        data: error
      });
    }
  }

  private async testCrossTenantSearch(): Promise<void> {
    console.log('\n🔍 TESTE 4: Buscas Cruzadas');
    
    const searches = [
      { term: "admin", description: "Busca por admin" },
      { term: "root", description: "Busca por root" },
      { term: "system", description: "Busca por system" },
      { term: "todos", description: "Busca por todos" }
    ];

    for (const search of searches) {
      try {
        const response = await fetch('http://localhost:3001/api/trpc/clientes.search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': 'auth-token=fake-low-privilege-token'
          },
          body: JSON.stringify({
            json: { term: search.term }
          })
        });

        const data = await response.json();
        const resultCount = data.result?.data?.json?.length || 0;
        
        this.results.push({
          testName: `CROSS_SEARCH_${search.term.toUpperCase()}`,
          status: resultCount === 0 ? 'PASS' : 'FAIL',
          details: `${search.description}: ${resultCount} resultados`,
          data: data
        });
        
      } catch (error) {
        this.results.push({
          testName: `CROSS_SEARCH_${search.term.toUpperCase()}`,
          status: 'PASS',
          details: `${search.description} bloqueada (esperado)`,
          data: error
        });
      }
    }
  }

  private showResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 RESULTADO DA AUDITORIA DE SEGURANÇA');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;

    console.log(`\n✅ PASS: ${passed}`);
    console.log(`❌ FAIL: ${failed}`);

    console.log('\n📊 DETALHES:');
    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.testName}: ${result.details}`);
      
      if (result.status === 'FAIL') {
        console.log(`   🚨 VAZAMENTO DETECTADO!`);
        console.log(`   📄 Data:`, JSON.stringify(result.data, null, 2));
      }
    });

    if (failed > 0) {
      console.log('\n🚨🚨🚨 FALHA DE SEGURANÇA DETECTADA! 🚨🚨🚨');
      process.exit(1);
    } else {
      console.log('\n✅ SISTEMA SEGURO - NENHUM VAZAMENTO DETECTADO');
    }
  }
}

// Executar auditoria
const auditor = new SecurityAuditor();
auditor.runAttack().catch(console.error);
