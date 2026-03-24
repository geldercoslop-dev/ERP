import mysql from 'mysql2/promise';

const DEFAULT_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'vendas',
  password: 'vendas123',
  database: 'vendas_app',
};

async function testProdutosQueries() {
  let conn;
  try {
    console.log('🔗 Conectando ao MySQL...');
    conn = await mysql.createConnection(DEFAULT_CONFIG);
    console.log('✅ Conectado ao MySQL\n');

    // 1. Verificar schema
    console.log('1️⃣ Testando estrutura de tabelas...');
    try {
      const [cols] = await conn.query('DESCRIBE produtos');
      console.log(`✅ Tabela 'produtos' OK (${cols.length} colunas)\n`);
    } catch (e) {
      console.error('❌ Erro em DESCRIBE produtos:', e.message);
      return;
    }

    // 2. Contar produtos ativos
    console.log('2️⃣ Contando produtos ativos...');
    const [[row]] = await conn.query(
      'SELECT COUNT(*) as total FROM produtos WHERE ativo = 1'
    );
    console.log(`✅ Total de produtos ativos: ${row.total}\n`);

    // 3. Query 1: Listar produtos com preço
    console.log('3️⃣ Query de produtos base (SELECT simples)...');
    const [produtos] = await conn.query(
      `SELECT id, descricao, marca, valorVenda, ativo FROM produtos WHERE ativo = 1 ORDER BY descricao LIMIT 5`
    );
    console.log(`✅ Produtos encontrados: ${produtos.length}`);
    if (produtos.length > 0) {
      console.log(`   Exemplo: ${produtos[0].id} - ${produtos[0].descricao} (R$ ${produtos[0].valorVenda})\n`);
    } else {
      console.log('⚠️  Nenhum produto encontrado\n');
    }

    // 4. Query 2: Variações com GROUP_CONCAT
    console.log('4️⃣ Query de variações (GROUP_CONCAT)...');
    try {
      const [variacoes] = await conn.query(`
        SELECT
          pv.produtoId,
          GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
          GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
          MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho
        FROM produto_variacoes pv
        LEFT JOIN cores c ON c.id = pv.corId
        GROUP BY pv.produtoId
        LIMIT 5
      `);
      console.log(`✅ Variações encontradas: ${variacoes.length}`);
      if (variacoes.length > 0) {
        console.log(`   Exemplo: ProdutoId ${variacoes[0].produtoId}, cores: ${variacoes[0].cores}\n`);
      }
    } catch (e) {
      console.error('❌ Erro na query de variações:', e.message);
      console.error('   SQL:', e.sql);
      return;
    }

    // 5. Query 3: Promoções ativas
    console.log('5️⃣ Query de promoções (teste de datas)...');
    try {
      const now = new Date();
      const [promos] = await conn.query(`
        SELECT
          pi.produtoId,
          MIN(pi.precoPromocional) as precoPromo,
          SUBSTRING_INDEX(GROUP_CONCAT(pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
        FROM promocoes pr
        INNER JOIN promocoes_itens pi ON pi.promocaoId = pr.id
        WHERE pr.ativo = 1
          AND pr.inicio <= ?
          AND pr.fim >= ?
        GROUP BY pi.produtoId
        LIMIT 5
      `, [now, now]);
      console.log(`✅ Promoções ativas: ${promos.length}`);
      if (promos.length > 0) {
        console.log(`   Exemplo: ProdutoId ${promos[0].produtoId}, preco: R$ ${promos[0].precoPromo}\n`);
      } else {
        console.log('ℹ️  Nenhuma promoção ativa no momento\n');
      }
    } catch (e) {
      console.error('❌ Erro na query de promoções:', e.message);
      console.error('   SQL:', e.sql);
      return;
    }

    console.log('✅ TODAS AS QUERIES EXECUTADAS COM SUCESSO!');
    console.log('=' .repeat(50));
    console.log('RESULTADO: Não há erro SQL na query de produtos');

  } catch (e) {
    console.error('❌ ERRO DE CONEXÃO:', e.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

testProdutosQueries();
