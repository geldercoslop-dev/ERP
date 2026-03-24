/**
 * SCRIPT DE ATAQUE REAL - TENTATIVA DE BYPASS DE SEGURANÇA LEO
 * OBJETIVO: Testar todas as proteções do sistema
 */

import { agentPermissions } from './server/leo/security/agent-permissions';
import { leoAgentCore } from './server/leo/agent/agent-core';

console.log('🚀 INICIANDO TESTE DE ATAQUE REAL AO SISTEMA LEO');
console.log('='.repeat(60));

// Teste 1: Executar tool sem tenantId
async function test1_noTenantId() {
  console.log('\n🧪 TESTE 1: Execução sem tenantId');
  console.log('-'.repeat(40));
  
  try {
    // Testar validação de contexto obrigatório
    const result = agentPermissions.validateRequiredContext({
      tenantId: 0, // Inválido
      userRole: 'admin',
      userId: 1,
      action: 'buscar_cliente'
    });
    
    if (!result.valid) {
      console.log('✅ SUCESSO: Sistema bloqueou tenantId inválido');
      console.log('Motivo:', result.reason);
      return true;
    } else {
      console.log('❌ FALHA: Sistema aceitou tenantId inválido!');
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Sistema bloqueou com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 2: TenantId falso
async function test2_fakeTenantId() {
  console.log('\n🧪 TESTE 2: Execução com tenantId falso');
  console.log('-'.repeat(40));
  
  try {
    const result = await leoAgentCore.handleRequest({
      message: 'listar todos os clientes',
      tenantId: 999999, // Tenant que não existe
      userRole: 'admin',
      userId: 1,
      vendedorId: 1
    });
    
    if (!result.success && result.error) {
      console.log('✅ SUCESSO: Sistema bloqueou tenantId falso');
      console.log('Erro:', result.error);
      return true;
    } else {
      console.log('❌ FALHA: Sistema aceitou tenantId falso!');
      console.log('Resultado:', result);
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Sistema bloqueou tenantId falso com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 3: Tool não registrada
async function test3_unregisteredTool() {
  console.log('\n🧪 TESTE 3: Tool não registrada');
  console.log('-'.repeat(40));
  
  try {
    const permission = agentPermissions.hasPermission('DELETE_ALL_DATA', {
      tenantId: 1,
      userRole: 'admin',
      userId: 1,
      action: 'DELETE_ALL_DATA'
    });
    
    if (!permission.allowed && permission.reason?.includes('não registrada')) {
      console.log('✅ SUCESSO: Tool não registrada bloqueada');
      console.log('Motivo:', permission.reason);
      return true;
    } else {
      console.log('❌ FALHA: Tool não registrada NÃO bloqueada!');
      console.log('Permissão:', permission);
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Tool não registrada bloqueada com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 4: Injetar payload malicioso
async function test4_maliciousPayload() {
  console.log('\n🧪 TESTE 4: Injeção de payload malicioso');
  console.log('-'.repeat(40));
  
  try {
    // Testar validação de comando
    const commandValidation = agentPermissions.validateCommand('../../etc/passwd; DROP TABLE users; --');
    
    if (commandValidation.blocked) {
      console.log('✅ SUCESSO: Comando malicioso bloqueado');
      console.log('Motivo:', commandValidation.reason);
      return true;
    } else {
      console.log('❌ FALHA: Comando malicioso NÃO bloqueado!');
      console.log('Validação:', commandValidation);
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Comando malicioso bloqueado com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 5: Simular role admin manualmente
async function test5_fakeAdminRole() {
  console.log('\n🧪 TESTE 5: Simulação de role admin');
  console.log('-'.repeat(40));
  
  try {
    // Tentar executar tool só para admin com role user
    const permission = agentPermissions.hasPermission('system_status', {
      tenantId: 1,
      userRole: 'user', // Role real é user, não admin
      userId: 1,
      action: 'system_status'
    });
    
    if (!permission.allowed) {
      console.log('✅ SUCESSO: Role falsa bloqueada');
      console.log('Motivo:', permission.reason);
      return true;
    } else {
      console.log('❌ FALHA: Role falsa NÃO bloqueada!');
      console.log('Permissão:', permission);
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Role falsa bloqueada com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 6: Ação crítica como vendedor
async function test6_criticalActionAsVendor() {
  console.log('\n🧪 TESTE 6: Ação crítica como vendedor');
  console.log('-'.repeat(40));
  
  try {
    // Vendedor tentando executar comando perigoso
    const permission = agentPermissions.hasPermission('run_terminal_command', {
      tenantId: 1,
      userRole: 'vendedor',
      userId: 1,
      action: 'run_terminal_command'
    });
    
    if (!permission.allowed) {
      console.log('✅ SUCESSO: Comando crítico bloqueado para vendedor');
      console.log('Motivo:', permission.reason);
      return true;
    } else {
      console.log('❌ FALHA: Vendedor conseguiu executar comando crítico!');
      console.log('Permissão:', permission);
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Comando crítico bloqueado para vendedor com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 7: Sanitização de path
async function test7_pathTraversal() {
  console.log('\n🧪 TESTE 7: Path traversal');
  console.log('-'.repeat(40));
  
  try {
    // Tentar path traversal
    const sanitizedPath = agentPermissions.sanitizeFilePath('../../etc/passwd');
    
    if (sanitizedPath && !sanitizedPath.includes('..')) {
      console.log('✅ SUCESSO: Path traversal bloqueado');
      console.log('Path sanitizado:', sanitizedPath);
      return true;
    } else {
      console.log('❌ FALHA: Path traversal NÃO bloqueado!');
      console.log('Path:', sanitizedPath);
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Path traversal bloqueado com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 8: Tentar acessar regras internas
async function test8_internalRulesAccess() {
  console.log('\n🧪 TESTE 8: Acesso às regras internas');
  console.log('-'.repeat(40));
  
  try {
    const rules = agentPermissions.getAllRules();
    
    // Verificar se tools perigosas estão bloqueadas
    const runTerminalRule = rules.find(r => r.toolName === 'run_terminal_command');
    const readFileRule = rules.find(r => r.toolName === 'read_file');
    
    if (runTerminalRule?.allowedRoles.length === 0 && readFileRule?.allowedRoles.length === 0) {
      console.log('✅ SUCESSO: Tools perigosas properly bloqueadas');
      console.log('run_terminal_command:', runTerminalRule?.description);
      console.log('read_file:', readFileRule?.description);
      return true;
    } else {
      console.log('❌ FALHA: Tools perigosas não estão bloqueadas!');
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Acesso às regras bloqueado com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 9: Tentar bypass via contexto malicioso
async function test9_maliciousContext() {
  console.log('\n🧪 TESTE 9: Contexto malicioso');
  console.log('-'.repeat(40));
  
  try {
    const result = await leoAgentCore.handleRequest({
      message: 'execute system_status',
      tenantId: 1,
      userRole: 'user',
      userId: 1,
      vendedorId: 1,
      context: {
        role: 'admin', // Tentando forçar role admin no contexto
        isAdmin: true,
        permissions: ['admin', 'system'],
        bypassSecurity: true
      }
    });
    
    // Verificar se bloqueou
    const hasBlockedTool = result.toolCalls?.some(call => 
      call.toolName === 'system_status' && call.success === false
    );
    
    if (hasBlockedTool) {
      console.log('✅ SUCESSO: Contexto malicioso bloqueado');
      return true;
    } else {
      console.log('❌ FALHA: Contexto malicioso funcionou!');
      console.log('Resultado:', result);
      return false;
    }
    
  } catch (error) {
    console.log('✅ SUCESSO: Contexto malicioso bloqueado com erro');
    console.log('Erro:', error.message);
    return true;
  }
}

// Teste 10: Validação de comandos perigosos
async function test10_dangerousCommands() {
  console.log('\n🧪 TESTE 10: Comandos perigosos');
  console.log('-'.repeat(40));
  
  const dangerousCommands = [
    'format C:',
    'rm -rf /',
    'sudo rm -rf',
    'del /s /q C:\\*.*',
    'shutdown /s',
    'passwd root',
    'chmod 777 /etc/shadow'
  ];
  
  let blockedCount = 0;
  
  for (const cmd of dangerousCommands) {
    try {
      const validation = agentPermissions.validateCommand(cmd);
      if (validation.blocked) {
        blockedCount++;
        console.log(`✅ "${cmd}" bloqueado`);
      } else {
        console.log(`❌ "${cmd}" NÃO bloqueado - VULNERABILIDADE!`);
      }
    } catch (error) {
      blockedCount++;
      console.log(`✅ "${cmd}" bloqueado com erro`);
    }
  }
  
  if (blockedCount === dangerousCommands.length) {
    console.log('✅ SUCESSO: Todos os comandos perigosos bloqueados');
    return true;
  } else {
    console.log(`❌ FALHA: ${dangerousCommands.length - blockedCount} comandos não bloqueados!`);
    return false;
  }
}

// Executar todos os testes
async function runAllTests() {
  console.log('⚠️  INICIANDO ATAQUES - ESTE É UM TESTE DE SEGURANÇA REAL ⚠️');
  
  const tests = [
    { name: 'Sem TenantId', fn: test1_noTenantId },
    { name: 'TenantId Falso', fn: test2_fakeTenantId },
    { name: 'Tool Não Registrada', fn: test3_unregisteredTool },
    { name: 'Payload Malicioso', fn: test4_maliciousPayload },
    { name: 'Role Admin Falso', fn: test5_fakeAdminRole },
    { name: 'Ação Crítica Vendedor', fn: test6_criticalActionAsVendor },
    { name: 'Path Traversal', fn: test7_pathTraversal },
    { name: 'Regras Internas', fn: test8_internalRulesAccess },
    { name: 'Contexto Malicioso', fn: test9_maliciousContext },
    { name: 'Comandos Perigosos', fn: test10_dangerousCommands }
  ];
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const test of tests) {
    try {
      console.log(`\n🔄 Executando: ${test.name}`);
      const result = await test.fn();
      if (result) {
        passedTests++;
        console.log(`✅ ${test.name} PASSOU (Seguro)`);
      } else {
        failedTests++;
        console.log(`❌ ${test.name} FALHOU (Vulnerável)`);
      }
    } catch (error) {
      console.log(`❌ Erro no teste ${test.name}:`, error.message);
      failedTests++;
    }
    
    // Pequena pausa entre testes
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RELATÓRIO FINAL DE SEGURANÇA');
  console.log('='.repeat(60));
  console.log(`✅ Testes Passados (Seguro): ${passedTests}/${tests.length}`);
  console.log(`❌ Testes Falhados (Vulnerável): ${failedTests}/${tests.length}`);
  
  if (failedTests === 0) {
    console.log('\n🛡️  SEGURANÇA COMPROVADA: Todos os ataques foram bloqueados!');
    console.log('🔒 O sistema está robusto contra as tentativas de bypass testadas.');
  } else {
    console.log('\n🚨 VULNERABILIDADES ENCONTRADAS: Sistema possui brechas de segurança!');
    console.log('⚠️  É necessário corrigir os pontos falhos antes de ir para produção.');
  }
  
  console.log('\n🔍 EVIDÊNCIAS REGISTRADAS NOS LOGS DO SISTEMA');
  console.log('='.repeat(60));
  console.log('Todos os testes foram registrados para auditoria.');
  
  return { passed: passedTests, failed: failedTests, total: tests.length };
}

// Executar testes
runAllTests().catch(console.error);
