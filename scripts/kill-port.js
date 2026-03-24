/**
 * Script para limpar porta 5173 automaticamente
 * Detecta e finaliza processos usando a porta do Vite
 */
import { execSync, exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

const PORT = 5173;

/**
 * Verifica se a porta está em uso e retorna o PID
 */
async function checkPort(port) {
  try {
    console.log(`[Kill Port] Verificando porta ${port}...`);
    
    // No Windows: netstat -ano | findstr :PORT
    const { stdout } = await execPromise(`netstat -ano | findstr :${port}`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    if (!stdout || stdout.trim() === '') {
      console.log(`[Kill Port] ✅ Porta ${port} está livre`);
      return null;
    }
    
    // Extrair PID da saída do netstat
    const lines = stdout.trim().split('\n');
    const pids = new Set();
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      
      if (pid && /^\d+$/.test(pid)) {
        pids.add(pid);
      }
    }
    
    if (pids.size === 0) {
      console.log(`[Kill Port] ✅ Porta ${port} está livre`);
      return null;
    }
    
    console.log(`[Kill Port] ❌ Porta ${port} está em uso pelos PIDs: ${Array.from(pids).join(', ')}`);
    return Array.from(pids);
    
  } catch (error) {
    // Se netstat falhar, assume que porta está livre
    console.log(`[Kill Port] ⚠️ Erro ao verificar porta ${port}: ${error.message}`);
    console.log(`[Kill Port] Assumindo que porta está livre...`);
    return null;
  }
}

/**
 * Finaliza processo por PID
 */
async function killProcess(pid) {
  try {
    console.log(`[Kill Port] 🔄 Finalizando processo PID ${pid}...`);
    
    // Verificar se o processo ainda existe
    try {
      execSync(`tasklist /FI "PID eq ${pid}"`, { stdio: 'ignore' });
    } catch (error) {
      console.log(`[Kill Port] ✅ Processo PID ${pid} não existe mais`);
      return true;
    }
    
    // Tentar finalizar graceful primeiro
    try {
      execSync(`taskkill /PID ${pid}`, { stdio: 'ignore' });
      console.log(`[Kill Port] ✅ Processo PID ${pid} finalizado (graceful)`);
      return true;
    } catch (error) {
      // Se graceful falhar, forçar
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`[Kill Port] ✅ Processo PID ${pid} finalizado (forçado)`);
        return true;
      } catch (forceError) {
        console.log(`[Kill Port] ❌ Não foi possível finalizar processo PID ${pid}: ${forceError.message}`);
        return false;
      }
    }
    
  } catch (error) {
    console.log(`[Kill Port] ❌ Erro ao finalizar processo PID ${pid}: ${error.message}`);
    return false;
  }
}

/**
 * Verifica se o processo é Node.js (evitar matar processos importantes)
 */
async function isNodeProcess(pid) {
  try {
    const { stdout } = await execPromise(`tasklist /FI "PID eq ${pid}" /FO CSV`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    return stdout.toLowerCase().includes('node.exe');
  } catch (error) {
    return false;
  }
}

/**
 * Função principal
 */
async function main() {
  console.log('🧹 [Kill Port] Limpando porta 5173 para o Vite...');
  console.log('🧹 [Kill Port] Script iniciado...');
  
  try {
    const pids = await checkPort(PORT);
    
    if (!pids || pids.length === 0) {
      console.log('🎉 [Kill Port] Porta 5173 está livre, pronto para iniciar o Vite!');
      process.exit(0);
    }
    
    let killedCount = 0;
    
    for (const pid of pids) {
      // Verificar se é processo Node.js
      const isNode = await isNodeProcess(pid);
      
      if (!isNode) {
        console.log(`[Kill Port] ⚠️ PID ${pid} não é um processo Node.js, ignorando...`);
        continue;
      }
      
      const killed = await killProcess(pid);
      if (killed) {
        killedCount++;
      }
      
      // Aguardar um pouco entre kills
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (killedCount > 0) {
      console.log(`🎉 [Kill Port] ${killedCount} processo(s) finalizado(s) com sucesso!`);
      
      // Aguardar um pouco para o sistema liberar a porta
      console.log('[Kill Port] ⏳ Aguardando 2 segundos para a porta ser liberada...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verificar novamente
      const remainingPids = await checkPort(PORT);
      
      if (!remainingPids || remainingPids.length === 0) {
        console.log('✅ [Kill Port] Porta 5173 liberada com sucesso!');
      } else {
        console.log(`⚠️ [Kill Port] Ainda há processos na porta: ${remainingPids.join(', ')}`);
      }
    } else {
      console.log('⚠️ [Kill Port] Nenhum processo foi finalizado');
    }
    
    console.log('🚀 [Kill Port] Pronto para iniciar o Vite!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ [Kill Port] Erro durante limpeza:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
main();

export { main, checkPort, killProcess };
