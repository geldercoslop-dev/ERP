/**
 * Teste de Carga do ERP - Simulação de Uso Real
 * 
 * Este script executa testes de carga para validar o comportamento do sistema
 * em condições de uso real intenso, incluindo:
 * 
 * 1. Fluxo completo: cliente → produto → pedido (20x)
 * 2. Teste de duplo clique (mesmo request 10x simultâneo)
 * 3. Teste paralelo (produtos.list + clientes.list + pedidos.create)
 * 4. Validação de cache e logs
 */

const axios = require('axios');
const { performance } = require('perf_hooks');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const mysql = require('mysql2/promise');

// Configurações
const API_URL = 'http://localhost:3000/api/trpc';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vendas_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Estatísticas globais
const stats = {
  clientesCriados: 0,
  produtosCriados: 0,
  pedidosCriados: 0,
  tempoTotal: 0,
  erros: [],
  cacheHits: 0,
  cacheMisses: 0,
  duplicacoes: 0,
  inconsistencias: 0,
  crashs: 0
};

// Armazenar IDs criados para validação
const idsClientes = [];
const idsProdutos = [];
const idsPedidos = [];

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
async function criarCliente(index) {
  const telefone = `119${Math.floor(10000000 + Math.random() * 90000000)}`;
  const clienteData = {
    nome: `Cliente Teste ${index} ${uuidv4().substring(0, 8)}`,
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
      stats.clientesCriados++;
      idsClientes.push(response.data.result.data.id);
      return response.data.result.data.id;
    }
    
    throw new Error('ID do cliente não encontrado na resposta');
  } catch (error) {
    stats.erros.push(`Erro ao criar cliente: ${error.message}`);
    throw error;
  }
}

// Função para criar um produto
async function criarProduto(index) {
  const produtoData = {
    descricao: `Produto Teste ${index} ${uuidv4().substring(0, 8)}`,
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
      stats.produtosCriados++;
      idsProdutos.push(response.data.result.data.id);
      return response.data.result.data.id;
    }
    
    throw new Error('ID do produto não encontrado na resposta');
  } catch (error) {
    stats.erros.push(`Erro ao criar produto: ${error.message}`);
    throw error;
  }
}

// Função para criar um pedido
async function criarPedido(clienteId, produtoId, index) {
  const pedidoData = {
    clienteId,
    vendedorId: 1, // Assumindo que existe um vendedor com ID 1
    status: 'ABERTO',
    observacao: `Pedido de teste ${index}`,
    formaPagamento: 'DINHEIRO',
    itens: [
      {
        produtoId,
        quantidade: 1,
        valorUnitario: 100 + Math.random() * 200,
        descricao: `Item de teste ${index}`
      }
    ]
  };

  try {
    const response = await api.post(`${API_URL}/pedidos.create`, {
      json: pedidoData
    });

    if (response.data?.result?.data?.id) {
      stats.pedidosCriados++;
      idsPedidos.push(response.data.result.data.id);
      return response.data.result.data.id;
    }
    
    throw new Error('ID do pedido não encontrado na resposta');
  } catch (error) {
    stats.erros.push(`Erro ao criar pedido: ${error.message}`);
    throw error;
  }
}

// Função para listar clientes
async function listarClientes() {
  try {
    const response = await api.get(`${API_URL}/clientes.list?input=${encodeURIComponent(JSON.stringify({
      limit: 50,
      offset: 0
    }))}`);
    
    return response.data?.result?.data?.items || [];
  } catch (error) {
    stats.erros.push(`Erro ao listar clientes: ${error.message}`);
    throw error;
  }
}

// Função para listar produtos
async function listarProdutos() {
  try {
    const response = await api.get(`${API_URL}/produtos.list?input=${encodeURIComponent(JSON.stringify({
      limit: 50,
      offset: 0
    }))}`);
    
    return response.data?.result?.data?.items || [];
  } catch (error) {
    stats.erros.push(`Erro ao listar produtos: ${error.message}`);
    throw error;
  }
}

