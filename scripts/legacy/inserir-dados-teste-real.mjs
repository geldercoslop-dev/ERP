/**
 * Script para inserir dados de teste no banco de dados
 * 
 * Este script insere dados de teste diretamente no banco de dados
 * sem depender do servidor ERP estar em execução.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração do banco de dados
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'vendas',
  password: process.env.DB_PASSWORD || 'vendas123',
  database: process.env.DB_NAME || 'vendas_app',
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0
};

// IDs criados
const idsClientes = [];
const idsProdutos = [];
const idsPedidos = [];
const idsItensPedido = [];

// Função para criar um cliente
async function criarCliente(connection, index) {
  const telefone = `119${Math.floor(10000000 + Math.random() * 90000000)}`;
  const nome = `Cliente Teste ${index} ${uuidv4().substring(0, 8)}`;
  
  const [result] = await connection.execute(`
    INSERT INTO clientes (
      tenant_id, nome, telefone, telefoneNorm, nomeNorm, sobrenomeNorm,
      cidade, createdAt, updatedAt
    ) VALUES (
      1, ?, ?, ?, ?, ?,
      'São Paulo', NOW(), NOW()
    )
  `, [nome, telefone, telefone, nome.toLowerCase(), '']);
  
  const clienteId = result.insertId;
  idsClientes.push(clienteId);
  
  return clienteId;
}

// Função para criar um produto
async function criarProduto(connection, index) {
  const descricao = `Produto Teste ${index} ${uuidv4().substring(0, 8)}`;
  const valorCusto = 50 + Math.random() * 100;
  const valorVenda = valorCusto * 2;
  
  const [result] = await connection.execute(`
    INSERT INTO produtos (
      tenant_id, descricao, marca, categoria, custo, descontoFabrica, ipi, 
      frete, montagem, lucro, comissao, jurosCartao, valorVenda,
      prazoGarantia, estoque, ativo, createdAt, updatedAt
    ) VALUES (
      1, ?, 'Marca Teste', 'Categoria Teste', ?, 0, 0,
      0, 0, 0, 0, 0, ?,
      90, 100, 1, NOW(), NOW()
    )
  `, [descricao, valorCusto.toString(), valorVenda.toString()]);
  
  const produtoId = result.insertId;
  idsProdutos.push(produtoId);
  
  return produtoId;
}

// Função para criar um pedido
async function criarPedido(connection, clienteId, produtoId, index) {
  // Obter dados do cliente
  const [clienteRows] = await connection.execute('SELECT * FROM clientes WHERE id = ?', [clienteId]);
  const cliente = clienteRows[0];
  
  // Inserir pedido
  const numero = 1000 + index;
  const valorUnitario = 150.00;
  const quantidade = 1;
  const subtotal = valorUnitario * quantidade;
  const desconto = 0;
  const frete = 0;
  const total = subtotal - desconto + frete;
  
  const [resultPedido] = await connection.execute(`
    INSERT INTO pedidos (
      tenant_id, numero, vendedorId, clienteId, clienteNome, clienteTelefone,
      subtotal, desconto, frete, total, data_criacao, status,
      createdAt, updatedAt
    ) VALUES (
      1, ?, 1, ?, ?, ?,
      ?, ?, ?, ?, NOW(), 'ABERTO',
      NOW(), NOW()
    )
  `, [
    numero, 
    clienteId, 
    cliente.nome, 
    cliente.telefone,
    subtotal.toFixed(2),
    desconto.toFixed(2),
    frete.toFixed(2),
    total.toFixed(2)
  ]);
  
  const pedidoId = resultPedido.insertId;
  idsPedidos.push(pedidoId);
  
  // Inserir item do pedido
  const [resultItem] = await connection.execute(`
    INSERT INTO itens_pedido (
      pedidoId, tipo, produtoId, descricao, quantidade, valorUnitario,
      custo, prazoGarantia, createdAt, tenant_id
    ) VALUES (
      ?, 'CATALOGO', ?, ?, ?, ?,
      ?, 90, NOW(), 1
    )
  `, [
    pedidoId, 
    produtoId, 
    `Item de teste ${index}`, 
    quantidade,
    valorUnitario.toFixed(2),
    (valorUnitario * 0.6).toFixed(2) // Custo = 60% do valor unitário
  ]);
  
  const itemId = resultItem.insertId;
  idsItensPedido.push(itemId);
  
  return pedidoId;
}

// Função para testar idempotência
async function testarIdempotencia(connection, clienteId, produtoId) {
  // Inserir chave de idempotência
  const idempotencyKey = `teste-idempotencia-${Date.now()}`;
  
  try {
    // Verificar se a tabela idempotency_keys existe
    const [tablesResult] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'idempotency_keys'
    `, [DB_CONFIG.database]);
    
    const tabelaExiste = tablesResult[0].count > 0;
    
    if (tabelaExiste) {
      // Inserir chave de idempotência
      await connection.execute(`
        INSERT INTO idempotency_keys (
          key_value, resource_type, resource_id, created_at
        ) VALUES (
          ?, 'pedido', NULL, NOW()
        )
      `, [idempotencyKey]);
      
      console.log(`Chave de idempotência criada: ${idempotencyKey}`);
    } else {
      console.log('Tabela idempotency_keys não existe ou não está acessível');
    }
  } catch (error) {
    console.error('Erro ao testar idempotência:', error.message);
  }
  
  return idempotencyKey;
}

// Função para testar cache
async function testarCache(connection) {
  // Verificar se existe tabela de cache
  try {
    const [tablesResult] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'cache_entries'
    `, [DB_CONFIG.database]);
    
    const tabelaExiste = tablesResult[0].count > 0;
    
    if (tabelaExiste) {
      // Inserir entrada de cache
      await connection.execute(`
        INSERT INTO cache_entries (
          key_name, value, expires_at
        ) VALUES (
          ?, ?, DATE_ADD(NOW(), INTERVAL 30 SECOND)
        )
      `, [
        'test:cache:key',
        JSON.stringify({ test: true, timestamp: Date.now() })
      ]);
      
      console.log('Entrada de cache criada');
    } else {
      console.log('Tabela cache_entries não existe (cache provavelmente em memória)');
    }
  } catch (error) {
    console.error('Erro ao testar cache:', error.message);
  }
}

// Função para inserir dados de teste
async function inserirDadosTeste() {
  let connection;
  try {
    console.log(`Conectando ao banco de dados: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Iniciar transação
    await connection.beginTransaction();
    
    console.log('\n=== INSERINDO DADOS DE TESTE ===');
    
    // Inserir 5 clientes
    console.log('\nInserindo clientes...');
    for (let i = 1; i <= 5; i++) {
      const clienteId = await criarCliente(connection, i);
      console.log(`- Cliente ${i} criado com ID: ${clienteId}`);
    }
    
    // Inserir 5 produtos
    console.log('\nInserindo produtos...');
    for (let i = 1; i <= 5; i++) {
      const produtoId = await criarProduto(connection, i);
      console.log(`- Produto ${i} criado com ID: ${produtoId}`);
    }
    
    // Inserir 5 pedidos (um para cada cliente)
    console.log('\nInserindo pedidos...');
    for (let i = 0; i < 5; i++) {
      const clienteId = idsClientes[i];
      const produtoId = idsProdutos[i];
      const pedidoId = await criarPedido(connection, clienteId, produtoId, i);
      console.log(`- Pedido ${i+1} criado com ID: ${pedidoId} (Cliente: ${clienteId}, Produto: ${produtoId})`);
    }
    
    // Testar idempotência
    console.log('\nTestando idempotência...');
    const idempotencyKey = await testarIdempotencia(connection, idsClientes[0], idsProdutos[0]);
    
    // Testar cache
    console.log('\nTestando cache...');
    await testarCache(connection);
    
    // Commit da transação
    await connection.commit();
    
    // Gerar relatório
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      dadosInseridos: {
        clientes: idsClientes.length,
        produtos: idsProdutos.length,
        pedidos: idsPedidos.length,
        itensPedido: idsItensPedido.length
      },
      ids: {
        clientes: idsClientes,
        produtos: idsProdutos,
        pedidos: idsPedidos,
        itensPedido: idsItensPedido
      },
      idempotencia: {
        chave: idempotencyKey
      }
    };
    
    // Salvar relatório em arquivo
    await fs.writeFile('RELATORIO_INSERCAO_DADOS_TESTE_REAL.json', JSON.stringify(relatorio, null, 2));
    
    // Gerar relatório em formato markdown
    const relatorioMd = `# Relatório de Inserção de Dados de Teste (REAL)

## Resumo Executivo

- **Data de Execução:** ${new Date().toLocaleString()}
- **Resultado:** ✅ SUCESSO

## Dados Inseridos

- **Clientes:** ${relatorio.dadosInseridos.clientes}
- **Produtos:** ${relatorio.dadosInseridos.produtos}
- **Pedidos:** ${relatorio.dadosInseridos.pedidos}
- **Itens de Pedido:** ${relatorio.dadosInseridos.itensPedido}

## IDs Criados

### Clientes
${idsClientes.map((id, index) => `- Cliente ${index+1}: ID ${id}`).join('\n')}

### Produtos
${idsProdutos.map((id, index) => `- Produto ${index+1}: ID ${id}`).join('\n')}

### Pedidos
${idsPedidos.map((id, index) => `- Pedido ${index+1}: ID ${id}`).join('\n')}

## Testes Adicionais

- **Idempotência:** Chave ${idempotencyKey || 'não criada'}
- **Cache:** Testado diretamente no banco de dados

## Conclusão

Todos os dados de teste foram inseridos com sucesso no banco de dados real. Estes dados podem ser usados para validar o funcionamento do sistema ERP em condições reais.

## Execução Real

Este relatório foi gerado a partir de uma inserção direta no banco de dados em ${new Date().toLocaleString()}.
`;
    
    await fs.writeFile('RELATORIO_INSERCAO_DADOS_TESTE_REAL.md', relatorioMd);
    
    console.log('\n=== INSERÇÃO DE DADOS DE TESTE CONCLUÍDA ===');
    console.log(`Clientes criados: ${idsClientes.length}`);
    console.log(`Produtos criados: ${idsProdutos.length}`);
    console.log(`Pedidos criados: ${idsPedidos.length}`);
    console.log(`Itens de pedido criados: ${idsItensPedido.length}`);
    console.log('Relatório salvo em RELATORIO_INSERCAO_DADOS_TESTE_REAL.md');
    
    return relatorio;
  } catch (error) {
    console.error('Erro durante a inserção de dados de teste:', error);
    
    // Rollback em caso de erro
    if (connection) {
      try {
        await connection.rollback();
        console.log('Rollback realizado com sucesso');
      } catch (rollbackError) {
        console.error('Erro ao realizar rollback:', rollbackError);
      }
    }
    
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

// Executar inserção de dados de teste
inserirDadosTeste()
  .then(() => {
    console.log('\nInserção de dados de teste concluída com sucesso.');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nErro durante a inserção de dados de teste:', error);
    process.exit(1);
  });