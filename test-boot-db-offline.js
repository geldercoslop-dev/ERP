#!/usr/bin/env node

/**
 * TESTE REAL: BOOT COM DB OFFLINE
 * Simula DB offline alterando DATABASE_URL para host inválido
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('TESTE REAL: BOOT COM DB OFFLINE');
console.log('='.repeat(60));

// Backup do .env.local atual
const envPath = path.join(__dirname, '.env.local');
const envBackup = path.join(__dirname, '.env.local.backup');

try {
  // Fazer backup do .env.local
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, envBackup);
    console.log('✓ Backup do .env.local criado');
  }

  // Criar .env.local com DB offline (host inválido)
  const envOfflineContent = `
# TESTE: DB OFFLINE
DATABASE_URL=mysql://vendas:vendas123@invalid-host:3306/vendas_app
NODE_ENV=development
JWT_ACCESS_SECRET=test-access-secret-boot
JWT_REFRESH_SECRET=test-refresh-secret-boot
PORT=3001
`;

  fs.writeFileSync(envPath, envOfflineContent);
  console.log('✓ .env.local configurado com DB offline (invalid-host)');

  // Iniciar servidor com timeout
  console.log('\n🚀 Iniciando servidor com DB offline...');
  console.log('⏱️ Timeout: 30 segundos');
  
  const serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    env: { ...process.env }
  });

  let output = '';
  let bootFailed = false;
  let bootTimeout = false;

  const timeout = setTimeout(() => {
    console.log('\n⏰ TIMEOUT: Servidor não iniciou em 30 segundos');
    console.log('❌ FAIL-FAST NÃO FUNCIONOU - Servidor tentou indefinidamente');
    bootTimeout = true;
    serverProcess.kill('SIGTERM');
  }, 30000);

  serverProcess.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    process.stdout.write(text);

    // Verificar se boot falhou
    if (text.includes('BOOT-FAILED') || 
        text.includes('Critical boot validation failed') ||
        text.includes('Database connection failed') ||
        text.includes('ECONNREFUSED') ||
        text.includes('ENOTFOUND')) {
      console.log('\n✅ BOOT FALHOU COMO ESPERADO!');
      bootFailed = true;
      clearTimeout(timeout);
      serverProcess.kill('SIGTERM');
    }

    // Verificar se servidor iniciou normal (BUG)
    if (text.includes('Server started') || 
        text.includes('listening on') ||
        text.includes('ready') ||
        text.includes('online')) {
      console.log('\n❌ BUG CRÍTICO: Servidor iniciou com DB offline!');
      console.log('❌ FAIL-FAST NÃO FUNCIONOU!');
      clearTimeout(timeout);
      serverProcess.kill('SIGTERM');
    }
  });

  serverProcess.stderr.on('data', (data) => {
    const text = data.toString();
    output += text;
    process.stderr.write(text);

    // Verificar erro de conexão
    if (text.includes('ECONNREFUSED') || 
        text.includes('ENOTFOUND') ||
        text.includes('getaddrinfo')) {
      console.log('\n✅ Erro de conexão DB detectado (esperado)');
    }
  });

  serverProcess.on('close', (code) => {
    clearTimeout(timeout);
    
    console.log('\n' + '='.repeat(60));
    console.log('RESULTADO DO TESTE');
    console.log('='.repeat(60));
    
    if (bootFailed) {
      console.log('✅ PASSOU: Boot falhou com DB offline (fail-fast funcionou)');
      console.log('✅ Sistema não sobe sem DB - CORRETO');
    } else if (bootTimeout) {
      console.log('⚠ TIMEOUT: Servidor travou tentando conectar');
      console.log('⚠ Pode indicar retry excessivo (violando fail-fast)');
    } else {
      console.log('❌ FALHOU: Servidor iniciou com DB offline');
      console.log('❌ FAIL-FAST NÃO FUNCIONA - BUG CRÍTICO');
    }
    
    console.log(`\nExit code: ${code}`);
    
    // Restaurar .env.local
    restoreEnv();
  });

  function restoreEnv() {
    try {
      if (fs.existsSync(envBackup)) {
        fs.copyFileSync(envBackup, envPath);
        fs.unlinkSync(envBackup);
        console.log('\n✓ .env.local restaurado');
      } else {
        fs.unlinkSync(envPath);
        console.log('\n✓ .env.local de teste removido');
      }
    } catch (error) {
      console.log('\n⚠ Erro ao restaurar .env.local:', error.message);
    }
  }

} catch (error) {
  console.error('❌ Erro no teste:', error);
  process.exit(1);
}
