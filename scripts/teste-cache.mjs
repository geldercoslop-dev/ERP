/**
 * Teste de Cache do ERP
 * 
 * Este script testa especificamente o sistema de cache,
 * verificando se o cache está funcionando corretamente e
 * não retornando dados inconsistentes.
 */

import axios from 'axios';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configurações
const API_URL = 'http://localhost:3000/api/trpc';

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

// Função para listar clientes
async function listarClientes() {
  try {
    const start = performance.now();
    const response = await api.get(`${API_URL}/clientes.list?input=${encodeURIComponent(JSON.stringify({
      limit: 50,
      offset: 0
    }))}`);
    const end = performance.now();
    
    return {
      items: response.data?.result?.data?.items || [],
      tempo: end - start
    };
  } catch (error) {
    console.error('Erro ao listar clientes:', error.message);
    throw error;
  }
}

// Função para listar produtos
async function listarProdutos() {
  try {
    const start = performance.now();
    const response = await api.get(`${API_URL}/produtos.list?input=${encodeURIComponent(JSON.stringify({
      limit: 50,
      offset: 0
    }))}`);
    const end = performance.now();
    
    return {
      items: response.data?.result?.data?.items || [],
      tempo: end - start
    };
  } catch (error) {
    console.error('Erro ao listar produtos:', error.message);
    throw error;
  }
}