// Função para verificar registros no banco de dados
async function verificarDB() {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Verificar clientes criados
    const [clientesRows] = await connection.execute(
      'SELECT id FROM clientes WHERE id IN (?)',
      [idsClientes.length > 0 ? idsClientes : [0]]
    );
    
    // Verificar produtos criados
    const [produtosRows] = await connection.execute(
      'SELECT id FROM produtos WHERE id IN (?)',
      [idsProdutos.length > 0 ? idsProdutos : [0]]
    );
    
    // Verificar pedidos criados
    const [pedidosRows] = await connection.execute(
      'SELECT id FROM pedidos WHERE id IN (?)',
      [idsPedidos.length > 0 ? idsPedidos : [0]]
    );
    
    return {
      clientesEncontrados: clientesRows.length,
      produtosEncontrados: produtosRows.length,
      pedidosEncontrados: pedidosRows.length,
      clientesFaltando: idsClientes.length - clientesRows.length,
      produtosFaltando: idsProdutos.length - produtosRows.length,
      pedidosFaltando: idsPedidos.length - pedidosRows.length
    };
  } catch (error) {
    stats.erros.push(`Erro ao verificar banco de dados: ${error.message}`);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

// Função para verificar duplicações no banco de dados
async function verificarDuplicacoes() {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    
    // Verificar pedidos duplicados (mesmo cliente e mesma data)
    const [duplicacoesRows] = await connection.execute(`
      SELECT clienteId, DATE(createdAt) as data, COUNT(*) as count
      FROM pedidos
      WHERE id IN (?)
      GROUP BY clienteId, DATE(createdAt)
      HAVING COUNT(*) > 1
    `, [idsPedidos.length > 0 ? idsPedidos : [0]]);
    
    return {
      pedidosDuplicados: duplicacoesRows.length,
      detalhes: duplicacoesRows
    };
  } catch (error) {
    stats.erros.push(`Erro ao verificar duplicações: ${error.message}`);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

// Função para verificar estatísticas de cache
async function verificarCache() {
  try {
    const response = await api.get(`${API_URL}/cache.stats`);
    return response.data || { hits: 0, misses: 0 };
  } catch (error) {
    stats.erros.push(`Erro ao verificar cache: ${error.message}`);
    return { hits: 0, misses: 0 };
  }
}

// Função para verificar logs
async function verificarLogs() {
  try {
    const response = await api.get(`${API_URL}/monitor/errors`);
    return response.data || { totalErrors: 0, errorsByType: {} };
  } catch (error) {
    stats.erros.push(`Erro ao verificar logs: ${error.message}`);
    return { totalErrors: 0, errorsByType: {} };
  }
}

// Teste 1: Fluxo completo (20x)
async function testeFluxoCompleto() {
  console.log('\n=== TESTE 1: FLUXO COMPLETO (20x) ===');
  const start = performance.now();
  
  try {
    for (let i = 1; i <= 20; i++) {
      console.log(`\nExecutando fluxo ${i}/20...`);
      
      // Criar cliente
      console.log('Criando cliente...');
      const clienteId = await criarCliente(i);
      console.log(`Cliente criado com ID: ${clienteId}`);
      
      // Criar produto
      console.log('Criando produto...');
      const produtoId = await criarProduto(i);
      console.log(`Produto criado com ID: ${produtoId}`);
      
      // Criar pedido
      console.log('Criando pedido...');
      const pedidoId = await criarPedido(clienteId, produtoId, i);
      console.log(`Pedido criado com ID: ${pedidoId}`);
    }
    
    const end = performance.now();
    stats.tempoTotal += (end - start);
    
    console.log('\nTeste de fluxo completo finalizado com sucesso!');
    console.log(`Tempo total: ${((end - start) / 1000).toFixed(2)} segundos`);
  } catch (error) {
    console.error('Erro no teste de fluxo completo:', error.message);
    stats.crashs++;
  }
}

// Teste 2: Teste de duplo clique (mesmo request 10x simultâneo)
async function testeDuploClique() {
  console.log('\n=== TESTE 2: DUPLO CLIQUE (10x SIMULTÂNEO) ===');
  
  try {
    // Criar cliente e produto para usar nos pedidos
    const clienteId = await criarCliente(100);
    const produtoId = await criarProduto(100);
    
    // Preparar dados do pedido
    const pedidoData = {
      clienteId,
      vendedorId: 1,
      status: 'ABERTO',
      observacao: 'Pedido de teste duplo clique',
      formaPagamento: 'DINHEIRO',
      itens: [
        {
          produtoId,
          quantidade: 1,
          valorUnitario: 150,
          descricao: 'Item de teste duplo clique'
        }
      ]
    };
    
    console.log('Enviando 10 pedidos idênticos simultaneamente...');
    
    // Enviar 10 pedidos idênticos simultaneamente
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(api.post(`${API_URL}/pedidos.create`, {
        json: pedidoData
      }));
    }
    
    const results = await Promise.allSettled(requests);
    
    // Analisar resultados
    const sucessos = results.filter(r => r.status === 'fulfilled').length;
    const falhas = results.filter(r => r.status === 'rejected').length;
    
    // Coletar IDs criados
    const pedidosIds = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value.data?.result?.data?.id)
      .filter(id => id);
    
    pedidosIds.forEach(id => {
      if (id) idsPedidos.push(id);
    });
    
    console.log(`Resultados: ${sucessos} sucessos, ${falhas} falhas`);
    console.log(`IDs de pedidos criados: ${pedidosIds.join(', ')}`);
    
    if (pedidosIds.length > 1) {
      stats.duplicacoes += (pedidosIds.length - 1);
      console.warn(`ALERTA: ${pedidosIds.length - 1} duplicações detectadas!`);
    }
    
  } catch (error) {
    console.error('Erro no teste de duplo clique:', error.message);
    stats.crashs++;
  }
}

