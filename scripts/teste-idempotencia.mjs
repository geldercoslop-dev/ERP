/**
 * Teste de Idempotência do ERP
 * 
 * Este script testa especificamente a proteção contra duplo clique (idempotência)
 * do sistema ERP, verificando se o mesmo pedido enviado múltiplas vezes
 * é criado apenas uma vez.
 */

import axios from 'axios';
import { performance } from 'perf_hooks';
import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configurações
const API_URL = 'http://localhost:3000/api/trpc';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'vendas',
  password: process.env.DB_PASSWORD || 'vendas123',
  database: process.env.DB_NAME || 'vendas_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Cliente HTTP com timeout adequado
const api = axios.create({
  timeout: 30000, // 30 segundos
  headers: {
    'Content-Type': 'application/json'
  }
});

// Função para fazer login e obter token
async function login() {
  try {
    const response = await api.post(`${API_URL}/auth.login`, {
      json: {
        email: 'admin@example.com',
        password: 'admin123'
      }
    });

    if (response.data?.result?.data?.token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${response.data.result.data.token}`;
      return true;
    }
    
    console.error('Falha ao fazer login: Token não encontrado');
    return false;
  } catch (error) {
    console.error('Erro ao fazer login:', error.message);
    return false;
  }
}

// Função para criar um cliente
async function criarCliente() {
  const telefone = `119${Math.floor(10000000 + Math.random() * 90000000)}`;
  const clienteData = {
    nome: `Cliente Teste Idempotência ${Date.now()}`,
    telefone,
    cidade: 'São Paulo',
    endereco: 'Rua Teste, 123',
    cpfCnpj: `${Math.floor(10000000000 + Math.random() * 90000000000)}`
  };

  try {
    const response = await api.post(`${API_URL}/clientes.create`, {
      json: clienteData
    });

    if (response.data?.result?.data?.id) {
      return response.data.result.data.id;
    }
    
    throw new Error('ID do cliente não encontrado na resposta');
  } catch (error) {
    console.error('Erro ao criar cliente:', error.message);
    throw error;
  }
}

// Função para criar um produto
async function criarProduto() {
  const produtoData = {
    descricao: `Produto Teste Idempotência ${Date.now()}`,
    marca: 'Marca Teste',
    categoria: 'Categoria Teste',
    custo: 50 + Math.random() * 100,
    valorVenda: 100 + Math.random() * 200,
    estoque: 100,
    ativo: true
  };

  try {
    const response = await api.post(`${API_URL}/produtos.create`, {
      json: produtoData
    });

    if (response.data?.result?.data?.id) {
      return response.data.result.data.id;
    }
    
    throw new Error('ID do produto não encontrado na resposta');
  } catch (error) {
    console.error('Erro ao criar produto:', error.message);
    throw error;
  }
}

// Função para verificar pedidos no banco de dados
async function verificarPedidosNoDB(clienteId) {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Verificar pedidos para o cliente
    const [pedidosRows] = await connection.execute(
      'SELECT id, numero, status, createdAt FROM pedidos WHERE clienteId = ?',
      [clienteId]
    );
    
    return pedidosRows;
  } catch (error) {
    console.error('Erro ao verificar pedidos no banco de dados:', error.message);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

// Função para verificar itens de pedido no banco de dados
async function verificarItensPedidoNoDB(pedidoId) {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Verificar itens do pedido
    const [itensRows] = await connection.execute(
      'SELECT id, pedidoId, produtoId, quantidade, valorUnitario FROM itens_pedido WHERE pedidoId = ?',
      [pedidoId]
    );
    
    return itensRows;
  } catch (error) {
    console.error('Erro ao verificar itens de pedido no banco de dados:', error.message);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

// Função para verificar chaves de idempotência
async function verificarChavesIdempotencia() {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Verificar chaves de idempotência
    const [chavesRows] = await connection.execute(
      'SELECT * FROM idempotency_keys ORDER BY createdAt DESC LIMIT 20'
    );
    
    return chavesRows;
  } catch (error) {
    console.error('Erro ao verificar chaves de idempotência:', error.message);
    return [];
  } finally {
    if (connection) await connection.end();
  }
}

// Teste de idempotência (envio do mesmo pedido múltiplas vezes)
async function testeIdempotencia() {
  console.log('\n=== TESTE DE IDEMPOTÊNCIA (PROTEÇÃO CONTRA DUPLO CLIQUE) ===');
  
  try {
    // Criar cliente e produto para usar nos pedidos
    console.log('Criando cliente e produto para o teste...');
    const clienteId = await criarCliente();
    const produtoId = await criarProduto();
    
    console.log(`Cliente criado com ID: ${clienteId}`);
    console.log(`Produto criado com ID: ${produtoId}`);
    
    // Preparar dados do pedido (exatamente iguais para cada requisição)
    const pedidoData = {
      clienteId,
      vendedorId: 1,
      status: 'ABERTO',
      observacao: 'Pedido de teste idempotência',
      formaPagamento: 'DINHEIRO',
      idempotencyKey: `teste-idempotencia-${Date.now()}`, // Chave de idempotência explícita
      itens: [
        {
          produtoId,
          quantidade: 1,
          valorUnitario: 150,
          descricao: 'Item de teste idempotência'
        }
      ]
    };
    
    console.log('Enviando o mesmo pedido 10 vezes sequencialmente...');
    
    // Enviar o mesmo pedido 10 vezes sequencialmente
    const resultados = [];
    for (let i = 0; i < 10; i++) {
      try {
        console.log(`Enviando pedido ${i+1}/10...`);
        const start = performance.now();
        const response = await api.post(`${API_URL}/pedidos.create`, {
          json: pedidoData
        });
        const end = performance.now();
        
        resultados.push({
          tentativa: i+1,
          sucesso: true,
          id: response.data?.result?.data?.id,
          tempo: (end - start).toFixed(2)
        });
        
        console.log(`Pedido ${i+1} processado em ${(end - start).toFixed(2)}ms`);
      } catch (error) {
        resultados.push({
          tentativa: i+1,
          sucesso: false,
          erro: error.message,
          resposta: error.response?.data
        });
        
        console.error(`Erro ao enviar pedido ${i+1}: ${error.message}`);
      }
    }
    
    // Verificar resultados
    const sucessos = resultados.filter(r => r.sucesso).length;
    const falhas = resultados.filter(r => !r.sucesso).length;
    
    console.log(`\nResultados: ${sucessos} sucessos, ${falhas} falhas`);
    
    // Verificar IDs retornados
    const ids = resultados.filter(r => r.sucesso).map(r => r.id);
    const idsUnicos = [...new Set(ids)];
    
    console.log(`IDs únicos retornados: ${idsUnicos.length} (${idsUnicos.join(', ')})`);
    
    if (idsUnicos.length > 1) {
      console.warn('ALERTA: Múltiplos pedidos foram criados! Falha na idempotência!');
    } else if (idsUnicos.length === 1) {
      console.log('SUCESSO: Apenas um pedido foi criado. Idempotência funcionando corretamente.');
    } else {
      console.warn('ALERTA: Nenhum pedido foi criado com sucesso!');
    }
    
    // Verificar pedidos no banco de dados
    console.log('\nVerificando pedidos no banco de dados...');
    const pedidosNoDB = await verificarPedidosNoDB(clienteId);
    
    console.log(`Pedidos encontrados no banco para o cliente ${clienteId}: ${pedidosNoDB.length}`);
    console.log(pedidosNoDB);
    
    // Verificar itens de pedido
    if (pedidosNoDB.length > 0) {
      const pedidoId = pedidosNoDB[0].id;
      console.log(`\nVerificando itens do pedido ${pedidoId}...`);
      const itensNoDB = await verificarItensPedidoNoDB(pedidoId);
      
      console.log(`Itens encontrados: ${itensNoDB.length}`);
      console.log(itensNoDB);
    }
    
    // Verificar chaves de idempotência
    console.log('\nVerificando chaves de idempotência...');
    const chavesIdempotencia = await verificarChavesIdempotencia();
    
    console.log(`Chaves de idempotência recentes: ${chavesIdempotencia.length}`);
    console.log(chavesIdempotencia);
    
    // Gerar relatório
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      clienteId,
      produtoId,
      resultados,
      pedidosNoDB,
      chavesIdempotencia,
      conclusao: {
        pedidosUnicos: idsUnicos.length,
        pedidosNoDB: pedidosNoDB.length,
        idempotenciaFuncionando: idsUnicos.length <= 1 && pedidosNoDB.length <= 1,
        resultado: idsUnicos.length <= 1 && pedidosNoDB.length <= 1 ? 'APROVADO' : 'REPROVADO'
      }
    };
    
    // Salvar relatório em arquivo
    await fs.writeFile('RELATORIO_TESTE_IDEMPOTENCIA.json', JSON.stringify(relatorio, null, 2));
    
    // Gerar relatório em formato markdown
    const relatorioMd = `# Relatório de Teste de Idempotência

## Resumo Executivo

- **Data de Execução:** ${new Date().toLocaleString()}
- **Resultado Final:** ${relatorio.conclusao.resultado}

## Configuração do Teste

- Cliente ID: ${clienteId}
- Produto ID: ${produtoId}
- Tentativas: 10 envios do mesmo pedido

## Resultados

- Sucessos: ${sucessos}
- Falhas: ${falhas}
- IDs únicos retornados: ${idsUnicos.length}
- Pedidos encontrados no banco: ${pedidosNoDB.length}

## Verificação de Idempotência

- Idempotência funcionando: ${relatorio.conclusao.idempotenciaFuncionando ? '✅ SIM' : '❌ NÃO'}

## Conclusão

${relatorio.conclusao.idempotenciaFuncionando 
  ? 'O sistema demonstrou idempotência correta, criando apenas um pedido mesmo com múltiplos envios do mesmo request. A proteção contra duplo clique está funcionando adequadamente.'
  : 'O sistema falhou no teste de idempotência, criando múltiplos pedidos para o mesmo request. A proteção contra duplo clique NÃO está funcionando adequadamente e precisa ser corrigida antes do uso em produção.'}

## Recomendações

${relatorio.conclusao.idempotenciaFuncionando 
  ? '- Manter a implementação atual de idempotência\n- Considerar adicionar testes automatizados para garantir que essa funcionalidade continue funcionando em futuras atualizações'
  : '- Implementar ou corrigir o mecanismo de idempotência para operações críticas\n- Considerar o uso de chaves de idempotência explícitas para todas as operações de escrita\n- Verificar a implementação da tabela idempotency_keys e seu uso no código'}
`;
    
    await fs.writeFile('RELATORIO_TESTE_IDEMPOTENCIA.md', relatorioMd);
    
    console.log('\n=== TESTE DE IDEMPOTÊNCIA FINALIZADO ===');
    console.log(`Resultado: ${relatorio.conclusao.resultado}`);
    console.log('Relatório salvo em RELATORIO_TESTE_IDEMPOTENCIA.md');
    
  } catch (error) {
    console.error('Erro fatal durante o teste:', error);
    
    // Salvar relatório de erro
    await fs.writeFile('ERRO_TESTE_IDEMPOTENCIA.txt', `Erro fatal: ${error.message}\n\nStack: ${error.stack}`);
  }
}

// Função principal
async function main() {
  try {
    // Fazer login
    console.log('Fazendo login...');
    const loggedIn = await login();
    if (!loggedIn) {
      throw new Error('Falha ao fazer login. Abortando teste.');
    }
    
    // Executar teste de idempotência
    await testeIdempotencia();
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

// Executar
main();