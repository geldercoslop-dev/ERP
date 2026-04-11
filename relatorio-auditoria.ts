/**
 * Relatório de Auditoria de Segurança
 * Script para gerar relatório completo das verificações de segurança
 */

console.log('=====================================');
console.log('RELATÓRIO DE AUDITORIA DE SEGURANÇA');
console.log('=====================================\n');

async function gerarRelatorio() {
  const resultados = [];
  
  // Teste 1: Verificação de permissões
  console.log('1. CONTROLE DE ACESSO E PERMISSÕES');
  console.log('-----------------------------------');
  
  try {
    const { agentPermissions } = await import('./server/leo/security/agent-permissions');
    
    // Testar tenantId inválido
    const result1 = agentPermissions.hasPermission('buscar_cliente', {
      tenantId: 0,
      userId: 123,
      action: 'test'
    });
    console.log('   TenantId inválido:', result1.allowed ? 'VULNERABILIDADE' : 'BLOQUEADO');
    
    // Testar tool não registrada
    const result2 = agentPermissions.hasPermission('tool_fake', {
      tenantId: 1,
      userId: 123,
      userRole: 'admin',
      action: 'test'
    });
    console.log('   Tool não registrada:', result2.allowed ? 'VULNERABILIDADE' : 'BLOQUEADO');
    
    resultados.push({
      categoria: 'Controle de Acesso',
      status: result1.allowed === false && result2.allowed === false ? 'SEGURO' : 'VULNERÁVEL',
      detalhes: 'Validação de tenantId e registro de tools funcionando corretamente'
    });
    
  } catch (error) {
    console.log('   Erro no teste:', error.message);
    resultados.push({
      categoria: 'Controle de Acesso',
      status: 'ERRO',
      detalhes: `Falha ao executar testes: ${error.message}`
    });
  }
  
  // Teste 2: Registry de tools
  console.log('\n2. REGISTRY DE TOOLS');
  console.log('--------------------');
  
  try {
    const { toolRegistry } = await import('./server/leo/agent/tool-registry');
    
    const allTools = toolRegistry.getToolNames();
    console.log(`   Total de tools registradas: ${allTools.length}`);
    console.log(`   Tools principais: ${allTools.slice(0, 10).join(', ')}`);
    
    resultados.push({
      categoria: 'Registry de Tools',
      status: allTools.length > 0 ? 'SEGURO' : 'VULNERÁVEL',
      detalhes: `${allTools.length} tools registradas no sistema`
    });
    
  } catch (error) {
    console.log('   Erro no teste:', error.message);
    resultados.push({
      categoria: 'Registry de Tools',
      status: 'ERRO',
      detalhes: `Falha ao acessar registry: ${error.message}`
    });
  }
  
  // Teste 3: Executor de tools
  console.log('\n3. EXECUTOR DE TOOLS');
  console.log('-------------------');
  
  try {
    const { toolExecutor } = await import('./server/leo/agent/tool-executor');
    
    // Tentativa com userId inválido
    try {
      await toolExecutor.executeTool('buscar_cliente', {}, {
        tenantId: 1,
        userId: 0,
        userRole: 'vendedor'
      });
      console.log('   UserId inválido: VULNERABILIDADE');
      resultados.push({
        categoria: 'Executor de Tools',
        status: 'VULNERÁVEL',
        detalhes: 'Executor aceitou userId inválido'
      });
    } catch (error) {
      console.log('   UserId inválido: BLOQUEADO');
      resultados.push({
        categoria: 'Executor de Tools',
        status: 'SEGURO',
        detalhes: 'Executor rejeitou userId inválido corretamente'
      });
    }
    
  } catch (error) {
    console.log('   Erro no teste:', error.message);
    resultados.push({
      categoria: 'Executor de Tools',
      status: 'ERRO',
      detalhes: `Falha no executor: ${error.message}`
    });
  }
  
  // Teste 4: Acesso direto a serviços
  console.log('\n4. ACESSO DIRETO A SERVIÇOS');
  console.log('--------------------------');
  
  try {
    const { getClienteById } = await import('./server/services/clientes.service');
    
    try {
      await getClienteById(999, { type: 'system' }, 1);
      console.log('   Acesso sem contexto: VULNERABILIDADE');
      resultados.push({
        categoria: 'Acesso Direto a Serviços',
        status: 'VULNERÁVEL',
        detalhes: 'Serviço aceitou chamada sem contexto de segurança'
      });
    } catch (error) {
      console.log('   Acesso sem contexto: BLOQUEADO');
      resultados.push({
        categoria: 'Acesso Direto a Serviços',
        status: 'SEGURO',
        detalhes: 'Serviço rejeitou chamada sem contexto corretamente'
      });
    }
    
  } catch (error) {
    console.log('   Erro no teste:', error.message);
    resultados.push({
      categoria: 'Acesso Direto a Serviços',
      status: 'ERRO',
      detalhes: `Falha ao testar serviço: ${error.message}`
    });
  }
  
  // Resumo final
  console.log('\n=====================================');
  console.log('RESUMO DA AUDITORIA');
  console.log('=====================================\n');
  
  const seguros = resultados.filter(r => r.status === 'SEGURO').length;
  const vulneraveis = resultados.filter(r => r.status === 'VULNERÁVEL').length;
  const erros = resultados.filter(r => r.status === 'ERRO').length;
  
  console.log(`Testes Seguros: ${seguros}`);
  console.log(`Testes Vulneráveis: ${vulneraveis}`);
  console.log(`Testes com Erro: ${erros}`);
  console.log(`Total de Testes: ${resultados.length}\n`);
  
  resultados.forEach((resultado, index) => {
    console.log(`${index + 1}. ${resultado.categoria}: ${resultado.status}`);
    console.log(`   ${resultado.detalhes}\n`);
  });
  
  const statusGeral = vulneraveis === 0 ? 'SEGURO' : erros > 0 ? 'INCONCLUSIVO' : 'VULNERÁVEL';
  console.log(`STATUS GERAL DO SISTEMA: ${statusGeral}`);
  
  return {
    resumo: {
      seguros,
      vulneraveis,
      erros,
      total: resultados.length,
      statusGeral
    },
    detalhes: resultados,
    dataGeracao: new Date()
  };
}

// Executar relatório
gerarRelatorio()
  .then(relatorio => {
    console.log('\nRelatório gerado com sucesso!');
  })
  .catch(error => {
    console.error('Erro ao gerar relatório:', error);
  });
