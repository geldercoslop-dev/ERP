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

// Função para criar um cliente
async function criarCliente(connection, index) {
  const telefone = `119${Math.floor(10000000 + Math.random() * 90000000)}`;
  const nome = `Cliente Teste ${index} ${uuidv4().substring(0, 8)}`;
  
  const [result] = await connection.execute(`
    INSERT INTO clientes (
      tenantId, nome, telefone, telefoneNorm, nomeNorm, sobrenomeNorm,
      cidade, uf, createdAt, updatedAt
    ) VALUES (
      1, ?, ?, ?, ?, ?,
      'São Paulo', 'SP', NOW(), NOW()
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
      tenantId, descricao, marca, categoria, custo, valorVenda,
      estoque, ativo, createdAt, updatedAt
    ) VALUES (
      1, ?, 'Marca Teste', 'Categoria Teste', ?, ?,
      100, 1, NOW(), NOW()
    )
  `, [descricao, valorCusto.toString(), valorVenda.toString()]);
  
  const produtoId = result.insertId;
  idsProdutos.push(produtoId);
  
  return produtoId;
}

// Função para criar um pedido
async function criarPedido(connection, clienteId, produtoId, index) {
  // Inserir pedido
  const [resultPedido] = await connection.execute(`
    INSERT INTO pedidos (
      tenantId, clienteId, vendedorId, numero, status,
      observacao, formaPagamento, total, createdAt, updatedAt
    ) VALUES (
      1, ?, 1, ?, 'ABERTO',
      ?, 'DINHEIRO', ?, NOW(), NOW()
    )
  `, [clienteId, index + 1000, `Pedido de teste ${index}`, '150.00']);
  
  const pedidoId = resultPedido.insertId;
  idsPedidos.push(pedidoId);
  
  // Inserir item do pedido
  await connection.execute(`
    INSERT INTO itens_pedido (
      pedidoId, produtoId, quantidade, valorUnitario, descricao
    ) VALUES (
      ?, ?, 1, 150.00, ?
    )
  `, [pedidoId, produtoId, `Item de teste ${index}`]);
  
  return pedidoId;
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
    
    // Commit da transação
    await connection.commit();
    
    // Gerar relatório
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      dadosInseridos: {
        clientes: idsClientes.length,
        produtos: idsProdutos.length,
        pedidos: idsPedidos.length
      },
      ids: {
        clientes: idsClientes,
        produtos: idsProdutos,
        pedidos: idsPedidos
      }
    };
    
    // Salvar relatório em arquivo
    await fs.writeFile('RELATORIO_INSERCAO_DADOS_TESTE.json', JSON.stringify(relatorio, null, 2));
    
    // Gerar relatório em formato markdown
    const relatorioMd = `# Relatório de Inserção de Dados de Teste

## Resumo Executivo

- **Data de Execução:** ${new Date().toLocaleString()}
- **Resultado:** ✅ SUCESSO

## Dados Inseridos

- **Clientes:** ${relatorio.dadosInseridos.clientes}
- **Produtos:** ${relatorio.dadosInseridos.produtos}
- **Pedidos:** ${relatorio.dadosInseridos.pedidos}

## IDs Criados

### Clientes
${idsClientes.map((id, index) => `- Cliente ${index+1}: ID ${id}`).join('\n')}

### Produtos
${idsProdutos.map((id, index) => `- Produto ${index+1}: ID ${id}`).join('\n')}

### Pedidos
${idsPedidos.map((id, index) => `- Pedido ${index+1}: ID ${id}`).join('\n')}

## Conclusão

Todos os dados de teste foram inseridos com sucesso no banco de dados. Estes dados podem ser usados para testes de funcionalidade e desempenho do sistema.

## Execução Real

Este relatório foi gerado a partir de uma inserção direta no banco de dados em ${new Date().toLocaleString()}.
`;
    
    await fs.writeFile('RELATORIO_INSERCAO_DADOS_TESTE.md', relatorioMd);
    
    console.log('\n=== INSERÇÃO DE DADOS DE TESTE CONCLUÍDA ===');
    console.log(`Clientes criados: ${idsClientes.length}`);
    console.log(`Produtos criados: ${idsProdutos.length}`);
    console.log(`Pedidos criados: ${idsPedidos.length}`);
    console.log('Relatório salvo em RELATORIO_INSERCAO_DADOS_TESTE.md');
    
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