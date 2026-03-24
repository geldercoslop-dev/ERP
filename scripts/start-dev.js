/**
 * Script de desenvolvimento melhorado com gerenciamento de portas
 * Inicia backend e frontend com tratamento automático de conflitos
 */
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';

// Cores para console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${message}`);
}

/**
 * Verifica se um processo está rodando em uma porta específica
 */
function checkPort(port) {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
      if (error || !stdout) {
        resolve(false);
        return;
      }
      resolve(stdout.trim().length > 0);
    });
  });
}

/**
 * Limpa porta 5173
 */
async function cleanPort() {
  log('🧹 Limpando porta 5173...', 'yellow');
  
  try {
    const { main } = await import('./kill-port.js');
    await main();
    return true;
  } catch (error) {
    log(`⚠️ Erro ao limpar porta: ${error.message}`, 'yellow');
    return false;
  }
}

/**
 * Inicia o servidor backend
 */
function startBackend() {
  return new Promise((resolve, reject) => {
    log('🚀 Iniciando backend...', 'cyan');
    
    const backend = spawn('pnpm', ['dev:server'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: process.cwd(),
      shell: true
    });
    
    let backendReady = false;
    
    backend.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(`[Backend] ${output}`);
      
      if (output.includes('GRS ERP Server iniciado com sucesso')) {
        backendReady = true;
        log('✅ Backend iniciado com sucesso!', 'green');
        resolve(backend);
      }
    });
    
    backend.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(`[Backend ERROR] ${output}`);
    });
    
    backend.on('error', (error) => {
      log(`❌ Erro ao iniciar backend: ${error.message}`, 'red');
      reject(error);
    });
    
    // Timeout de 30 segundos
    setTimeout(() => {
      if (!backendReady) {
        log('⚠️ Backend demorou para iniciar, mas continuando...', 'yellow');
        resolve(backend);
      }
    }, 30000);
  });
}

/**
 * Inicia o servidor frontend
 */
function startFrontend() {
  return new Promise((resolve, reject) => {
    log('🎨 Iniciando frontend...', 'magenta');
    
    const frontend = spawn('pnpm', ['dev:client'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: process.cwd(),
      shell: true
    });
    
    let frontendReady = false;
    let frontendPort = 5173;
    
    frontend.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(`[Frontend] ${output}`);
      
      // Detectar se o Vite iniciou
      if (output.includes('ready in') && output.includes('Local:')) {
        frontendReady = true;
        
        // Extrair porta do output
        const portMatch = output.match(/localhost:(\d+)/);
        if (portMatch) {
          frontendPort = portMatch[1];
        }
        
        if (frontendPort === '5173') {
          log(`✅ Frontend iniciado na porta padrão: ${frontendPort}`, 'green');
        } else {
          log(`⚠️ Porta 5173 ocupada → usando porta alternativa: ${frontendPort}`, 'yellow');
        }
        
        resolve(frontend, frontendPort);
      }
    });
    
    frontend.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(`[Frontend ERROR] ${output}`);
      
      // Detectar erro de porta ocupada
      if (output.includes('Port 5173 is already in use')) {
        log('❌ Erro: Porta 5173 está ocupada!', 'red');
        log('🔄 Tentando limpar porta e reiniciar...', 'yellow');
      }
    });
    
    frontend.on('error', (error) => {
      log(`❌ Erro ao iniciar frontend: ${error.message}`, 'red');
      reject(error);
    });
    
    // Timeout de 30 segundos
    setTimeout(() => {
      if (!frontendReady) {
        log('⚠️ Frontend demorou para iniciar, mas continuando...', 'yellow');
        resolve(frontend, frontendPort);
      }
    }, 30000);
  });
}

/**
 * Função principal
 */
async function main() {
  log('🌟 Iniciando ambiente de desenvolvimento GRS ERP');
  log('=' .repeat(50));
  log('DEBUG: Iniciando main function...');
  
  try {
    // Verificar se porta 5173 está ocupada
    log('DEBUG: Verificando porta 5173...');
    const portOccupied = await checkPort(5173);
    log(`DEBUG: Porta ocupada: ${portOccupied}`);
    
    if (portOccupied) {
      log('⚠️ Porta 5173 está ocupada, limpando...');
      await cleanPort();
    } else {
      log('✅ Porta 5173 está livre');
    }
    
    // Iniciar backend
    log('DEBUG: Iniciando backend...');
    const backend = await startBackend();
    log('DEBUG: Backend iniciado');
    
    // Aguardar um pouco antes de iniciar o frontend
    log('⏳ Aguardando backend estabilizar...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Iniciar frontend
    log('DEBUG: Iniciando frontend...');
    const [frontend, frontendPort] = await startFrontend();
    log('DEBUG: Frontend iniciado');
    
    // Mostrar informações de acesso
    log('\n' + '=' .repeat(50));
    log('🎉 AMBIENTE DE DESENVOLVIMENTO INICIADO!');
    log('=' .repeat(50));
    log(`📍 Backend: http://localhost:3004/`);
    log(`📍 Frontend: http://localhost:${frontendPort}/`);
    log(`🔗 Health: http://localhost:3004/api/health`);
    log(`🔌 tRPC: http://localhost:3004/api/trpc`);
    log('\n📝 Credenciais de login:');
    log(`   Usuário: admin`);
    log(`   Senha: admin123`);
    log('\n💡 Dicas:');
    log('   • Use Ctrl+C para parar os servidores');
    log('   • Logs aparecem em tempo real');
    log('   • Porta é liberada automaticamente');
    log('=' .repeat(50));
    
    // Tratamento de encerramento
    process.on('SIGINT', () => {
      log('\n\n🛑 Encerrando ambiente de desenvolvimento...');
      
      if (backend) {
        backend.kill('SIGINT');
      }
      
      if (frontend) {
        frontend.kill('SIGINT');
      }
      
      setTimeout(() => {
        log('✅ Ambiente encerrado');
        process.exit(0);
      }, 2000);
    });
    
    process.on('SIGTERM', () => {
      log('\n\n🛑 Encerrando ambiente de desenvolvimento...');
      
      if (backend) backend.kill('SIGTERM');
      if (frontend) frontend.kill('SIGTERM');
      
      setTimeout(() => {
        log('✅ Ambiente encerrado');
        process.exit(0);
      }, 2000);
    });
    
  } catch (error) {
    log(`❌ Erro fatal: ${error.message}`);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