// Teste 3: Teste paralelo (produtos.list + clientes.list + pedidos.create)
async function testeParalelo() {
  console.log('\n=== TESTE 3: OPERAÇÕES PARALELAS ===');
  
  try {
    console.log('Executando operações em paralelo...');
    
    // Criar cliente e produto para o pedido
    const clienteId = await criarCliente(200);
    const produtoId = await criarProduto(200);
    
    // Preparar dados do pedido
    const pedidoData = {
      clienteId,
      vendedorId: 1,
      status: 'ABERTO',
      observacao: 'Pedido de teste paralelo',
      formaPagamento: 'DINHEIRO',
      itens: [
        {
          produtoId,
          quantidade: 1,
          valorUnitario: 200,
          descricao: 'Item de teste paralelo'
        }
      ]
    };
    
    // Executar operações em paralelo
    const [produtosResult, clientesResult, pedidoResult] = await Promise.all([
      listarProdutos(),
      listarClientes(),
      api.post(`${API_URL}/pedidos.create`, {
        json: pedidoData
      })
    ]);
    
    console.log(`Produtos listados: ${produtosResult.length}`);
    console.log(`Clientes listados: ${clientesResult.length}`);
    
    const pedidoId = pedidoResult.data?.result?.data?.id;
    if (pedidoId) {
      idsPedidos.push(pedidoId);
      console.log(`Pedido criado com ID: ${pedidoId}`);
    } else {
      throw new Error('Falha ao criar pedido em paralelo');
    }
    
  } catch (error) {
    console.error('Erro no teste paralelo:', error.message);
    stats.crashs++;
  }
}

