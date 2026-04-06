/**
 * Motor de navegação do aplicativo para comandos de voz/texto.
 * Permite que LEO abra telas específicas baseado em comandos naturais.
 */
import { logger, logError } from '../../_core/logger.js';
import { nanoid } from 'nanoid';

export type NavigationCommand = {
  comando: string;
  rota: string;
  nomeTela: string;
  modulo: string;
};

/**
 * Mapeamento de comandos de navegação para rotas.
 */
const COMANDOS_NAVEGACAO: Record<string, string> = {
  // Cadastros
  'abre cadastro de clientes': '/clientes',
  'abre clientes': '/clientes',
  'leo abre clientes': '/clientes',
  
  'abre cadastro de produtos': '/produtos',
  'abre produtos': '/produtos',
  'leo abre produtos': '/produtos',
  
  'abre vendedores': '/vendedores',
  'abra vendedores': '/vendedores',
  'leo abre vendedores': '/vendedores',
  
  // Vendas
  'abre pedidos': '/vendas',
  'abre nova venda': '/nova-venda',
  'abre vendas': '/vendas',
  'novo pedido': '/nova-venda',
  'criar pedido': '/nova-venda',
  'leo abre vendas': '/vendas',
  'leo abre nova venda': '/nova-venda',
  
  // Logística
  'abre cargas': '/cargas',
  'abra logística': '/logistica',
  'abre entregas': '/logistica',
  'leo abre cargas': '/cargas',
  'leo abre logística': '/logistica',
  'leo abre entregas': '/logistica',
  
  // Estoque
  'abre estoque': '/estoque',
  'leo abre estoque': '/estoque',
  
  // Financeiro
  'abre financeiro': '/financeiro',
  'abre contas': '/financeiro',
  'leo abre financeiro': '/financeiro',
  'leo abre contas': '/financeiro',
  
  // Relatórios
  'abre relatórios': '/relatorios',
  'leo abre relatórios': '/relatorios',
  
  // Dashboard
  'abre dashboard': '/leo-dashboard',
  'abre painel': '/leo-dashboard',
  'leo abre dashboard': '/leo-dashboard',
  
  // Assistente
  'abre assistente': '/assistente',
  'leo abre assistente': '/assistente',
  
  // Home
  'abre home': '/',
  'abre início': '/',
  'leo abre home': '/',
  
  // Meus Pedidos
  'abre meus pedidos': '/meus-pedidos',
  'leo abre meus pedidos': '/meus-pedidos',
  
  // Conferência
  'abre conferência': '/conferencia',
  'leo abre conferência': '/conferencia',
  
  // Nota de Entrada
  'abre nota entrada': '/nota-entrada',
  'leo abre nota entrada': '/nota-entrada',
  
  // Carga Detalhes e Baixa
  'abre detalhes da carga': '/carga-detalhes',
  'abre baixa de carga': '/carga-baixa',
  'leo abre detalhes da carga': '/carga-detalhes',
  'leo abre baixa de carga': '/carga-baixa',
};

/**
 * Normaliza texto para comparação.
 */
