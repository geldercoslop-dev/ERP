// 🚀 TESTE PORTA DINÂMICA - SEM LOOP INFINITO
const axios = require('axios');
const fs = require('fs');

// Configurações
const MAX_TENTATIVAS = 3;
const TIMEOUT_MS = 5000;
let portaDetectada = null;
let tentativas = 0;

// Função para extrair porta do log
function extrairPortaDoLog() {
  try {
    const portFile = 'server/_core/port.ts';
    if (fs.existsSync(portFile)) {
      const content = fs.readFileSync(portFile, 'utf8');
      const match = content.match(/export const PORT = (\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
    }
  } catch (error) {
    console.log('Erro ao ler porta do arquivo:', error.message);
  }
  return null;
}

// Função para detectar porta dinamicamente
async function detectarPorta() {
  console.log('🔍 DETECTANDO PORTA DINÂMICA...');
  
  // Tentativa 1: Ler do arquivo gerado
  portaDetectada = extrairPortaDoLog();
  if (portaDetectada) {
    console.log(`✅ Porta detectada do arquivo: ${portaDetectada}`);
    return portaDetectada;
  }
  
  // Tentativa 2: Portas comuns
  const portasComuns = [3000, 3004, 3005, 3006, 3007];
  
  for (const porta of portasComuns) {
    try {
      console.log(`🔍 Testando porta ${porta}...`);
      const response = await axios.get(`http://localhost:${porta}/ping`, {
        timeout: TIMEOUT_MS
      });
      
      if (response.status === 200) {
        portaDetectada = porta;
        console.log(`✅ Porta ${porta} respondeu!`);
        return porta;
      }
    } catch (error) {
      console.log(`❌ Porta ${porta} não respondeu`);
    }
  }
  
  throw new Error('Nenhuma porta respondeu');
}

// Função para testar endpoint
async function testarEndpoint(porta) {
  console.log(`🧪 TESTANDO ENDPOINT NA PORTA ${porta}...`);
  
  try {
    const response = await axios.get(`http://localhost:${porta}/ping`, {
      timeout: TIMEOUT_MS
    });
    
    console.log('✅ SUCESSO:');
    console.log('  Status:', response.status);
    console.log('  Data:', response.data);
    console.log('  Response time:', response.headers['x-response-time'] || 'N/A');
    
    return { success: true, data: response.data };
  } catch (error) {
    console.log('❌ ERRO:');
    console.log('  Mensagem:', error.message);
    console.log('  Código:', error.response?.status || 'N/A');
    
    return { success: false, error: error.message };
  }
}

// Função principal com controle de loop
async function executarTeste() {
  console.log('🚀 INICIANDO TESTE PORTA DINÂMICA');
  console.log('=' .repeat(50));
  
  while (tentativas < MAX_TENTATIVAS) {
    tentativas++;
    console.log(`\n📍 TENTATIVA ${tentativas}/${MAX_TENTATIVAS}`);
    
    try {
      // Detectar porta
      const porta = await detectarPorta();
      
      // Testar endpoint
      const resultado = await testarEndpoint(porta);
      
      if (resultado.success) {
        console.log('\n🎉 TESTE CONCLUÍDO COM SUCESSO!');
        console.log(`📊 Porta usada: ${porta}`);
        console.log('✅ Sem loop infinito');
        console.log('✅ Sem travamento');
        
        return {
          sucesso: true,
          porta,
          tentativas,
          resultado: resultado.data
        };
      }
      
    } catch (error) {
      console.log(`❌ Tentativa ${tentativas} falhou:`, error.message);
      
      if (tentativas >= MAX_TENTATIVAS) {
        console.log('\n💥 LIMITE DE TENTATIVAS ATINGIDO!');
        console.log('❌ PARANDO EXECUÇÃO PARA EVITAR LOOP INFINITO');
        
        return {
          sucesso: false,
          erro: error.message,
          tentativas
        };
      }
      
      // Esperar antes da próxima tentativa
      console.log('⏳ Aguardando 2 segundos antes da próxima tentativa...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Executar teste
executarTeste()
  .then((resultado) => {
    console.log('\n' + '='.repeat(50));
    console.log('📋 RELATÓRIO FINAL');
    console.log('=' .repeat(50));
    
    if (resultado.sucesso) {
      console.log('✅ Status: SUCESSO');
      console.log(`📊 Porta detectada: ${resultado.porta}`);
      console.log(`🔄 Tentativas usadas: ${resultado.tentativas}`);
      console.log('🚫 Loop infinito: ELIMINADO');
      console.log('⏱️ Travamento: NENHUM');
    } else {
      console.log('❌ Status: FALHA');
      console.log(`🔥 Erro: ${resultado.erro}`);
      console.log(`🔄 Tentativas: ${resultado.tentativas}`);
      console.log('🚫 Loop infinito: CONTROLADO');
      console.log('⏱️ Travamento: EVITADO');
    }
    
    process.exit(resultado.sucesso ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 ERRO FATAL:', error);
    process.exit(1);
  });
