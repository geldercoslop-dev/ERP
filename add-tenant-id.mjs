import mysql from 'mysql2/promise';

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'vendas',
    password: 'vendas123',
    database: 'vendas_app'
  });

  try {
    console.log('Adicionando coluna tenant_id em itens_pedido...\n');
    await c.execute('ALTER TABLE itens_pedido ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    console.log('✅ Coluna tenant_id adicionada com sucesso\n');

    // Verify
    const [columns] = await c.execute('DESCRIBE itens_pedido');
    console.log('Colunas atualizadas:');
    columns.forEach(col => {
      console.log(`   - ${col.Field}: ${col.Type}`);
    });

  } catch (e) {
    console.log('Erro: ' + e.message);
  }

  await c.end();
})();
