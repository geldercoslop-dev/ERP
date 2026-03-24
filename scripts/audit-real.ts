/**
 * AUDITOR EXTERNO - TESTE REAL SEM DEPENDENCIAS INTERNAS
 */

console.log('🔍 AUDITOR EXTERNO - TESTE DIRETO');
console.log('================================\n');

// Teste 1: Import direto sem dependências
try {
  console.log('TESTE 1: Import direto agent-permissions');
  const { agentPermissions } = await import('../server/leo/security/agent-permissions');
  
  // Testar sem tenantId
  const result1 = agentPermissions.hasPermission('buscar_cliente', {
    tenantId: 0,
    userId: 123,
    action: 'test'
  });
  console.log('RESULTADO 1:', result1);
  
  // Testar tool não registrada
  const result2 = agentPermissions.hasPermission('tool_fake', {
    tenantId: 1,
    userId: 123,
    userRole: 'admin',
    action: 'test'
  });
  console.log('RESULTADO 2:', result2);
  
} catch (error) {
  console.log('ERRO TESTE 1:', error.message);
}

// Teste 2: Tentar acesso direto ao registry
try {
  console.log('\nTESTE 2: Acesso direto tool-registry');
  const { toolRegistry } = await import('../server/leo/agent/tool-registry');
  
  const tool = toolRegistry.getTool('read_file');
  console.log('TOOL ENCONTRADA:', tool ? 'SIM' : 'NÃO');
  
  const allTools = toolRegistry.getToolNames();
  console.log('TOTAL TOOLS:', allTools.length);
  console.log('NOMES:', allTools.slice(0, 5));
  
} catch (error) {
  console.log('ERRO TESTE 2:', error.message);
}

// Teste 3: Tentar bypass via toolExecutor
try {
  console.log('\nTESTE 3: Bypass via toolExecutor');
  const { toolExecutor } = await import('../server/leo/agent/tool-executor');
  
  const result = await toolExecutor.executeTool('buscar_cliente', {}, {
    tenantId: 1,
    userId: 0, // Inválido
    userRole: 'vendedor'
  });
  console.log('RESULTADO 3:', result);
  
} catch (error) {
  console.log('ERRO TESTE 3:', error.message);
}

// Teste 4: Tentar acesso direto ao serviço
try {
  console.log('\nTESTE 4: Acesso direto serviço');
  const { getClienteById } = await import('../server/services/clientes.service');
  
  const result = await getClienteById(999, { type: 'system' }, 1);
  console.log('RESULTADO 4:', result);
  
} catch (error) {
  console.log('ERRO TESTE 4:', error.message);
}

console.log('\n✅ TESTES CONCLUÍDOS');