// Teste 4: Validação de cache
async function testeCache() {
  console.log('\n=== TESTE 4: VALIDAÇÃO DE CACHE ===');
  
  try {
    // Primeira chamada (miss)
    console.log('Primeira chamada para produtos.list (deve ser miss)...');
    await listarProdutos();
    
    // Segunda chamada (hit)
    console.log('Segunda chamada para produtos.list (deve ser hit)...');
    await listarProdutos();
    
    // Verificar estatísticas de cache
    const cacheStats = await verificarCache();
    console.log('Estatísticas de cache:', cacheStats);
    
    if (cacheStats.memory) {
      stats.cacheHits = cacheStats.memory.hits || 0;
      stats.cacheMisses = cacheStats.memory.misses || 0;
      
      console.log(`Cache hits: ${stats.cacheHits}`);
      console.log(`Cache misses: ${stats.cacheMisses}`);
      console.log(`Taxa de acerto: ${cacheStats.memory.hitRatePercentage || 0}%`);
    }
  } catch (error) {
    console.error('Erro no teste de cache:', error.message);
    stats.crashs++;
  }
}

// Teste 5: Validação de logs
async function testeLogs() {
  console.log('\n=== TESTE 5: VALIDAÇÃO DE LOGS ===');
  
  try {
    const logs = await verificarLogs();
    console.log('Logs do sistema:');
    console.log(`Total de erros: ${logs.totalErrors || 0}`);
    console.log('Erros por tipo:', logs.errorsByType || {});
    
    // Verificar se há erros críticos
    const errosCriticos = logs.errorsByType?.CRITICAL || 0;
    if (errosCriticos > 0) {
      console.warn(`ALERTA: ${errosCriticos} erros críticos detectados!`);
    }
  } catch (error) {
    console.error('Erro ao verificar logs:', error.message);
  }
}