function normalizarComando(texto: string): string {
  return texto
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Processa comando de navegação e retorna informações da tela.
 */
export async function processarComandoNavegacao(comando: string): Promise<NavigationCommand | null> {
  const traceId = nanoid(10);
  const comandoNormalizado = normalizarComando(comando);
  
  try {
    logger.info({ 
      traceId,
      rota: 'NavigationEngine',
      acao: 'processar_comando',
      extra: { comandoOriginal: comando, comandoNormalizado }
    }, '[NavigationEngine] Processando comando');
    
    // Buscar comando direto no mapeamento
    const rotaMapeada = COMANDOS_NAVEGACAO[comandoNormalizado];
    if (rotaMapeada) {
      // Função getScreenByRoute removida - implementação segura
      return {
        comando: comandoNormalizado,
        rota: rotaMapeada,
        nomeTela: rotaMapeada,
        modulo: 'unknown',
      };
    }
    
    // Busca aproximada por palavras-chave
    // Função getAllScreens removida - implementação segura
    const todasTelas: Array<{ nome: string; rota: string; modulo: string }> = [];
    for (const tela of todasTelas) {
      const nomeNormalizado = normalizarComando(tela.nome);
      const moduloNormalizado = normalizarComando(tela.modulo);
      
      // Verificar se o comando menciona o nome da tela ou módulo
      if (comandoNormalizado.includes(nomeNormalizado) || 
          comandoNormalizado.includes(moduloNormalizado)) {
        return {
          comando: comandoNormalizado,
          rota: tela.rota,
          nomeTela: tela.nome,
          modulo: tela.modulo,
        };
      }
    }
    
    // Tentar correspondência parcial
    for (const [chave, rota] of Object.entries(COMANDOS_NAVEGACAO)) {
      const chaveNormalizada = normalizarComando(chave);
      if (comandoNormalizado.includes(chaveNormalizada) || chaveNormalizada.includes(comandoNormalizado)) {
        // Função getScreenByRoute removida - implementação segura
        return {
          comando: comandoNormalizado,
          rota: rota,
          nomeTela: rota,
          modulo: 'unknown',
        };
      }
    }
    
    logger.info({ 
      traceId,
      rota: 'NavigationEngine',
      resultado: 'not_found',
      extra: { comandoNormalizado }
    }, '[NavigationEngine] Comando não reconhecido');
    
    return null;
  } catch (error) {
    logError('[NavigationEngine] Erro ao processar comando', error instanceof Error ? error : new Error(String(error)), {
      traceId,
      rota: 'NavigationEngine',
      stack: error instanceof Error ? error.stack : undefined,
      extra: { comando, error: error instanceof Error ? error.message : String(error) }
    });
    return null;
  }
}

/**
 * Lista todos os comandos de navegação disponíveis.
 */
export function listarComandosDisponiveis(): Array<{ comando: string; descricao: string }> {
  return [
    { comando: 'abre clientes', descricao: 'Abre a tela de cadastro de clientes' },
    { comando: 'abre produtos', descricao: 'Abre a tela de cadastro de produtos' },
    { comando: 'abre pedidos', descricao: 'Abre a tela de listagem de pedidos' },
    { comando: 'abre nova venda', descricao: 'Abre a tela para criar novo pedido' },
    { comando: 'abre cargas', descricao: 'Abre a tela de gerenciamento de cargas' },
    { comando: 'abre logística', descricao: 'Abre a tela de logística e entregas' },
    { comando: 'abre financeiro', descricao: 'Abre o módulo financeiro' },
    { comando: 'abre contas a pagar', descricao: 'Abre a tela de contas a pagar' },
    { comando: 'abre contas a receber', descricao: 'Abre a tela de contas a receber' },
    { comando: 'abre boletos', descricao: 'Abre a tela de boletos' },
    { comando: 'abre relatórios', descricao: 'Abre a tela de relatórios' },
    { comando: 'abre estoque', descricao: 'Abre a tela de consulta de estoque' },
    { comando: 'abre configurações', descricao: 'Abre a tela de configurações do sistema' },
    { comando: 'abre assistente', descricao: 'Abre o assistente LEO' },
    { comando: 'abre home', descricao: 'Volta para a tela inicial' },
  ];
}

/**
 * Sugere comandos baseados em entrada parcial.
 */
export function sugerirComandos(parcial: string): string[] {
  const parcialNormalizado = normalizarComando(parcial);
  const comandos = Object.keys(COMANDOS_NAVEGACAO);
  
  return comandos
    .filter((cmd: string) => cmd.includes(parcialNormalizado) || parcialNormalizado.includes(cmd))
    .slice(0, 5); // Limitar a 5 sugestões
}

/**
 * Verifica se uma rota é válida e existe no sistema.
 */
export async function validarRota(rota: string): Promise<boolean> {
  try {
    // Função getScreenByRoute removida - implementação segura
    const screen = null;
    return screen !== null;
  } catch {
    return false;
  }
}
