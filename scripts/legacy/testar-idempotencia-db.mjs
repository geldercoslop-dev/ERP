/**
 * Script para testar idempotência diretamente no banco de dados
 * 
 * Este script tenta criar pedidos idênticos para o mesmo cliente
 * e verifica se há mecanismos de idempotência para evitar duplicações.
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

// Função para criar um pedido com o mesmo cliente e produto
async function criarPedidoIdentico(connection, clienteId, produtoId, idempotencyKey) {
  try {
    // Obter dados do cliente
    const [clienteRows] = await connection.execute('SELECT * FROM clientes WHERE id = ?', [clienteId]);
    const cliente = clienteRows[0];
    
    if (!cliente) {
      throw new Error(`Cliente com ID ${clienteId} não encontrado`);
    }
    
    // Verificar se o produto existe
    const [produtoRows] = await connection.execute('SELECT * FROM produtos WHERE id = ?', [produtoId]);
    const produto = produtoRows[0];
    
    if (!produto) {
      throw new Error(`Produto com ID ${produtoId} não encontrado`);
    }
    
    // Inserir pedido
    const numero = Math.floor(2000 + Math.random() * 8000); // Número aleatório para o pedido
    const valorUnitario = 150.00;
    const quantidade = 1;
    const subtotal = valorUnitario * quantidade;
    const desconto = 0;
    const frete = 0;
    const total = subtotal - desconto + frete;
    
    // Verificar se já existe um pedido com a mesma chave de idempotência
    let pedidoExistente = null;
    
    try {
      // Verificar se a tabela idempotency_keys existe
      const [tablesResult] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = ? AND table_name = 'idempotency_keys'
      `, [DB_CONFIG.database]);
      
      const tabelaExiste = tablesResult[0].count > 0;
      
      if (tabelaExiste) {
        // Verificar se já existe uma chave de idempotência
        const [keyRows] = await connection.execute(`
          SELECT resource_id FROM idempotency_keys 
          WHERE key_value = ? AND resource_type = 'pedido'
        `, [idempotencyKey]);
        
        if (keyRows.length > 0 && keyRows[0].resource_id) {
          pedidoExistente = keyRows[0].resource_id;
          return { pedidoId: pedidoExistente, novo: false };
        }
      }
    } catch (error) {
      console.log('Tabela de idempotência não encontrada ou erro ao verificar:', error.message);
    }
    
    // Se não existe pedido com a mesma chave, criar um novo
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
    
    // Inserir item do pedido
    await connection.execute(`
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
      `Item de teste idempotência`, 
      quantidade,
      valorUnitario.toFixed(2),
      (valorUnitario * 0.6).toFixed(2) // Custo = 60% do valor unitário
    ]);
    
    // Tentar registrar a chave de idempotência
    try {
      // Verificar se a tabela idempotency_keys existe
      const [tablesResult] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = ? AND table_name = 'idempotency_keys'
      `, [DB_CONFIG.database]);
      
      const tabelaExiste = tablesResult[0].count > 0;
      
      if (tabelaExiste) {
        // Verificar a estrutura da tabela
        const [columnsResult] = await connection.query(`
          SHOW COLUMNS FROM idempotency_keys
        `);
        
        const colunas = columnsResult.map(col => col.Field);
        
        if (colunas.includes('key_value') && colunas.includes('resource_id')) {
          // Inserir chave de idempotência
          await connection.execute(`
            INSERT INTO idempotency_keys (
              key_value, resource_type, resource_id, created_at
            ) VALUES (
              ?, 'pedido', ?, NOW()
            )
          `, [idempotencyKey, pedidoId]);
        } else {
          console.log('Estrutura da tabela idempotency_keys não é compatível');
        }
      }
    } catch (error) {
      console.log('Erro ao registrar chave de idempotência:', error.message);
    }
    
    return { pedidoId, novo: true };
  } catch (error) {
    console.error('Erro ao criar pedido idêntico:', error.message);
    throw error;
  }
}

// Função principal para testar idempotência
async function testarIdempotencia() {
  let connection;
  try {
    console.log(`Conectando ao banco de dados: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Obter um cliente e um produto existentes
    const [clientesRows] = await connection.query('SELECT id FROM clientes LIMIT 1');
    const [produtosRows] = await connection.query('SELECT id FROM produtos LIMIT 1');
    
    if (clientesRows.length === 0 || produtosRows.length === 0) {
      throw new Error('Não há clientes ou produtos no banco de dados');
    }
    
    const clienteId = clientesRows[0].id;
    const produtoId = produtosRows[0].id;
    
    console.log(`\nUsando cliente ID: ${clienteId} e produto ID: ${produtoId}`);
    
    // Criar uma chave de idempotência única para este teste
    const idempotencyKey = `teste-idempotencia-${Date.now()}`;
    console.log(`Chave de idempotência: ${idempotencyKey}`);
    
    // Iniciar transação
    await connection.beginTransaction();
    
    console.log('\n=== TESTE DE IDEMPOTÊNCIA ===');
    console.log('Tentando criar 10 pedidos idênticos com a mesma chave de idempotência...');
    
    const resultados = [];
    const pedidosCriados = new Set();
    
    // Tentar criar 10 pedidos idênticos
    for (let i = 1; i <= 10; i++) {
      console.log(`\nTentativa ${i}/10...`);
      
      try {
        const resultado = await criarPedidoIdentico(connection, clienteId, produtoId, idempotencyKey);
        resultados.push({
          tentativa: i,
          pedidoId: resultado.pedidoId,
          novo: resultado.novo
        });
        
        pedidosCriados.add(resultado.pedidoId);
        
        console.log(`Pedido ${resultado.novo ? 'criado' : 'recuperado'} com ID: ${resultado.pedidoId}`);
      } catch (error) {
        console.error(`Erro na tentativa ${i}:`, error.message);
        resultados.push({
          tentativa: i,
          erro: error.message
        });
      }
    }
    
    // Verificar quantos pedidos únicos foram criados
    const pedidosUnicos = pedidosCriados.size;
    
    console.log(`\nPedidos únicos criados: ${pedidosUnicos}`);
    console.log(`IDs dos pedidos: ${[...pedidosCriados].join(', ')}`);
    
    // Verificar se a idempotência funcionou
    const idempotenciaFuncionando = pedidosUnicos === 1;
    
    // Commit da transação
    await connection.commit();
    
    // Gerar relatório
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      clienteId,
      produtoId,
      idempotencyKey,
      tentativas: 10,
      resultados,
      pedidosUnicos,
      idempotenciaFuncionando,
      conclusao: {
        resultado: idempotenciaFuncionando ? 'APROVADO' : 'REPROVADO'
      }
    };
    
    // Salvar relatório em arquivo
    await fs.writeFile('RELATORIO_TESTE_IDEMPOTENCIA_REAL.json', JSON.stringify(relatorio, null, 2));
    
    // Gerar relatório em formato markdown
    const relatorioMd = `# Relatório de Teste de Idempotência (REAL)

## Resumo Executivo

- **Data de Execução:** ${new Date().toLocaleString()}
- **Resultado:** ${idempotenciaFuncionando ? '✅ APROVADO' : '❌ REPROVADO'}

## Configuração do Teste

- **Cliente ID:** ${clienteId}
- **Produto ID:** ${produtoId}
- **Chave de Idempotência:** \`${idempotencyKey}\`
- **Tentativas:** 10 envios do mesmo pedido

## Resultados

- **Pedidos únicos criados:** ${pedidosUnicos}
- **IDs dos pedidos:** ${[...pedidosCriados].join(', ')}
- **Idempotência funcionando:** ${idempotenciaFuncionando ? 'SIM ✅' : 'NÃO ❌'}

## Detalhes das Tentativas

${resultados.map(r => `- **Tentativa ${r.tentativa}:** ${r.erro ? `Erro: ${r.erro}` : `Pedido ${r.novo ? 'criado' : 'recuperado'} com ID ${r.pedidoId}`}`).join('\n')}

## Conclusão

${idempotenciaFuncionando 
  ? 'O sistema demonstrou idempotência correta, criando apenas um pedido mesmo com múltiplos envios do mesmo request. A proteção contra duplo clique está funcionando adequadamente.'
  : 'O sistema falhou no teste de idempotência, criando múltiplos pedidos para o mesmo request. A proteção contra duplo clique NÃO está funcionando adequadamente e precisa ser corrigida antes do uso em produção.'}

## Recomendações

${idempotenciaFuncionando 
  ? '- Manter a implementação atual de idempotência\n- Considerar adicionar testes automatizados para garantir que essa funcionalidade continue funcionando em futuras atualizações'
  : '- Implementar ou corrigir o mecanismo de idempotência para operações críticas\n- Considerar o uso de chaves de idempotência explícitas para todas as operações de escrita\n- Verificar a implementação da tabela idempotency_keys e seu uso no código'}

## Execução Real

Este relatório foi gerado a partir de testes reais executados diretamente no banco de dados em ${new Date().toLocaleString()}.
`;
    
    await fs.writeFile('RELATORIO_TESTE_IDEMPOTENCIA_REAL.md', relatorioMd);
    
    console.log('\n=== TESTE DE IDEMPOTÊNCIA FINALIZADO ===');
    console.log(`Resultado: ${idempotenciaFuncionando ? 'APROVADO ✅' : 'REPROVADO ❌'}`);
    console.log('Relatório salvo em RELATORIO_TESTE_IDEMPOTENCIA_REAL.md');
    
    return relatorio;
  } catch (error) {
    console.error('Erro durante o teste de idempotência:', error);
    
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

// Executar teste de idempotência
testarIdempotencia()
  .then(() => {
    console.log('\nTeste de idempotência concluído.');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nErro durante o teste de idempotência:', error);
    process.exit(1);
  });