// Função principal para executar todos os testes
async function executarTestes() {
  console.log('=== INICIANDO TESTES DE CARGA DO ERP ===');
  const startGlobal = performance.now();
  
  try {
    // Fazer login
    console.log('\nFazendo login...');
    const loggedIn = await login();
    if (!loggedIn) {
      throw new Error('Falha ao fazer login. Abortando testes.');
    }
    
    // Executar testes
    await testeFluxoCompleto();
    await testeDuploClique();
    await testeParalelo();
    await testeCache();
    await testeLogs();
    
    // Validar banco de dados
    console.log('\n=== VALIDAÇÃO DO BANCO DE DADOS ===');
    const dbResults = await verificarDB();
    console.log('Resultados da validação do banco de dados:');
    console.log(`Clientes encontrados: ${dbResults.clientesEncontrados}/${idsClientes.length}`);
    console.log(`Produtos encontrados: ${dbResults.produtosEncontrados}/${idsProdutos.length}`);
    console.log(`Pedidos encontrados: ${dbResults.pedidosEncontrados}/${idsPedidos.length}`);
    
    if (dbResults.clientesFaltando > 0 || dbResults.produtosFaltando > 0 || dbResults.pedidosFaltando > 0) {
      console.warn('ALERTA: Alguns registros não foram encontrados no banco de dados!');
      stats.inconsistencias += (dbResults.clientesFaltando + dbResults.produtosFaltando + dbResults.pedidosFaltando);
    }
    
    // Verificar duplicações
    console.log('\n=== VERIFICAÇÃO DE DUPLICAÇÕES ===');
    const duplicacoes = await verificarDuplicacoes();
    console.log(`Pedidos duplicados: ${duplicacoes.pedidosDuplicados}`);
    if (duplicacoes.pedidosDuplicados > 0) {
      console.warn('ALERTA: Pedidos duplicados detectados!');
      console.log('Detalhes das duplicações:', duplicacoes.detalhes);
    }
    
    // Gerar relatório final
    const endGlobal = performance.now();
    const tempoTotalGlobal = (endGlobal - startGlobal) / 1000;
    
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      tempoTotalSegundos: tempoTotalGlobal.toFixed(2),
      estatisticas: {
        clientesCriados: stats.clientesCriados,
        produtosCriados: stats.produtosCriados,
        pedidosCriados: stats.pedidosCriados,
        cacheHits: stats.cacheHits,
        cacheMisses: stats.cacheMisses,
        duplicacoes: stats.duplicacoes,
        inconsistencias: stats.inconsistencias,
        crashs: stats.crashs,
        totalErros: stats.erros.length
      },
      validacaoDB: dbResults,
      duplicacoes: duplicacoes,
      erros: stats.erros,
      conclusao: {
        semDuplicacao: stats.duplicacoes === 0,
        semInconsistencia: stats.inconsistencias === 0,
        semCrash: stats.crashs === 0,
        cacheEfetivo: stats.cacheHits > 0,
        resultado: stats.duplicacoes === 0 && stats.inconsistencias === 0 && stats.crashs === 0 ? 'APROVADO' : 'REPROVADO'
      }
    };
    
    // Salvar relatório em arquivo
    await fs.writeFile('RELATORIO_TESTE_CARGA.json', JSON.stringify(relatorio, null, 2));
    
    // Gerar relatório em formato markdown
    const relatorioMd = `# Relatório de Teste de Carga do ERP

## Resumo Executivo

- **Data de Execução:** ${new Date().toLocaleString()}
- **Tempo Total:** ${tempoTotalGlobal.toFixed(2)} segundos
- **Resultado Final:** ${relatorio.conclusao.resultado}

## Estatísticas

- Clientes Criados: ${stats.clientesCriados}
- Produtos Criados: ${stats.produtosCriados}
- Pedidos Criados: ${stats.pedidosCriados}
- Cache Hits: ${stats.cacheHits}
- Cache Misses: ${stats.cacheMisses}
- Duplicações: ${stats.duplicacoes}
- Inconsistências: ${stats.inconsistencias}
- Crashs: ${stats.crashs}
- Total de Erros: ${stats.erros.length}

## Validação do Banco de Dados

- Clientes Encontrados: ${dbResults.clientesEncontrados}/${idsClientes.length}
- Produtos Encontrados: ${dbResults.produtosEncontrados}/${idsProdutos.length}
- Pedidos Encontrados: ${dbResults.pedidosEncontrados}/${idsPedidos.length}

## Verificação de Duplicações

- Pedidos Duplicados: ${duplicacoes.pedidosDuplicados}

## Critérios de Sucesso

- Sem Duplicação: ${relatorio.conclusao.semDuplicacao ? '✅ APROVADO' : '❌ REPROVADO'}
- Sem Inconsistência: ${relatorio.conclusao.semInconsistencia ? '✅ APROVADO' : '❌ REPROVADO'}
- Sem Crash: ${relatorio.conclusao.semCrash ? '✅ APROVADO' : '❌ REPROVADO'}
- Cache Efetivo: ${relatorio.conclusao.cacheEfetivo ? '✅ APROVADO' : '❌ REPROVADO'}

## Falhas Encontradas

${stats.erros.length > 0 ? stats.erros.map(e => `- ${e}`).join('\n') : '- Nenhuma falha encontrada'}

## Comportamento Real

O sistema foi submetido a:
- 20 fluxos completos (cliente → produto → pedido)
- 10 requisições simultâneas do mesmo pedido
- Operações paralelas de listagem e criação
- Validação de cache e logs

## Risco Final

${relatorio.conclusao.resultado === 'APROVADO' 
  ? 'O sistema demonstrou robustez e capacidade de lidar com uso intenso sem apresentar falhas significativas. O risco para uso em produção é considerado BAIXO.'
  : 'O sistema apresentou falhas que precisam ser corrigidas antes do uso em produção. O risco para uso em produção é considerado ALTO.'}
`;
    
    await fs.writeFile('RELATORIO_TESTE_CARGA.md', relatorioMd);
    
    console.log('\n=== TESTES FINALIZADOS ===');
    console.log(`Tempo total: ${tempoTotalGlobal.toFixed(2)} segundos`);
    console.log(`Resultado: ${relatorio.conclusao.resultado}`);
    console.log('Relatório salvo em RELATORIO_TESTE_CARGA.md');
    
  } catch (error) {
    console.error('Erro fatal durante os testes:', error);
    
    // Salvar relatório de erro
    await fs.writeFile('ERRO_TESTE_CARGA.txt', `Erro fatal: ${error.message}\n\nStack: ${error.stack}`);
  }
}

// Executar testes
executarTestes().catch(console.error);