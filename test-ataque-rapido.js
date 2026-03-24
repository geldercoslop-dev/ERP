/**
 * TESTE DE ATAQUE RÁPIDO - BYPASS DE SEGURANÇA LEO
 */

console.log('🚀 INICIANDO TESTE DE ATAQUE RÁPIDO');
console.log('='.repeat(50));

// Teste 1: Verificar validação de tenantId
function test1_tenantValidation() {
  console.log('\n🧪 Teste 1: Validação tenantId');
  
  try {
    // Importar direto o sistema de permissões
    const agentPermissions = require('./server/leo/security/agent-permissions.ts');
    
    // Testar sem tenantId
    const result1 = agentPermissions.getInstance().hasPermission('buscar_cliente', {
      tenantId: 0,
      userRole: 'admin',
      userId: 1,
      action: 'buscar_cliente'
    });
    
    if (result1.allowed === false) {
      console.log('✅ tenantId=0 bloqueado');
    } else {
      console.log('❌ tenantId=0 NÃO bloqueado - VULNERABILIDADE!');
      return false;
    }
    
    // Testar sem tenantId
    const result2 = agentPermissions.getInstance().hasPermission('buscar_cliente', {
      userRole: 'admin',
      userId: 1,
      action: 'buscar_cliente'
    });
    
    if (result2.allowed === false) {
      console.log('✅ Sem tenantId bloqueado');
      return true;
    } else {
      console.log('❌ Sem tenantId NÃO bloqueado - VULNERABILIDADE!');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Erro no teste:', error.message);
    return false;
  }
}

// Teste 2: Tool não registrada
function test2_unregisteredTool() {
  console.log('\n🧪 Teste 2: Tool não registrada');
  
  try {
    const agentPermissions = require('./server/leo/security/agent-permissions.ts');
    
    const result = agentPermissions.getInstance().hasPermission('DELETE_ALL_DATA', {
      tenantId: 1,
      userRole: 'admin',
      userId: 1,
      action: 'DELETE_ALL_DATA'
    });
    
    if (result.allowed === false && result.reason?.includes('não registrada')) {
      console.log('✅ Tool não registrada bloqueada');
      return true;
    } else {
      console.log('❌ Tool não registrada NÃO bloqueada - VULNERABILIDADE!');
      console.log('Resultado:', result);
      return false;
    }
    
  } catch (error) {
    console.log('❌ Erro no teste:', error.message);
    return false;
  }
}

// Teste 3: Role falsa
function test3_fakeRole() {
  console.log('\n🧪 Teste 3: Role falsa');
  
  try {
    const agentPermissions = require('./server/leo/security/agent-permissions.ts');
    
    // Tentar executar tool só para admin com role user
    const result = agentPermissions.getInstance().hasPermission('system_status', {
      tenantId: 1,
      userRole: 'user', // Role falsa
      userId: 1,
      action: 'system_status'
    });
    
    if (result.allowed === false) {
      console.log('✅ Role falsa bloqueada');
      return true;
    } else {
      console.log('❌ Role falsa NÃO bloqueada - VULNERABILIDADE!');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Erro no teste:', error.message);
    return false;
  }
}

// Teste 4: Comando perigoso
function test4_dangerousCommand() {
  console.log('\n🧪 Teste 4: Comando perigoso');
  
  try {
    const agentPermissions = require('./server/leo/security/agent-permissions.ts');
    
    // Tentar executar comando perigoso
    const result = agentPermissions.getInstance().hasPermission('run_terminal_command', {
      tenantId: 1,
      userRole: 'vendedor',
      userId: 1,
      action: 'run_terminal_command'
    });
    
    if (result.allowed === false) {
      console.log('✅ Comando perigoso bloqueado');
      return true;
    } else {
      console.log('❌ Comando perigoso NÃO bloqueado - VULNERABILIDADE!');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Erro no teste:', error.message);
    return false;
  }
}

// Teste 5: Validação de comando
function test5_commandValidation() {
  console.log('\n🧪 Teste 5: Validação de comando');
  
  try {
    const agentPermissions = require('./server/leo/security/agent-permissions.ts');
    
    // Testar comando bloqueado
    const result = agentPermissions.getInstance().validateCommand('format C:');
    
    if (result.blocked === true) {
      console.log('✅ Comando malicioso bloqueado');
      return true;
    } else {
      console.log('❌ Comando malicioso NÃO bloqueado - VULNERABILIDADE!');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Erro no teste:', error.message);
    return false;
  }
}

// Executar testes rápidos
function runQuickTests() {
  console.log('⚡ EXECUTANDO TESTES RÁPIDOS DE SEGURANÇA');
  
  const tests = [
    { name: 'Validação tenantId', fn: test1_tenantValidation },
    { name: 'Tool não registrada', fn: test2_unregisteredTool },
    { name: 'Role falsa', fn: test3_fakeRole },
    { name: 'Comando perigoso', fn: test4_dangerousCommand },
    { name: 'Validação comando', fn: test5_commandValidation }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ Erro em ${test.name}:`, error.message);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESULTADO DOS TESTES');
  console.log('='.repeat(50));
  console.log(`✅ Passaram (Seguro): ${passed}`);
  console.log(`❌ Falharam (Vulnerável): ${failed}`);
  
  if (failed === 0) {
    console.log('\n🛡️ SEGURANÇA BÁSICA COMPROVADA');
  } else {
    console.log('\n🚨 VULNERABILIDADES ENCONTRADAS!');
  }
}

runQuickTests();