// Função para criar um cliente
async function criarCliente() {
  const telefone = `119${Math.floor(10000000 + Math.random() * 90000000)}`;
  const clienteData = {
    nome: `Cliente Teste Cache ${Date.now()}`,
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

// Função para verificar estatísticas de cache
async function verificarCache() {
  try {
    const response = await api.get(`${API_URL}/cache/stats`);
    return response.data || { hits: 0, misses: 0 };
  } catch (error) {
    console.error('Erro ao verificar cache:', error.message);
    return { hits: 0, misses: 0 };
  }
}

// Função para limpar o cache
async function limparCache() {
  try {
    const response = await api.post(`${API_URL}/cache/clear`);
    return response.data?.success || false;
  } catch (error) {
    console.error('Erro ao limpar cache:', error.message);
    return false;
  }
}

// Teste de cache
async function testeCache() {
  console.log('\n=== TESTE DE CACHE ===');
  
  try {
    // Limpar cache antes de iniciar
    console.log('Limpando cache...');
    await limparCache();
    
    // Verificar estatísticas iniciais
    console.log('Verificando estatísticas iniciais do cache...');
    const statsInicial = await verificarCache();
    console.log('Estatísticas iniciais:', statsInicial);
    
    // Teste 1: Primeira chamada (miss)
    console.log('\nTeste 1: Primeira chamada para clientes.list (deve ser miss)...');
    const clientes1 = await listarClientes();
    console.log(`Clientes retornados: ${clientes1.items.length}`);
    console.log(`Tempo de resposta: ${clientes1.tempo.toFixed(2)}ms`);
    
    // Teste 2: Segunda chamada (hit)
    console.log('\nTeste 2: Segunda chamada para clientes.list (deve ser hit)...');
    const clientes2 = await listarClientes();
    console.log(`Clientes retornados: ${clientes2.items.length}`);
    console.log(`Tempo de resposta: ${clientes2.tempo.toFixed(2)}ms`);
    
    // Teste 3: Primeira chamada para produtos (miss)
    console.log('\nTeste 3: Primeira chamada para produtos.list (deve ser miss)...');
    const produtos1 = await listarProdutos();
    console.log(`Produtos retornados: ${produtos1.items.length}`);
    console.log(`Tempo de resposta: ${produtos1.tempo.toFixed(2)}ms`);
    
    // Teste 4: Segunda chamada para produtos (hit)
    console.log('\nTeste 4: Segunda chamada para produtos.list (deve ser hit)...');
    const produtos2 = await listarProdutos();
    console.log(`Produtos retornados: ${produtos2.items.length}`);
    console.log(`Tempo de resposta: ${produtos2.tempo.toFixed(2)}ms`);
    
    // Verificar estatísticas após chamadas
    console.log('\nVerificando estatísticas do cache após chamadas...');
    const statsAposChamadas = await verificarCache();
    console.log('Estatísticas após chamadas:', statsAposChamadas);
    
    // Calcular diferenças
    const hitsDiferenca = (statsAposChamadas.memory?.hits || 0) - (statsInicial.memory?.hits || 0);
    const missesDiferenca = (statsAposChamadas.memory?.misses || 0) - (statsInicial.memory?.misses || 0);
    
    console.log(`Hits adicionados: ${hitsDiferenca}`);
    console.log(`Misses adicionados: ${missesDiferenca}`);
    
    // Teste 5: Criar cliente (deve invalidar cache)
    console.log('\nTeste 5: Criando cliente (deve invalidar cache de clientes)...');
    const clienteId = await criarCliente();
    console.log(`Cliente criado com ID: ${clienteId}`);
    
    // Teste 6: Listar clientes após criação (deve ser miss novamente)
    console.log('\nTeste 6: Listar clientes após criação (deve ser miss novamente)...');
    const clientes3 = await listarClientes();
    console.log(`Clientes retornados: ${clientes3.items.length}`);
    console.log(`Tempo de resposta: ${clientes3.tempo.toFixed(2)}ms`);
    
    // Verificar se o novo cliente está na lista
    const novoClienteNaLista = clientes3.items.some(c => c.id === clienteId);
    console.log(`Novo cliente encontrado na lista: ${novoClienteNaLista ? 'SIM' : 'NÃO'}`);
    
    if (!novoClienteNaLista) {
      console.warn('ALERTA: Novo cliente não encontrado na lista! Possível problema de invalidação de cache.');
    }
    
    // Verificar estatísticas finais
    console.log('\nVerificando estatísticas finais do cache...');
    const statsFinal = await verificarCache();
    console.log('Estatísticas finais:', statsFinal);
    
    // Calcular melhorias de desempenho
    const melhoriaClientes = clientes1.tempo / clientes2.tempo;
    const melhoriaProdutos = produtos1.tempo / produtos2.tempo;
    
    console.log(`\nMelhoria de desempenho em clientes.list: ${melhoriaClientes.toFixed(2)}x mais rápido`);
    console.log(`Melhoria de desempenho em produtos.list: ${melhoriaProdutos.toFixed(2)}x mais rápido`);
    
    // Gerar relatório
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      testes: {
        clientesListPrimeiraChamada: {
          itens: clientes1.items.length,
          tempo: clientes1.tempo.toFixed(2)
        },
        clientesListSegundaChamada: {
          itens: clientes2.items.length,
          tempo: clientes2.tempo.toFixed(2)
        },
        produtosListPrimeiraChamada: {
          itens: produtos1.items.length,
          tempo: produtos1.tempo.toFixed(2)
        },
        produtosListSegundaChamada: {
          itens: produtos2.items.length,
          tempo: produtos2.tempo.toFixed(2)
        },
        clientesListAposCriacao: {
          itens: clientes3.items.length,
          tempo: clientes3.tempo.toFixed(2),
          novoClienteNaLista
        }
      },
      estatisticas: {
        inicial: statsInicial,
        aposChamadas: statsAposChamadas,
        final: statsFinal,
        hitsDiferenca,
        missesDiferenca
      },
      desempenho: {
        melhoriaClientes,
        melhoriaProdutos
      },
      conclusao: {
        cacheEfetivo: hitsDiferenca > 0,
        invalidacaoCorreta: novoClienteNaLista,
        resultado: hitsDiferenca > 0 && novoClienteNaLista ? 'APROVADO' : 'REPROVADO'
      }
    };
    
    // Salvar relatório em arquivo
    await fs.writeFile('RELATORIO_TESTE_CACHE.json', JSON.stringify(relatorio, null, 2));
    
    // Gerar relatório em formato markdown
    const relatorioMd = `# Relatório de Teste de Cache

## Resumo Executivo

- **Data de Execução:** ${new Date().toLocaleString()}
- **Resultado Final:** ${relatorio.conclusao.resultado}

## Estatísticas de Cache

- **Hits adicionados:** ${hitsDiferenca}
- **Misses adicionados:** ${missesDiferenca}
- **Taxa de acerto final:** ${statsFinal.memory?.hitRatePercentage || 0}%

## Desempenho

- **Melhoria em clientes.list:** ${melhoriaClientes.toFixed(2)}x mais rápido
- **Melhoria em produtos.list:** ${melhoriaProdutos.toFixed(2)}x mais rápido

## Testes de Invalidação

- **Novo cliente encontrado após criação:** ${novoClienteNaLista ? '✅ SIM' : '❌ NÃO'}

## Tempos de Resposta (ms)

| Operação | Primeira Chamada (Miss) | Segunda Chamada (Hit) | Melhoria |
|----------|-------------------------|----------------------|----------|
| clientes.list | ${clientes1.tempo.toFixed(2)} | ${clientes2.tempo.toFixed(2)} | ${melhoriaClientes.toFixed(2)}x |
| produtos.list | ${produtos1.tempo.toFixed(2)} | ${produtos2.tempo.toFixed(2)} | ${melhoriaProdutos.toFixed(2)}x |

## Critérios de Sucesso

- **Cache Efetivo:** ${relatorio.conclusao.cacheEfetivo ? '✅ APROVADO' : '❌ REPROVADO'}
- **Invalidação Correta:** ${relatorio.conclusao.invalidacaoCorreta ? '✅ APROVADO' : '❌ REPROVADO'}

## Conclusão

${relatorio.conclusao.resultado === 'APROVADO' 
  ? 'O sistema de cache está funcionando corretamente, com hits ocorrendo nas segundas chamadas e invalidação adequada após operações de escrita. O desempenho apresenta melhoria significativa com o uso do cache.'
  : 'O sistema de cache apresenta problemas que precisam ser corrigidos. Verifique a invalidação de cache após operações de escrita e confirme se o cache está sendo utilizado corretamente.'}

## Recomendações

${relatorio.conclusao.resultado === 'APROVADO' 
  ? '- Manter a implementação atual de cache\n- Considerar ajustes nos tempos de TTL com base no uso real\n- Monitorar a taxa de acerto em produção'
  : '- Revisar a implementação de invalidação de cache\n- Verificar se as operações de escrita estão invalidando corretamente o cache\n- Revisar a integração entre o cache e o sistema de proteção'}
`;
    
    await fs.writeFile('RELATORIO_TESTE_CACHE.md', relatorioMd);
    
    console.log('\n=== TESTE DE CACHE FINALIZADO ===');
    console.log(`Resultado: ${relatorio.conclusao.resultado}`);
    console.log('Relatório salvo em RELATORIO_TESTE_CACHE.md');
    
  } catch (error) {
    console.error('Erro fatal durante o teste:', error);
    
    // Salvar relatório de erro
    await fs.writeFile('ERRO_TESTE_CACHE.txt', `Erro fatal: ${error.message}\n\nStack: ${error.stack}`);
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
    
    // Executar teste de cache
    await testeCache();
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

// Executar
main();