import mysql from 'mysql2/promise';

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'vendas',
    password: 'vendas123',
    database: 'vendas_app'
  });

  try {
    console.log('=== TEST: CRIAR CLIENTE + PEDIDO ===\n');

    // 1. Criar cliente
    console.log('1️⃣ Criando cliente...');
    const clientName = `Cliente Teste ${Date.now()}`;
    const randomPhone = `119${Math.random().toString().slice(2, 11)}`;
    const [clientResult] = await c.execute(
      `INSERT INTO clientes (tenant_id, nome, telefone, telefoneNorm, nomeNorm, sobrenomeNorm, cidade, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [1, clientName, randomPhone, randomPhone, 'cliente', 'teste', 'São Paulo']
    );

    const clientId = clientResult.insertId;
    console.log(`✅ Cliente criado: ID=${clientId}, Nome=${clientName}\n`);

    // 2. Verificar cliente
    const [clients] = await c.execute('SELECT id, nome FROM clientes WHERE id = ?', [clientId]);
    const client = clients[0];
    console.log('2️⃣ Cliente no banco:');
    console.log(JSON.stringify(client, null, 2));
    console.log('');

    // 3. Pegar um vendedor (ou o admin)
    console.log('3️⃣ Procurando vendedor...');
    const [vendedores] = await c.execute('SELECT id, nome FROM vendedores LIMIT 1');
    const vendedor = vendedores[0] || { id: 1, nome: 'Admin' };
    console.log(`Vendedor: ID=${vendedor.id}, Nome=${vendedor.nome}\n`);

    // 4. Criar pedido
    console.log('4️⃣ Criando pedido...');
    const [pedidoResult] = await c.execute(
      `INSERT INTO pedidos (
        tenant_id, numero, vendedorId, clienteId, clienteNome, clienteTelefone,
        subtotal, desconto, frete, total, status, data_criacao, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [
        1,
        Math.floor(Math.random() * 100000),
        vendedor.id,
        clientId,
        clientName,
        '11987654321',
        100.00,
        10.00,
        5.00,
        95.00,
        'GERADO',
      ]
    );

    const pedidoId = pedidoResult.insertId;
    console.log(`✅ Pedido criado: ID=${pedidoId}\n`);

    // 5. Verificar pedido
    const [pedidos] = await c.execute(
      'SELECT id, numero, clienteNome, total, status FROM pedidos WHERE id = ?',
      [pedidoId]
    );
    const pedido = pedidos[0];
    console.log('5️⃣ Pedido no banco:');
    console.log(JSON.stringify(pedido, null, 2));
    console.log('');

    // 6. Adicionar item ao pedido
    console.log('6️⃣ Adicionando item ao pedido...');
    const [itemResult] = await c.execute(
      `INSERT INTO itens_pedido (
        tenant_id, pedidoId, tipo, descricao, quantidade, valorUnitario, custo, prazoGarantia, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [1, pedidoId, 'LIVRE', 'Produto Teste', 2, 50.00, 30.00, 90]
    );

    const itemId = itemResult.insertId;
    console.log(`✅ Item criado: ID=${itemId}\n`);

    // 7. Verificar item
    const [items] = await c.execute(
      'SELECT id, pedidoId, descricao, quantidade, valorUnitario FROM itens_pedido WHERE id = ?',
      [itemId]
    );
    const item = items[0];
    console.log('7️⃣ Item no banco:');
    console.log(JSON.stringify(item, null, 2));
    console.log('');

    console.log('✅ TESTE COMPLETO COM SUCESSO!');
    console.log(`- Cliente: ${clientName} (ID=${clientId})`);
    console.log(`- Pedido: #${pedido.numero} (ID=${pedidoId})`);
    console.log(`- Item: ${item.descricao} x ${item.quantidade} (ID=${itemId})`);

  } catch (err) {
    console.error('❌ Erro:', err.message);
  }

  await c.end();
})();
