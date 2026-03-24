#!/usr/bin/env node

/**
 * TESTE SIMPLES: VERIFICAR BOOT COM DB OFFLINE
 * Testa se o sistema falha ao iniciar com DB offline
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('TESTE SIMPLES: BOOT COM DB OFFLINE');
console.log('='.repeat(60));

async function testBootWithDBOffline() {
  try {
    // Criar arquivo .env.local com DB offline
    const envPath = path.join(__dirname, '.env.local');
    const envBackup = path.join(__dirname, '.env.local.backup');
    
    // Backup atual
    if (fs.existsSync(envPath)) {
      fs.copyFileSync(envPath, envBackup);
      console.log('✓ Backup do .env.local criado');
    }
    
    // Escrever config com DB offline
    const envContent = `
DATABASE_URL=mysql://vendas:vendas123@invalid-host:3306/vendas_app
NODE_ENV=development
JWT_ACCESS_SECRET=test-access-secret-boot
JWT_REFRESH_SECRET=test-refresh-secret-boot
PORT=3001
`;
    
    fs.writeFileSync(envPath, envContent);
    console.log('✓ .env.local configurado com DB offline');
    
    // Testar boot validator diretamente
    console.log('\n🔍 Testando boot validator...');
    
    // Usar tsx para executar TypeScript
    const testProcess = spawn('npx', ['tsx', 'server/_core/boot-validator-fixed.ts'], {
      stdio: 'pipe',
      cwd: __dirname,
      env: {
        ...process.env,
        DATABASE_URL: 'mysql://vendas:vendas123@invalid-host:3306/vendas_app',
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret'
      }
    });
    
    let output = '';
    let hasDBError = false;
    let bootFailed = false;
    
    const timeout = setTimeout(() => {
      console.log('\n⏰ TIMEOUT: Teste demorou demais');
      testProcess.kill('SIGTERM');
    }, 15000);
    
    testProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
      
      if (text.includes('Database connection failed') ||
          text.includes('ECONNREFUSED') ||
          text.includes('ENOTFOUND') ||
          text.includes('getaddrinfo')) {
        hasDBError = true;
      }
      
      if (text.includes('BOOT-FAILED') ||
          text.includes('Critical boot validation failed')) {
        bootFailed = true;
      }
    });
    
    testProcess.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
      
      if (text.includes('ECONNREFUSED') ||
          text.includes('ENOTFOUND') ||
          text.includes('getaddrinfo')) {
        hasDBError = true;
      }
    });
    
    testProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      console.log('\n' + '='.repeat(60));
      console.log('RESULTADO');
      console.log('='.repeat(60));
      
      if (hasDBError && bootFailed) {
        console.log('✅ PASSOU: Boot falhou com erro de DB');
        console.log('✅ FAIL-FAST funcionou corretamente');
      } else if (hasDBError) {
        console.log('⚠️ PARCIAL: Erro de DB detectado mas boot não falhou claramente');
      } else {
        console.log('❌ FALHOU: Nenhum erro de DB detectado');
        console.log('❌ FAIL-FAST pode não estar funcionando');
      }
      
      console.log(`Exit code: ${code}`);
      
      // Restaurar .env.local
      try {
        if (fs.existsSync(envBackup)) {
          fs.copyFileSync(envBackup, envPath);
          fs.unlinkSync(envBackup);
          console.log('\n✓ .env.local restaurado');
        } else {
          fs.unlinkSync(envPath);
          console.log('\n✓ .env.local de teste removido');
        }
      } catch (e) {
        console.log('\n⚠ Erro ao restaurar .env.local:', e.message);
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

testBootWithDBOffline();
