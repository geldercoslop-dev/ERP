// Teste direto de conexão com banco - SELECT 1
import mysql from 'mysql2/promise';

function parseDatabaseUrl(): { host: string; port: number; user: string; password: string; database: string } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL é obrigatório');
  }

  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '3306'),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1).replace(/^\//, '') || 'vendas_app',
    };
  } catch (error) {
    throw new Error(`DATABASE_URL inválido: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testarConexaoDireta() {
  console.log('🔍 TESTE DIRETO DE CONEXÃO - SELECT 1\n');
  
  const config = parseDatabaseUrl();
  
  console.log('📋 Configuração:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Porta: ${config.port}`);
  console.log(`   User: ${config.user}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   Password: ${config.password ? '***' : 'NÃO DEFINIDO'}`);
  
  let connection;
  
  try {
    console.log('\n🔌 Tentando conectar...');
    connection = await mysql.createConnection(config);
    console.log('✅ Conexão estabelecida!');
    
    console.log('\n🎯 Executando SELECT 1...');
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ SELECT 1 executado:', rows);
    
    console.log('\n📊 Verificando banco de dados...');
    const [databases] = await connection.execute('SHOW DATABASES');
    const dbExists = databases.some((db: any) => db.Database === config.database);
    console.log(`   Banco "${config.database}" existe: ${dbExists ? '✅' : '❌'}`);
    
    if (dbExists) {
      console.log('\n📋 Verificando tabelas principais...');
      const [tables] = await connection.execute(`SHOW TABLES FROM \`${config.database}\``);
      const tableNames = tables.map((t: any) => Object.values(t)[0]);
      
      const tabelasEssenciais = ['clientes', 'produtos', 'pedidos', 'itens_pedido'];
      console.log('   Tabelas encontradas:', tableNames);
      
      for (const tabela of tabelasEssenciais) {
        const exists = tableNames.includes(tabela);
        console.log(`   ${tabela}: ${exists ? '✅' : '❌'}`);
      }
    }
    
    console.log('\n🎉 TESTE DE CONEXÃO: ✅ SUCESSO');
    return { sucesso: true, erro: null, config };
    
  } catch (error) {
    console.error('\n❌ ERRO DE CONEXÃO:');
    console.error('   Tipo:', error.constructor.name);
    console.error('   Mensagem:', error.message);
    console.error('   Código:', error.code || 'N/A');
    
    // Diagnóstico específico
    if (error.code === 'ECONNREFUSED') {
      console.error('   🔍 DIAGNÓSTICO: MySQL não está rodando ou porta errada');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   🔍 DIAGNÓSTICO: Usuário ou senha incorretos');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('   🔍 DIAGNÓSTICO: Banco de dados não existe');
    } else if (error.code === 'ENOTFOUND') {
      console.error('   🔍 DIAGNÓSTICO: Host não encontrado (verifique localhost vs 127.0.0.1)');
    }
    
    return { sucesso: false, erro: error.message, config };
    
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão fechada');
    }
  }
}

// Teste rápido de porta
async function testarPortaMySQL() {
  console.log('\n🔍 TESTE RÁPIDO DE PORTA MYSQL');
  
  const config = parseDatabaseUrl();
  const port = config.port;
  const host = config.host;
  
  try {
    const net = require('net');
    const socket = new net.Socket();
    
    return new Promise((resolve) => {
      socket.setTimeout(3000);
      
      socket.on('connect', () => {
        console.log(`✅ Porta ${port} está aberta em ${host}`);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        console.log(`❌ Porta ${port} não respondeu (timeout)`);
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', () => {
        console.log(`❌ Porta ${port} não está acessível em ${host}`);
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(port, host);
    });
    
  } catch (error) {
    console.log(`❌ Erro ao testar porta: ${error.message}`);
    return false;
  }
}

// Execução principal
async function executarTestesConexao() {
  console.log('🚀 INICIANDO TESTES DE CONEXÃO COM BANCO\n');
  
  // Teste 1: Porta
  const portaOk = await testarPortaMySQL();
  
  // Teste 2: Conexão completa
  const conexaoResult = await testarConexaoDireta();
  
  console.log('\n📊 RESUMO DOS TESTES:');
  console.log('='.repeat(50));
  console.log(`Porta MySQL: ${portaOk ? '✅' : '❌'}`);
  console.log(`Conexão DB: ${conexaoResult.sucesso ? '✅' : '❌'}`);
  
  if (!conexaoResult.sucesso) {
    console.log('\n🔧 POSSÍVEIS CORREÇÕES:');
    console.log('1. Verificar se MySQL está rodando');
    console.log('2. Verificar porta (padrão 3306)');
    console.log('3. Verificar usuário e senha');
    console.log('4. Verificar se banco existe');
    console.log('5. Tentar host=127.0.0.1 vs localhost');
  }
  
  return {
    porta: portaOk,
    conexao: conexaoResult.sucesso,
    erro: conexaoResult.erro,
    config: conexaoResult.config
  };
}

export { executarTestesConexao, testarConexaoDireta, testarPortaMySQL };
