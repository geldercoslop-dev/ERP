/**
 * Script para testar a performance das consultas otimizadas
 */
import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import { performance } from 'perf_hooks';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'erp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Função para medir o tempo de execução de uma consulta
async function measureQueryTime(connection, query, params = []) {
  const start = performance.now();
  await connection.execute(query, params);
  const end = performance.now();
  return end - start;
}

// Função para formatar o tempo em ms
function formatTime(ms) {
  return `${ms.toFixed(2)}ms`;
}

// Função para executar os testes
async function runTests() {
  console.log('Iniciando testes de performance do banco de dados...');
  
  // Conectar ao banco de dados
  const connection = await createConnection(dbConfig);
  console.log('Conexão estabelecida com o banco de dados');
  
  try {
    // Configurar tenant para testes
    const tenantId = Number(process.env.TEST_TENANT_ID || process.env.DEFAULT_TENANT_ID || 99);
    
    // Teste 1: Produtos com preço vigente (otimizado)
    console.log('\n--- Teste 1: Produtos com preço vigente (otimizado) ---');
    const queryProdutosOtimizado = `
      SELECT 
        p.*,
        GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
        MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho,
        MIN(pi.precoPromocional) as precoPromo,
        SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
      FROM produtos p
      LEFT JOIN produto_variacoes pv ON p.id = pv.produtoId
      LEFT JOIN cores c ON c.id = pv.corId
      LEFT JOIN promocoes_itens pi ON p.id = pi.produtoId
      LEFT JOIN promocoes pr ON pi.promocaoId = pr.id 
        AND pr.tenantId = ? 
        AND pr.ativo = 1 
        AND pr.inicio <= NOW() 
        AND pr.fim >= NOW()
      WHERE p.tenantId = ? AND p.ativo = 1
      GROUP BY p.id
      ORDER BY p.descricao ASC
      LIMIT 20 OFFSET 0
    `;
    const timeProdutosOtimizado = await measureQueryTime(connection, queryProdutosOtimizado, [tenantId, tenantId]);
    console.log(`Tempo de execução: ${formatTime(timeProdutosOtimizado)}`);
    
    // Teste 2: Contas a receber paginadas
    console.log('\n--- Teste 2: Contas a receber paginadas ---');
    const queryContasReceber = `
      SELECT * FROM contas_receber
      WHERE tenant_id = ?
      ORDER BY dataVencimento ASC
      LIMIT 50 OFFSET 0
    `;
    const timeContasReceber = await measureQueryTime(connection, queryContasReceber, [tenantId]);
    console.log(`Tempo de execução: ${formatTime(timeContasReceber)}`);
    
    // Teste 3: Pedidos com filtros
    console.log('\n--- Teste 3: Pedidos com filtros ---');
    const queryPedidos = `
      SELECT * FROM pedidos
      WHERE tenant_id = ? AND status = 'GERADO'
      ORDER BY data_criacao DESC
      LIMIT 20 OFFSET 0
    `;
    const timePedidos = await measureQueryTime(connection, queryPedidos, [tenantId]);
    console.log(`Tempo de execução: ${formatTime(timePedidos)}`);
    
    // Teste 4: Contagem de pedidos com filtros (para paginação)
    console.log('\n--- Teste 4: Contagem de pedidos com filtros ---');
    const queryCountPedidos = `
      SELECT COUNT(*) as total FROM pedidos
      WHERE tenant_id = ? AND status = 'GERADO'
    `;
    const timeCountPedidos = await measureQueryTime(connection, queryCountPedidos, [tenantId]);
    console.log(`Tempo de execução: ${formatTime(timeCountPedidos)}`);
    
    // Teste 5: Testar índices compostos
    console.log('\n--- Teste 5: Testar índices compostos ---');
    const queryIndicesCompostos = `
      SELECT * FROM produtos
      WHERE tenant_id = ? AND ativo = 1 AND categoria = 'MÓVEIS'
      ORDER BY descricao ASC
      LIMIT 20
    `;
    const timeIndicesCompostos = await measureQueryTime(connection, queryIndicesCompostos, [tenantId]);
    console.log(`Tempo de execução: ${formatTime(timeIndicesCompostos)}`);
    
    // Teste 6: EXPLAIN para verificar uso de índices
    console.log('\n--- Teste 6: EXPLAIN para verificar uso de índices ---');
    const explainQuery = `
      EXPLAIN SELECT * FROM produtos
      WHERE tenant_id = ? AND ativo = 1 AND categoria = 'MÓVEIS'
      ORDER BY descricao ASC
      LIMIT 20
    `;
    const [explainResult] = await connection.execute(explainQuery, [tenantId]);
    console.log('Resultado do EXPLAIN:');
    console.table(explainResult);
    
    // Resumo dos testes
    console.log('\n--- Resumo dos testes ---');
    console.log(`1. Produtos com preço vigente (otimizado): ${formatTime(timeProdutosOtimizado)}`);
    console.log(`2. Contas a receber paginadas: ${formatTime(timeContasReceber)}`);
    console.log(`3. Pedidos com filtros: ${formatTime(timePedidos)}`);
    console.log(`4. Contagem de pedidos com filtros: ${formatTime(timeCountPedidos)}`);
    console.log(`5. Testar índices compostos: ${formatTime(timeIndicesCompostos)}`);
    
  } finally {
    // Fechar a conexão
    await connection.end();
    console.log('\nConexão com o banco de dados fechada');
  }
}

// Executar os testes
runTests().catch(error => {
  console.error('Erro ao executar testes:', error);
  process.exit(1);
});