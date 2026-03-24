#!/usr/bin/env node
const mysql = require('mysql2/promise');

const config = {
  host: 'localhost',
  port: 3306,
  user: 'vendas',
  password: 'vendas123',
  database: 'vendas_app'
};

async function testExactQuery() {
  let conn;
  try {
    console.log('🔗 Testando query exata de getAllProdutosComPrecoVigente...\n');
    conn = await mysql.createConnection(config);

    // Step 1: Buscar produtos ativos
    console.log('STEP 1: Buscando produtos ativos...');
    const [produtos] = await conn.query(
      'SELECT id FROM produtos WHERE ativo = 1 ORDER BY descricao'
    );
    const ids = produtos.map(p => p.id);
    console.log(`✅ Encontrados ${ids.length} produtos\n`);

    if (ids.length === 0) {
      console.log('❌ Nenhum produto ativo para testar variações!');
      return;
    }

    // Step 2: Testar query de variações com sql.join (simulando)
    console.log('STEP 2: Testando query de variações (com sql.join)...');
    const idsList = ids.map((id, i) => `?`).join(',');
    const variacoesSQL = `
      SELECT
        pv.produtoId as produtoId,
        GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
        GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
        MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho
      FROM produto_variacoes pv
      LEFT JOIN cores c ON c.id = pv.corId
      WHERE pv.produtoId IN (${idsList})
      GROUP BY pv.produtoId
    `;
    
    try {
      const [variacoes] = await conn.query(variacoesSQL, ids);
      console.log(`✅ Query de variações OK - ${variacoes.length} registros\n`);
      if (variacoes.length > 0) {
        console.log(`   Exemplo: ${JSON.stringify(variacoes[0], null, 2)}\n`);
      }
    } catch (e) {
      console.error('❌ ERRO NA QUERY DE VARIAÇÕES:');
      console.error(`   Código: ${e.code}`);
      console.error(`   Mensagem: ${e.message}`);
      console.error(`   SQL: ${e.sql}\n`);
      return;
    }

    // Step 3: Testar query de promoções com sql.join
    console.log('STEP 3: Testando query de promoções (com sql.join)...');
    const now = new Date();
    const promosSQL = `
      SELECT
        pi.produtoId as produtoId,
        MIN(pi.precoPromocional) as precoPromo,
        SUBSTRING_INDEX(GROUP_CONCAT(pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
      FROM promocoes pr
      INNER JOIN promocoes_itens pi ON pi.promocaoId = pr.id
      WHERE pr.ativo = 1
        AND pr.inicio <= ?
        AND pr.fim >= ?
        AND pi.produtoId IN (${idsList})
      GROUP BY pi.produtoId
    `;

    try {
      const [promos] = await conn.query(promosSQL, [now, now, ...ids]);
      console.log(`✅ Query de promoções OK - ${promos.length} registros\n`);
      if (promos.length > 0) {
        console.log(`   Exemplo: ${JSON.stringify(promos[0], null, 2)}\n`);
      }
    } catch (e) {
      console.error('❌ ERRO NA QUERY DE PROMOÇÕES:');
      console.error(`   Código: ${e.code}`);
      console.error(`   Mensagem: ${e.message}`);
      console.error(`   SQL: ${e.sql}\n`);
      return;
    }

    console.log('═'.repeat(60));
    console.log('✅ AMBAS AS QUERIES EXECUTARAM SEM ERRO!');
    console.log('═'.repeat(60));
    console.log('\n📝 CONCLUSÃO: O erro não está nas queries SQL em si.');
    console.log('   Possíveis causas:');
    console.log('   1. Erro ao processar resultado (código TypeScript)');
    console.log('   2. Erro em (db as any).execute() vs db.select()');
    console.log('   3. Erro ao acessar índice [0] do resultado\n');

  } catch (e) {
    console.error(`❌ ERRO GERAL: ${e.message}`);
  } finally {
    if (conn) await conn.end();
  }
}

testExactQuery();
