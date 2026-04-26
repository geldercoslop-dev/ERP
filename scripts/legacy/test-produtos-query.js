/**
 * Script para testar a consulta SQL de produtos
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testProdutosQuery() {
  try {
    // Conectar ao banco de dados
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'vendas_app',
    });

    console.log('Conectado ao banco de dados');

    // Obter os IDs dos produtos
    const [produtos] = await connection.query(
      'SELECT id FROM produtos WHERE tenantId = ? AND ativo = ? LIMIT 10',
      [1, true]
    );

    if (produtos.length === 0) {
      console.log('Nenhum produto encontrado');
      await connection.end();
      return;
    }

    const ids = produtos.map(p => p.id);
    console.log(`Encontrados ${ids.length} produtos`);

    // Testar a consulta de variações
    console.log('\nTestando consulta de variações:');
    const queryVariacoes = `
      SELECT
        p.id as produtoId,
        GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
        MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho
      FROM produtos p
      LEFT JOIN produto_variacoes pv ON p.id = pv.produtoId
      LEFT JOIN cores c ON c.id = pv.corId
      WHERE p.tenantId = ? AND p.id IN (?)
      GROUP BY p.id;
    `;

    const [variacoes] = await connection.query(queryVariacoes, [1, ids]);
    console.log(`Resultado variações: ${variacoes.length} registros`);
    console.log(variacoes.slice(0, 2));

    // Testar a consulta de promoções
    console.log('\nTestando consulta de promoções:');
    const queryPromos = `
      SELECT
        pi.produtoId as produtoId,
        MIN(pi.precoPromocional) as precoPromo,
        SUBSTRING_INDEX(GROUP_CONCAT(pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
      FROM produtos p
      LEFT JOIN promocoes_itens pi ON p.id = pi.produtoId
      LEFT JOIN promocoes pr ON pi.promocaoId = pr.id AND pr.tenantId = ? AND pr.ativo = 1 AND pr.inicio <= NOW() AND pr.fim >= NOW()
      WHERE p.tenantId = ?
        AND p.id IN (?)
        AND pi.id IS NOT NULL
      GROUP BY pi.produtoId;
    `;

    const [promos] = await connection.query(queryPromos, [1, 1, ids]);
    console.log(`Resultado promoções: ${promos.length} registros`);
    console.log(promos.slice(0, 2));

    await connection.end();
    console.log('\nTestes concluídos com sucesso');
  } catch (error) {
    console.error('Erro ao testar consultas:', error);
    process.exit(1);
  }
}

testProdutosQuery();