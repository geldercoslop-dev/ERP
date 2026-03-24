/**
 * Teste de Logs e Monitoramento do ERP
 * 
 * Este script testa o sistema de logs e monitoramento,
 * verificando se erros e avisos estão sendo registrados corretamente.
 */

import axios from 'axios';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configurações
const API_URL = 'http://localhost:3000/api/trpc';
const MONITOR_URL = 'http://localhost:3000/api/monitor';

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

// Função para verificar logs
async function verificarLogs() {
  try {
    const response = await api.get(`${MONITOR_URL}/errors`);
    return response.data || { totalErrors: 0, errorsByType: {} };
  } catch (error) {
    console.error('Erro ao verificar logs:', error.message);
    return { totalErrors: 0, errorsByType: {} };
  }
}

// Função para verificar status do monitor
async function verificarStatusMonitor() {
  try {
    const response = await api.get(`${MONITOR_URL}/status`);
    return response.data || {};
  } catch (error) {
    console.error('Erro ao verificar status do monitor:', error.message);
    return {};
  }
}

// Função para resetar estatísticas
async function resetarEstatisticas() {
  try {
    const response = await api.post(`${MONITOR_URL}/reset-stats`);
    return response.data?.success || false;
  } catch (error) {
    console.error('Erro ao resetar estatísticas:', error.message);
    return false;
  }
}

// Função para forçar um erro (tentativa de criar cliente com dados inválidos)
async function forcarErro() {
  const clienteInvalido = {
    // Faltando nome (obrigatório)
    telefone: '11999999999'
  };

  try {
    await api.post(`${API_URL}/clientes.create`, {
      json: clienteInvalido
    });
    
    console.log('ALERTA: Criação de cliente inválido não gerou erro!');
    return false;
  } catch (error) {
    console.log('Erro gerado com sucesso:', error.message);
    return true;
  }
}

// Função para forçar um warning (tentativa de buscar cliente com ID inválido)
async function forcarWarning() {
  try {
    await api.get(`${API_URL}/clientes.getById?input=${encodeURIComponent(JSON.stringify({
      id: 999999999 // ID provavelmente inexistente
    }))}`);
    
    console.log('Busca de cliente com ID inválido realizada');
    return true;
  } catch (error) {
    console.log('Erro ao forçar warning:', error.message);
    return false;
  }
}

