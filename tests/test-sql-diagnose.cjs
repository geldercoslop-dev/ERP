#!/usr/bin/env node
const mysql = require('mysql2/promise');

const config = {
  host: 'localhost',
  port: 3306,
  user: 'vendas',
  password: 'vendas123',
  database: 'vendas_app',
  connectTimeout: 5000
};

async function test() {
  let conn;
  try {
    console.log('🔗 Conectando...');
    conn = await mysql.createConnection(config);
    console.log('✅ Conectado\n');

    // 1. Produtos ativos
    console.log('1️⃣ Testando produtos...');
    const [[count]] = await conn.query(
      'SELECT COUNT(*) as cnt FROM produtos WHERE ativo = 1'
    );
    console.log(`✅ Produtos ativos: ${count.cnt}\n`);

    // 2. Query base de produtos
    console.log('2️⃣ Query de produtos com preço...');
    const [produtos] = await conn.query(
      'SELECT id, descricao, valorVenda FROM produtos WHERE ativo = 1 LIMIT 3'
    );
    console.log(`✅ Retornou ${produtos.length} produtos`);
    produtos.forEach(p => {
      console.log(`   - ${p.id}: ${p.descricao} (R$ ${p.valorVenda})`);
    });
    console.log();

    // 3. Teste de variações (é aqui que pode estar o problema)
    console.log('3️⃣ Testando query de variações...');
    const ids = produtos.map(p => p.id);
    if (ids.length > 0) {
      try {
        const sql = `
          SELECT
            pv.produtoId,
            GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores
          FROM produto_variacoes pv
          LEFT JOIN cores c ON c.id = pv.corId
          WHERE pv.produtoId IN (${ids.map(() => '?').join(',')})
          GROUP BY pv.produtoId
        `;
        const [variacoes] = await conn.query(sql, ids);
        console.log(`✅ Variações: ${variacoes.length} produtos com variações\n`);
      } catch (e) {
        console.error(`❌ ERRO NA QUERY DE VARIAÇÕES:`);
        console.error(`   Mensagem: ${e.message}`);
        console.error(`   Código: ${e.code}`);
        console.error(`   SQL: ${e.sql}\n`);
        process.exit(1);
      }
    }

    // 4. Teste de promoções
    console.log('4️⃣ Testando query de promoções...');
    try {
      const now = new Date();
      const sql = `
        SELECT
          pi.produtoId,
          MIN(pi.precoPromocional) as precoPromo
        FROM promocoes pr
        INNER JOIN promocoes_itens pi ON pi.promocaoId = pr.id
        WHERE pr.ativo = 1
          AND pr.inicio <= ?
          AND pr.fim >= ?
        GROUP BY pi.produtoId
      `;
      const [promos] = await conn.query(sql, [now, now]);
      console.log(`✅ Promoções ativas: ${promos.length}\n`);
    } catch (e) {
      console.error(`❌ ERRO NA QUERY DE PROMOÇÕES:`);
      console.error(`   Mensagem: ${e.message}`);
      console.error(`   Código: ${e.code}\n`);
      process.exit(1);
    }

    console.log('═'.repeat(50));
    console.log('✅ RESULTADO: Nenhum erro SQL detectado!');
    console.log('═'.repeat(50));

  } catch (e) {
    console.error(`❌ ERRO: ${e.message}`);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

test().catch(err => {
  console.error('❌ Erro não capturado:', err);
  process.exit(1);
});
