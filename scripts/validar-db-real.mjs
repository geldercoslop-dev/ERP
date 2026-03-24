/**
 * Script para validar o banco de dados real
 * 
 * Este script verifica a estrutura e consistência do banco de dados
 * sem depender do servidor ERP estar em execução.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs/promises';

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

// Função para verificar a estrutura do banco de dados
async function verificarEstruturaBD() {
  let connection;
  try {
    console.log(`Conectando ao banco de dados: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Verificar tabelas principais
    console.log('\nVerificando tabelas principais:');
    
    // Clientes
    const [clientesRows] = await connection.query('SELECT COUNT(*) AS total FROM clientes');
    console.log(`- Tabela clientes: ${clientesRows[0].total} registros`);
    
    // Produtos
    const [produtosRows] = await connection.query('SELECT COUNT(*) AS total FROM produtos');
    console.log(`- Tabela produtos: ${produtosRows[0].total} registros`);
    
    // Pedidos
    const [pedidosRows] = await connection.query('SELECT COUNT(*) AS total FROM pedidos');
    console.log(`- Tabela pedidos: ${pedidosRows[0].total} registros`);
    
    // Itens de pedido
    const [itensPedidoRows] = await connection.query('SELECT COUNT(*) AS total FROM itens_pedido');
    console.log(`- Tabela itens_pedido: ${itensPedidoRows[0].total} registros`);
    
    // Verificar chaves de idempotência
    try {
      const [idempotencyRows] = await connection.query('SELECT COUNT(*) AS total FROM idempotency_keys');
      console.log(`- Tabela idempotency_keys: ${idempotencyRows[0].total} registros`);
    } catch (error) {
      console.warn('- Tabela idempotency_keys não encontrada ou erro ao acessar');
    }
    
    // Verificar consistência de dados
    console.log('\nVerificando consistência de dados:');
    
    // Verificar pedidos sem itens
    const [pedidosSemItensRows] = await connection.query(`
      SELECT p.id, p.numero
      FROM pedidos p
      LEFT JOIN itens_pedido ip ON p.id = ip.pedidoId
      WHERE ip.id IS NULL
    `);
    console.log(`- Pedidos sem itens: ${pedidosSemItensRows.length}`);
    if (pedidosSemItensRows.length > 0) {
      console.log('  IDs dos pedidos sem itens:', pedidosSemItensRows.map(p => p.id).join(', '));
    }
    
    // Verificar itens de pedido sem produto
    const [itensSemProdutoRows] = await connection.query(`
      SELECT ip.id, ip.pedidoId
      FROM itens_pedido ip
      LEFT JOIN produtos p ON ip.produtoId = p.id
      WHERE p.id IS NULL AND ip.produtoId IS NOT NULL
    `);
    console.log(`- Itens de pedido sem produto: ${itensSemProdutoRows.length}`);
    
    // Verificar pedidos sem cliente
    const [pedidosSemClienteRows] = await connection.query(`
      SELECT p.id, p.numero
      FROM pedidos p
      LEFT JOIN clientes c ON p.clienteId = c.id
      WHERE c.id IS NULL AND p.clienteId IS NOT NULL
    `);
    console.log(`- Pedidos sem cliente: ${pedidosSemClienteRows.length}`);
    
    // Verificar duplicações de pedidos (mesmo cliente, mesma data)
    const [pedidosDuplicadosRows] = await connection.query(`
      SELECT clienteId, DATE(createdAt) as data, COUNT(*) as count
      FROM pedidos
      GROUP BY clienteId, DATE(createdAt)
      HAVING COUNT(*) > 1
    `);
    console.log(`- Possíveis duplicações de pedidos: ${pedidosDuplicadosRows.length}`);
    
    // Verificar cache (se existir tabela)
    try {
      const [cacheRows] = await connection.query('SELECT COUNT(*) AS total FROM cache_entries');
      console.log(`- Tabela cache_entries: ${cacheRows[0].total} registros`);
    } catch (error) {
      console.log('- Tabela cache_entries não encontrada (cache provavelmente em memória)');
    }
    
    // Verificar logs (se existir tabela)
    try {
      const [logsRows] = await connection.query('SELECT COUNT(*) AS total FROM system_logs');
      console.log(`- Tabela system_logs: ${logsRows[0].total} registros`);
    } catch (error) {
      console.log('- Tabela system_logs não encontrada (logs provavelmente em arquivo)');
    }
    
    // Gerar relatório
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      estrutura: {
        clientes: clientesRows[0].total,
        produtos: produtosRows[0].total,
        pedidos: pedidosRows[0].total,
        itensPedido: itensPedidoRows[0].total
      },
      consistencia: {
        pedidosSemItens: pedidosSemItensRows.length,
        itensSemProduto: itensSemProdutoRows.length,
        pedidosSemCliente: pedidosSemClienteRows.length,
        possiveisDuplicacoes: pedidosDuplicadosRows.length
      },
      conclusao: {
        semInconsistencia: pedidosSemItensRows.length === 0 && 
                          itensSemProdutoRows.length === 0 && 
                          pedidosSemClienteRows.length === 0,
        semDuplicacao: pedidosDuplicadosRows.length === 0,
        resultado: pedidosSemItensRows.length === 0 && 
                  itensSemProdutoRows.length === 0 && 
                  pedidosSemClienteRows.length === 0 && 
                  pedidosDuplicadosRows.length === 0 ? 'APROVADO' : 'REPROVADO'
      }
    };
    
    // Salvar relatório em arquivo
    await fs.writeFile('RELATORIO_VALIDACAO_DB_REAL.json', JSON.stringify(relatorio, null, 2));
    
    // Gerar relatório em formato markdown
    const relatorioMd = `# Relatório de Validação do Banco de Dados Real

## Resumo Executivo

- **Data de Execução:** ${new Date().toLocaleString()}
- **Resultado Final:** ${relatorio.conclusao.resultado}

## Estrutura do Banco de Dados

- **Clientes:** ${relatorio.estrutura.clientes} registros
- **Produtos:** ${relatorio.estrutura.produtos} registros
- **Pedidos:** ${relatorio.estrutura.pedidos} registros
- **Itens de Pedido:** ${relatorio.estrutura.itensPedido} registros

## Consistência de Dados

- **Pedidos sem itens:** ${relatorio.consistencia.pedidosSemItens}
- **Itens sem produto:** ${relatorio.consistencia.itensSemProduto}
- **Pedidos sem cliente:** ${relatorio.consistencia.pedidosSemCliente}
- **Possíveis duplicações:** ${relatorio.consistencia.possiveisDuplicacoes}

## Critérios de Sucesso

- **Sem Inconsistência:** ${relatorio.conclusao.semInconsistencia ? '✅ APROVADO' : '❌ REPROVADO'}
- **Sem Duplicação:** ${relatorio.conclusao.semDuplicacao ? '✅ APROVADO' : '❌ REPROVADO'}

## Conclusão

${relatorio.conclusao.resultado === 'APROVADO' 
  ? 'O banco de dados está em um estado consistente, sem problemas de integridade referencial ou duplicações.'
  : 'O banco de dados apresenta problemas de consistência que precisam ser corrigidos antes do uso em produção.'}

## Recomendações

${relatorio.conclusao.resultado === 'APROVADO' 
  ? '- Manter backups regulares do banco de dados\n- Implementar verificações periódicas de consistência\n- Monitorar o crescimento das tabelas'
  : '- Corrigir os problemas de consistência identificados\n- Implementar restrições de integridade referencial\n- Revisar o mecanismo de idempotência para evitar duplicações'}

## Execução Real

Este relatório foi gerado a partir de uma validação direta no banco de dados em ${new Date().toLocaleString()}.
`;
    
    await fs.writeFile('RELATORIO_VALIDACAO_DB_REAL.md', relatorioMd);
    
    console.log('\n=== VALIDAÇÃO DO BANCO DE DADOS CONCLUÍDA ===');
    console.log(`Resultado: ${relatorio.conclusao.resultado}`);
    console.log('Relatório salvo em RELATORIO_VALIDACAO_DB_REAL.md');
    
    return relatorio;
  } catch (error) {
    console.error('Erro durante a validação do banco de dados:', error);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

// Executar validação
verificarEstruturaBD()
  .then(() => {
    console.log('\nValidação concluída com sucesso.');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nErro durante a validação:', error);
    process.exit(1);
  });