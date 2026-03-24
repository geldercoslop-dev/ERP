import mysql from 'mysql2/promise';

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'vendas',
    password: 'vendas123',
    database: 'vendas_app'
  });

  try {
    console.log('=== INVESTIGAÇÃO: itens_pedido ===\n');

    // 1. Describe table
    const [columns] = await c.execute('DESCRIBE itens_pedido');
    console.log('1️⃣ Colunas reais em itens_pedido:');
    columns.forEach(col => {
      console.log(`   - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Key ? `[${col.Key}]` : ''}`);
    });
    console.log('');

    // 2. Schema.ts expected
    console.log('2️⃣ Schema.ts declara para itensPedido:');
    const expectedColumns = [
      'id (int, PRI, AI)',
      'tenant_id (int, NOT NULL)',
      'pedidoId (int, NOT NULL)',
      'tipo (enum LIVRE|CATALOGO)',
      'produtoId (int, NULL)',
      'corId (int, NULL)',
      'corNome (varchar)',
      'descricao (text, NOT NULL)',
      'marca (varchar)',
      'quantidade (int)',
      'valorUnitario (decimal)',
      'custo (decimal)',
      'prazoGarantia (int)',
      'createdAt (timestamp)',
    ];
    expectedColumns.forEach(col => console.log(`   - ${col}`));
    console.log('');

    // 3. Check if tenant_id exists
    const tenantIdExists = columns.some(c => c.Field === 'tenant_id');
    console.log(`3️⃣ tenant_id existe? ${tenantIdExists ? '✅ SIM' : '❌ NÃO'}`);
    console.log('');

    // 4. Try INSERT with different approaches
    console.log('4️⃣ Tentando INSERT...\n');

    // Approach 1: Com tenant_id
    try {
      await c.execute(
        `INSERT INTO itens_pedido (tenant_id, pedidoId, tipo, descricao, quantidade, valorUnitario, custo, prazoGarantia, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [1, 1, 'LIVRE', 'Teste com tenant_id', 1, 100, 50, 90]
      );
      console.log('   ✅ INSERT com tenant_id funcionou');
    } catch (e) {
      console.log('   ❌ INSERT com tenant_id falhou:');
      console.log(`      ${e.message}\n`);
    }

    // Approach 2: Sem tenant_id
    try {
      await c.execute(
        `INSERT INTO itens_pedido (pedidoId, tipo, descricao, quantidade, valorUnitario, custo, prazoGarantia, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [1, 'LIVRE', 'Teste sem tenant_id', 1, 100, 50, 90]
      );
      console.log('   ✅ INSERT sem tenant_id funcionou');
    } catch (e) {
      console.log('   ❌ INSERT sem tenant_id falhou:');
      console.log(`      ${e.message}\n`);
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  }

  await c.end();
})();
