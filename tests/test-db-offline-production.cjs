#!/usr/bin/env node

/**
 * TESTE DE PRODUÇÃO: DB OFFLINE
 * Simula DB desligado e valida comportamento do sistema
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('TESTE DE PRODUÇÃO: DB OFFLINE');
console.log('='.repeat(60));

async function testDBOffline() {
  try {
    // Criar .env.production com DB offline
    const envPath = path.join(__dirname, '.env.production');
    const envBackup = path.join(__dirname, '.env.production.backup');
    
    // Backup do original
    if (fs.existsSync(envPath)) {
      fs.copyFileSync(envPath, envBackup);
      console.log('✓ Backup do .env.production criado');
    }
    
    // Config com DB offline
    const envOfflineContent = `
# PRODUÇÃO COM DB OFFLINE (TESTE)
DATABASE_URL=mysql://vendas:vendas123@invalid-host:3306/vendas_app
NODE_ENV=production
JWT_ACCESS_SECRET=prod-access-secret-boot-test
JWT_REFRESH_SECRET=prod-refresh-secret-boot-test
PORT=3001
SENTRY_DSN=
`;
    
    fs.writeFileSync(envPath, envOfflineContent);
    console.log('✓ .env.production configurado com DB offline');
    
    // Iniciar servidor em modo produção
    console.log('\n🚀 Iniciando servidor em produção com DB offline...');
    console.log('⏱️ Timeout: 15 segundos (fail-fast esperado)');
    
    const serverProcess = spawn('node', ['dist/server/index.js'], {
      stdio: 'pipe',
      cwd: __dirname,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://vendas:vendas123@invalid-host:3306/vendas_app'
      }
    });
    
    let output = '';
    let bootFailed = false;
    let bootTimeout = false;
    
    const timeout = setTimeout(() => {
      console.log('\n⏰ TIMEOUT: Servidor não falhou rapidamente');
      console.log('❌ FAIL-FAST NÃO FUNCIONOU - violando princípio');
      bootTimeout = true;
      serverProcess.kill('SIGTERM');
    }, 15000);
    
    serverProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
      
      // Verificar se boot falhou
      if (text.includes('BOOT-FAILED') ||
          text.includes('Critical boot validation failed') ||
          text.includes('Database connection failed') ||
          text.includes('ECONNREFUSED') ||
          text.includes('ENOTFOUND') ||
          text.includes('getaddrinfo')) {
        console.log('\n✅ BOOT FALHOU COMO ESPERADO!');
        bootFailed = true;
        clearTimeout(timeout);
        serverProcess.kill('SIGTERM');
      }
      
      // Verificar se servidor iniciou (BUG CRÍTICO)
      if (text.includes('Server started') ||
          text.includes('listening on') ||
          text.includes('ready') ||
          text.includes('online')) {
        console.log('\n❌ BUG CRÍTICO: Servidor iniciou com DB offline!');
        console.log('❌ SISTEMA INSEGURO - aceitando requests sem DB');
        clearTimeout(timeout);
        serverProcess.kill('SIGTERM');
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
      
      if (text.includes('ECONNREFUSED') ||
          text.includes('ENOTFOUND') ||
          text.includes('getaddrinfo')) {
        console.log('\n✅ Erro de conexão DB detectado (esperado)');
      }
    });
    
    serverProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      console.log('\n' + '='.repeat(60));
      console.log('RESULTADO DO TESTE DE PRODUÇÃO');
      console.log('='.repeat(60));
      
      if (bootFailed) {
        console.log('✅ SEGURO: Boot falhou com DB offline');
        console.log('✅ FAIL-FAST funcionou corretamente');
        console.log('✅ Sistema não aceita requests sem DB');
      } else if (bootTimeout) {
        console.log('⚠ RISCO: Servidor demorou para falhar');
        console.log('⚠ Pode indicar retry excessivo');
      } else {
        console.log('❌ INSEGURO: Servidor iniciou com DB offline');
        console.log('❌ BUG CRÍTICO DE PRODUÇÃO');
        console.log('❌ Sistema aceitaria requests sem DB');
      }
      
      console.log(`\nExit code: ${code}`);
      
      // Analisar logs
      analyzeLogs(output);
      
      // Restaurar ambiente
      restoreEnvironment();
    });
    
    function analyzeLogs(output) {
      console.log('\n📊 Análise dos logs:');
      
      if (output.includes('BootValidatorFixed')) {
        console.log('✅ BootValidatorFixed foi executado');
      }
      
      if (output.includes('Database connection failed')) {
        console.log('✅ Falha de DB detectada e logada');
      }
      
      if (output.includes('Critical boot validation failed')) {
        console.log('✅ Validação crítica falhou como esperado');
      }
      
      const errorCount = (output.match(/error/gi) || []).length;
      console.log(`📈 Total de erros detectados: ${errorCount}`);
      
      if (errorCount > 0) {
        console.log('✅ Sistema gerou erros (comportamento esperado)');
      }
    }
    
    function restoreEnvironment() {
      try {
        if (fs.existsSync(envBackup)) {
          fs.copyFileSync(envBackup, envPath);
          fs.unlinkSync(envBackup);
          console.log('\n✓ .env.production restaurado');
        } else {
          fs.unlinkSync(envPath);
          console.log('\n✓ .env.production de teste removido');
        }
      } catch (error) {
        console.log('\n⚠ Erro ao restaurar ambiente:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

// Verificar se o build existe
const distPath = path.join(__dirname, 'dist', 'index.js');
if (!fs.existsSync(distPath)) {
  console.log('❌ Build não encontrado em dist/server/index.js');
  console.log('💡 Execute: pnpm run build');
  process.exit(1);
}

testDBOffline();