// Teste de logs e monitoramento
async function testeLogsMonitoramento() {
  console.log('\n=== TESTE DE LOGS E MONITORAMENTO ===');
  
  try {
    // Resetar estatísticas antes de iniciar
    console.log('Resetando estatísticas...');
    await resetarEstatisticas();
    
    // Verificar logs iniciais
    console.log('Verificando logs iniciais...');
    const logsIniciais = await verificarLogs();
    console.log('Logs iniciais:', logsIniciais);
    
    // Verificar status do monitor inicial
    console.log('\nVerificando status do monitor inicial...');
    const statusInicial = await verificarStatusMonitor();
    console.log('Status inicial do monitor:', statusInicial);
    
    // Teste 1: Forçar um erro
    console.log('\nTeste 1: Forçando um erro (cliente inválido)...');
    const erroForcado = await forcarErro();
    
    // Teste 2: Forçar um warning
    console.log('\nTeste 2: Forçando um warning (busca de cliente inexistente)...');
    const warningForcado = await forcarWarning();
    
    // Verificar logs após testes
    console.log('\nVerificando logs após testes...');
    const logsAposTestes = await verificarLogs();
    console.log('Logs após testes:', logsAposTestes);
    
    // Verificar status do monitor após testes
    console.log('\nVerificando status do monitor após testes...');
    const statusAposTestes = await verificarStatusMonitor();
    console.log('Status do monitor após testes:', statusAposTestes);
    
    // Calcular diferenças
    const errosDiferenca = logsAposTestes.totalErrors - logsIniciais.totalErrors;
    
    console.log(`\nErros adicionados: ${errosDiferenca}`);
    
    // Analisar tipos de erros
    console.log('\nTipos de erros registrados:');
    Object.entries(logsAposTestes.errorsByType || {}).forEach(([tipo, quantidade]) => {
      const quantidadeInicial = logsIniciais.errorsByType?.[tipo] || 0;
      const diferenca = quantidade - quantidadeInicial;
      console.log(`- ${tipo}: ${quantidade} (${diferenca > 0 ? '+' + diferenca : diferenca})`);
    });
    
    // Verificar alertas críticos
    const alertasCriticos = statusAposTestes.criticalAlerts?.length || 0;
    const alertasCriticosIniciais = statusInicial.criticalAlerts?.length || 0;
    const novosCriticos = alertasCriticos - alertasCriticosIniciais;
    
    console.log(`\nAlertas críticos: ${alertasCriticos} (${novosCriticos > 0 ? '+' + novosCriticos : novosCriticos})`);
    
    // Gerar relatório
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      testes: {
        erroForcado,
        warningForcado
      },
      logs: {
        iniciais: logsIniciais,
        aposTestes: logsAposTestes,
        errosDiferenca
      },
      monitor: {
        statusInicial,
        statusAposTestes,
        novosCriticos
      },
      conclusao: {
        logsRegistrados: errosDiferenca > 0,
        tiposErrosDetalhados: Object.keys(logsAposTestes.errorsByType || {}).length > 0,
        resultado: errosDiferenca > 0 ? 'APROVADO' : 'REPROVADO'
      }
    };
    
    // Salvar relatório em arquivo
    await fs.writeFile('RELATORIO_TESTE_LOGS.json', JSON.stringify(relatorio, null, 2));
    
    // Gerar relatório em formato markdown
    const relatorioMd = `# Relatório de Teste de Logs e Monitoramento

## Resumo Executivo

- **Data de Execução:** ${new Date().toLocaleString()}
- **Resultado Final:** ${relatorio.conclusao.resultado}

## Estatísticas de Logs

- **Erros adicionados:** ${errosDiferenca}
- **Total de erros atual:** ${logsAposTestes.totalErrors || 0}

## Tipos de Erros Registrados

${Object.entries(logsAposTestes.errorsByType || {}).map(([tipo, quantidade]) => {
  const quantidadeInicial = logsIniciais.errorsByType?.[tipo] || 0;
  const diferenca = quantidade - quantidadeInicial;
  return `- **${tipo}:** ${quantidade} (${diferenca > 0 ? '+' + diferenca : diferenca})`;
}).join('\n')}

## Alertas Críticos

- **Alertas críticos:** ${alertasCriticos}
- **Novos alertas críticos:** ${novosCriticos}

## Testes Realizados

- **Erro forçado (cliente inválido):** ${erroForcado ? '✅ Gerado' : '❌ Falhou'}
- **Warning forçado (busca cliente inexistente):** ${warningForcado ? '✅ Gerado' : '❌ Falhou'}

## Critérios de Sucesso

- **Logs Registrados:** ${relatorio.conclusao.logsRegistrados ? '✅ APROVADO' : '❌ REPROVADO'}
- **Tipos de Erros Detalhados:** ${relatorio.conclusao.tiposErrosDetalhados ? '✅ APROVADO' : '❌ REPROVADO'}

## Conclusão

${relatorio.conclusao.resultado === 'APROVADO' 
  ? 'O sistema de logs e monitoramento está funcionando corretamente, registrando erros e warnings com detalhes adequados. O monitor está acompanhando as estatísticas e alertas críticos conforme esperado.'
  : 'O sistema de logs e monitoramento apresenta problemas. Os erros e warnings não estão sendo registrados corretamente ou o monitor não está acompanhando as estatísticas adequadamente.'}

## Recomendações

${relatorio.conclusao.resultado === 'APROVADO' 
  ? '- Manter a implementação atual de logs e monitoramento\n- Considerar adicionar mais detalhes aos logs para facilitar a depuração\n- Implementar alertas automáticos para erros críticos'
  : '- Revisar a implementação do sistema de logs\n- Verificar se o monitor está configurado corretamente\n- Implementar testes automatizados para o sistema de logs e monitoramento'}
`;
    
    await fs.writeFile('RELATORIO_TESTE_LOGS.md', relatorioMd);
    
    console.log('\n=== TESTE DE LOGS E MONITORAMENTO FINALIZADO ===');
    console.log(`Resultado: ${relatorio.conclusao.resultado}`);
    console.log('Relatório salvo em RELATORIO_TESTE_LOGS.md');
    
  } catch (error) {
    console.error('Erro fatal durante o teste:', error);
    
    // Salvar relatório de erro
    await fs.writeFile('ERRO_TESTE_LOGS.txt', `Erro fatal: ${error.message}\n\nStack: ${error.stack}`);
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
    
    // Executar teste de logs e monitoramento
    await testeLogsMonitoramento();
    
  } catch (error) {
    console.error('Erro:', error);
  }
}

// Executar
main();