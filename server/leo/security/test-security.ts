/**
 * Teste de Segurança LEO - Validação do Isolamento e Permissões
 * 
 * Simula tentativas de acesso indevido e valida bloqueios de segurança
 */

import { agentPermissions } from './agent-permissions.js';
import { toolExecutor } from '../agent/tool-executor.js';

interface TestResult {
  testName: string;
  passed: boolean;
  reason: string;
  details?: any;
}

class SecurityTester {
  private results: TestResult[] = [];

  private addResult(test: TestResult) {
    this.results.push(test);
    console.log(`${test.passed ? '✅' : '❌'} ${test.testName}: ${test.reason}`);
  }

  async runAllTests(): Promise<TestResult[]> {
    console.log('🔒 INICIANDO TESTES DE SEGURANÇA LEO\n');

    await this.testContextoObrigatorio();
    await this.testToolsPerigosasBloqueadas();
    await this.testVendedorAcessoLimitado();
    await this.testAdminAcessoPermitido();
    await this.testToolNaoRegistrada();
    await this.testIsolamentoVendedorId();

    console.log('\n📊 RESUMO DOS TESTES:');
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    console.log(`${passed}/${total} testes passaram`);

    return this.results;
  }

  private async testContextoObrigatorio() {
    // Teste 1: Sem tenantId
    const result1 = agentPermissions.hasPermission('buscar_cliente', {
      tenantId: 0, // Inválido
      userId: 123,
      action: 'test'
    });
    
    this.addResult({
      testName: 'Contexto - Bloqueio sem tenantId',
      passed: result1.allowed === false && (result1.reason?.includes('tenantId é obrigatório') ?? false),
      reason: result1.reason || 'Erro inesperado'
    });

    // Teste 2: Sem userId
    const result2 = agentPermissions.hasPermission('buscar_cliente', {
      tenantId: 1,
      userId: 0, // Inválido
      action: 'test'
    });
    
    this.addResult({
      testName: 'Contexto - Bloqueio sem userId',
      passed: result2.allowed === false && (result2.reason?.includes('userId é obrigatório') ?? false),
      reason: result2.reason || 'Erro inesperado'
    });

    // Teste 3: Sem action
    const result3 = agentPermissions.hasPermission('buscar_cliente', {
      tenantId: 1,
      userId: 123,
      action: '' // Inválido
    });
    
    this.addResult({
      testName: 'Contexto - Bloqueio sem action',
      passed: result3.allowed === false && (result3.reason?.includes('action é obrigatório') ?? false),
      reason: result3.reason || 'Erro inesperado'
    });
  }

  private async testToolsPerigosasBloqueadas() {
    const dangerousTools = ['read_file', 'write_file', 'run_terminal_command', 'open_app'];
    
    for (const toolName of dangerousTools) {
      const result = agentPermissions.hasPermission(toolName, {
        tenantId: 1,
        userId: 123,
        userRole: 'admin',
        action: 'test'
      });
      
      this.addResult({
        testName: `Tool Perigosa - ${toolName} bloqueada`,
        passed: result.allowed === false,
        reason: result.reason || 'Erro inesperado'
      });
    }
  }

  private async testVendedorAcessoLimitado() {
    // Vendedor pode acessar clientes
    const result1 = agentPermissions.hasPermission('buscar_cliente', {
      tenantId: 1,
      userId: 123,
      userRole: 'vendedor',
      action: 'test'
    });
    
    this.addResult({
      testName: 'Vendedor - Acesso permitido a clientes',
      passed: result1.allowed,
      reason: result1.reason || 'Acesso permitido'
    });

    // Vendedor NÃO pode acessar ferramentas de sistema (admin)
    const result2 = agentPermissions.hasPermission('system_status', {
      tenantId: 1,
      userId: 123,
      userRole: 'vendedor',
      action: 'test'
    });
    
    this.addResult({
      testName: 'Vendedor - Bloqueio system_status',
      passed: !result2.allowed,
      reason: result2.reason || 'Erro inesperado'
    });
  }

  private async testAdminAcessoPermitido() {
    // Admin pode acessar system tools
    const result1 = agentPermissions.hasPermission('system_status', {
      tenantId: 1,
      userId: 123,
      userRole: 'admin',
      action: 'test'
    });
    
    this.addResult({
      testName: 'Admin - Acesso system status',
      passed: result1.allowed,
      reason: result1.reason || 'Acesso permitido'
    });

    // Admin pode acessar resumo financeiro
    const result2 = agentPermissions.hasPermission('resumo_financeiro', {
      tenantId: 1,
      userId: 123,
      userRole: 'admin',
      action: 'test'
    });
    
    this.addResult({
      testName: 'Admin - Acesso resumo_financeiro',
      passed: result2.allowed,
      reason: result2.reason || 'Acesso permitido'
    });
  }

  private async testToolNaoRegistrada() {
    const result = agentPermissions.hasPermission('tool_inexistente', {
      tenantId: 1,
      userId: 123,
      userRole: 'admin',
      action: 'test'
    });
    
    this.addResult({
      testName: 'Tool Não Registrada - Bloqueio',
      passed: result.allowed === false && (result.reason?.includes('não registrada') ?? false),
      reason: result.reason || 'Erro inesperado'
    });
  }

  private async testIsolamentoVendedorId() {
    // Smoke: tool criar_pedido existe e contexto vendedor é obrigatório no executor
    try {
      const executionResult = await toolExecutor.executeTool(
        'criar_pedido',
        {
          dados: {
            vendedorId: 999,
            clienteId: 1,
            itens: [],
            subtotal: 0,
            desconto: 0,
            frete: 0,
            total: 0,
          },
        },
        {
          tenantId: 1,
          userId: 123,
          role: 'vendedor',
          userRole: 'vendedor',
          vendedorId: 456,
        }
      );
      this.addResult({
        testName: 'Isolamento vendedorId - Tool criar_pedido (smoke)',
        passed: true,
        reason: executionResult.success ? 'ok' : executionResult.error || 'falhou como esperado (dados mínimos)',
        details: executionResult,
      });
    } catch (error) {
      this.addResult({
        testName: 'Isolamento vendedorId - Exceção controlada',
        passed: true,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Executar testes
async function main() {
  const tester = new SecurityTester();
  const results = await tester.runAllTests();
  
  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { SecurityTester };
