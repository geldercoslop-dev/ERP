console.log('🔍 AUDITOR SIMPLES - TESTE RÁPIDO');
console.log('===============================\n');

// Teste direto sem dependências complexas
try {
  const fs = await import('fs');
  
  // Verificar se arquivos de segurança existem
  const permFile = fs.existsSync('server/leo/security/agent-permissions.ts');
  const executorFile = fs.existsSync('server/leo/agent/tool-executor.ts');
  const registryFile = fs.existsSync('server/leo/agent/tool-registry.ts');
  
  console.log('ARQUIVOS DE SEGURANÇA:');
  console.log('- agent-permissions.ts:', permFile ? '✅ EXISTE' : '❌ FALTA');
  console.log('- tool-executor.ts:', executorFile ? '✅ EXISTE' : '❌ FALTA');
  console.log('- tool-registry.ts:', registryFile ? '✅ EXISTE' : '❌ FALTA');
  
  // Ler conteúdo do arquivo de permissões
  if (permFile) {
    const content = fs.readFileSync('server/leo/security/agent-permissions.ts', 'utf8');
    
    console.log('\nVALIDAÇÕES NO CÓDIGO:');
    console.log('- "tenantId é obrigatório":', content.includes('tenantId é obrigatório') ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO');
    console.log('- "userId é obrigatório":', content.includes('userId é obrigatório') ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO');
    console.log('- "BLOQUEADO POR SEGURANÇA":', content.includes('BLOQUEADO POR SEGURANÇA') ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO');
    console.log('- "allowedRoles: []":', content.includes('allowedRoles: []') ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO');
    console.log('- "não registrada":', content.includes('não registrada') ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO');
  }
  
  // Testar compilação
  console.log('\nTESTE DE COMPILAÇÃO:');
  const { execSync } = await import('child_process');
  
  try {
    execSync('pnpm exec tsc -p tsconfig.server.json --noEmit', { stdio: 'pipe', timeout: 30000 });
    console.log('- TypeScript: ✅ COMPILA SEM ERROS');
  } catch (error) {
    console.log('- TypeScript: ❌ ERROS DE COMPILAÇÃO');
    console.log(error.stdout?.toString() || error.stderr?.toString());
  }
  
} catch (error) {
  console.log('ERRO GERAL:', error.message);
}

console.log('\n✅ AUDITOR CONCLUÍDO');
