/**
 * Serviço de Auto Discovery para registrar telas do aplicativo automaticamente.
 * Varre o diretório client/src/pages e extrai informações das telas.
 */
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import * as db from '../leo-erp-data.facade.js';
import { logInfo, logError } from '../../_core/logger.js';
import { eq, and } from 'drizzle-orm';

// Tipo principal de resultado do discovery
type AppDiscoveryResult = {
  name: string;
  description: string;
  confidence: number;
  category?: string;
};

type ScreenInfo = {
  nome: string;
  rota: string;
  descricao?: string;
  modulo: string;
  acoes?: string[];
};

/**
 * Extrai informações de um arquivo de página TypeScript/React.
 */
function extractScreenInfo(filePath: string, fileName: string): ScreenInfo | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Extrair nome do componente (export default function)
    const componentMatch = content.match(/export\s+default\s+function\s+(\w+)/);
    const nome = componentMatch ? componentMatch[1]! : fileName.replace('.tsx', '').replace('.ts', '') || 'Unknown';
    
    // Gerar rota baseada no nome do arquivo
    const rotaBase = fileName.replace('.tsx', '').replace('.ts', '') || 'unknown';
    const rota = `/${rotaBase.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    
    // Tentar extrair comentários ou descrições
    const descricaoMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n/);
    const descricao = descricaoMatch ? descricaoMatch[1] : undefined;
    
    // Determinar módulo baseado no nome ou localização
    let modulo = 'Geral';
    const nomeLower = nome.toLowerCase();
    
    if (nomeLower.includes('pedido') || nomeLower.includes('venda')) {
      modulo = 'Vendas';
    } else if (nomeLower.includes('cliente')) {
      modulo = 'Clientes';
    } else if (nomeLower.includes('produto') || nomeLower.includes('estoque')) {
      modulo = 'Produtos';
    } else if (nomeLower.includes('financeiro') || nomeLower.includes('boleto') || nomeLower.includes('conta')) {
      modulo = 'Financeiro';
    } else if (nomeLower.includes('carga') || nomeLower.includes('logistica')) {
      modulo = 'Logística';
    } else if (nomeLower.includes('relatorio')) {
      modulo = 'Relatórios';
    } else if (nomeLower.includes('config') || nomeLower.includes('admin')) {
      modulo = 'Configuração';
    }
    
    // Extrair possíveis ações (funções exportadas) - compatível ES2020
    const acoes: string[] = [];
    const functionRegex = /(?:const|function)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
    let match: RegExpExecArray | null;
    while ((match = functionRegex.exec(content)) !== null) {
      const funcName = match[1];
      if (funcName && (funcName.startsWith('handle') || funcName.startsWith('on') || funcName.includes('Action'))) {
        acoes.push(funcName);
      }
    }
    
    return {
      nome,
      rota,
      descricao,
      modulo,
      acoes: acoes.length > 0 ? acoes : undefined
    };
  } catch (error: unknown) {
    console.warn(`[AppDiscovery] Erro ao analisar arquivo ${filePath}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Varre o diretório de pages em busca de telas.
 */
async function scanPagesDirectory(): Promise<ScreenInfo[]> {
  const pagesDir = path.join(process.cwd(), 'client', 'src', 'pages');
  const screens: ScreenInfo[] = [];
  
  if (!fs.existsSync(pagesDir)) {
    console.warn(`[AppDiscovery] Diretório pages não encontrado: ${pagesDir}`);
    return screens;
  }
  
  const files = fs.readdirSync(pagesDir, { withFileTypes: true });
  
  for (const file of files) {
    if (file.isFile() && (file.name.endsWith('.tsx') || file.name.endsWith('.ts'))) {
      const filePath = path.join(pagesDir, file.name);
      const screenInfo = extractScreenInfo(filePath, file.name);
      
      if (screenInfo) {
        screens.push(screenInfo);
      }
    }
  }
  
  return screens;
}

/**
 * Registra uma tela no banco de dados.
 * Stub: tabela appScreens não existe no schema atual; registro desativado.
 */
async function registerScreen(_screen: ScreenInfo): Promise<void> {
  return;
}

/**
 * Executa o discovery completo: scan e registro.
 */
export async function runDiscovery(): Promise<{ registered: number; updated: number; errors: number }> {
  const traceId = nanoid(10);
  let registered = 0;
  let updated = 0;
  let errors = 0;
  
  try {
    logInfo('[AppDiscovery] Iniciando scan de telas', {
      traceId,
      rota: 'AppDiscovery',
      acao: 'run_discovery'
    });
    
    const screens = await scanPagesDirectory();
    
    for (const screen of screens) {
      try {
        const dbConnection = await db.getDb();
        if (!dbConnection) continue;
        
        await registerScreen(screen);
        registered++;
      } catch (error: unknown) {
        errors++;
        console.error(`[AppDiscovery] Erro ao processar tela ${screen.rota}:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    logInfo('[AppDiscovery] Discovery concluído', {
      traceId,
      rota: 'AppDiscovery',
      resultado: 'success',
      extra: { totalScreens: screens.length, registered, updated, errors }
    });
    
    return { registered, updated, errors };
  } catch (error: unknown) {
    logError('[AppDiscovery] Erro geral no discovery', error instanceof Error ? error : new Error(String(error)), {
      traceId,
      rota: 'AppDiscovery',
      stack: error instanceof Error ? error.stack : undefined,
      extra: { error: error instanceof Error ? error.message : String(error) }
    });
    
    return { registered: 0, updated: 0, errors: 1 };
  }
}

/**
 * Busca todas as telas registradas.
 */
export async function getAllScreens(): Promise<ScreenInfo[]> {
  try {
    // Stub: appScreens não existe no schema; retorna lista vazia
    const screens: Array<{
      nome: string;
      rota: string;
      descricao?: string | null;
      modulo: string;
      acoes?: string | null;
    }> = [];
    return screens.map((screen): ScreenInfo => ({
      nome: screen.nome,
      rota: screen.rota,
      descricao: screen.descricao || undefined,
      modulo: screen.modulo,
      acoes: screen.acoes ? JSON.parse(screen.acoes) : undefined
    }));
  } catch (error: unknown) {
    logError('[AppDiscovery] Erro ao buscar telas', error instanceof Error ? error : new Error(String(error)), {
      rota: 'AppDiscovery',
      stack: error instanceof Error ? error.stack : undefined,
      extra: { error: error instanceof Error ? error.message : String(error) }
    });
    return [];
  }
}

/**
 * Função principal de discovery - busca apps por query
 */
export async function discoverApps(query: string): Promise<AppDiscoveryResult[]> {
  try {
    const screens = await getAllScreens();
    const queryLower = query.toLowerCase();
    
    return screens
      .map(screen => {
        // Calcular confiança baseada na correspondência
        let confidence = 0;
        
        // Nome exato
        if (screen.nome.toLowerCase() === queryLower) {
          confidence = 1.0;
        }
        // Nome contém query
        else if (screen.nome.toLowerCase().includes(queryLower)) {
          confidence = 0.8;
        }
        // Módulo contém query
        else if (screen.modulo.toLowerCase().includes(queryLower)) {
          confidence = 0.6;
        }
        // Descrição contém query
        else if (screen.descricao?.toLowerCase().includes(queryLower)) {
          confidence = 0.5;
        }
        // Ações contêm query
        else if (screen.acoes?.some(acao => acao.toLowerCase().includes(queryLower))) {
          confidence = 0.4;
        }
        
        return {
          name: screen.nome,
          description: screen.descricao || `Tela de ${screen.nome} no módulo ${screen.modulo}`,
          confidence,
          category: screen.modulo
        } as AppDiscoveryResult;
      })
      .filter(result => result.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence);
  } catch (error: unknown) {
    console.error('[AppDiscovery] Erro ao buscar apps:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Busca tela por rota.
 */
export async function getScreenByRoute(_route: string): Promise<ScreenInfo | null> {
  try {
    return null;
  } catch (error: unknown) {
    logError('[AppDiscovery] Erro ao buscar tela por rota', error instanceof Error ? error : new Error(String(error)), {
      rota: 'AppDiscovery',
      stack: error instanceof Error ? error.stack : undefined,
      extra: { error: error instanceof Error ? error.message : String(error) }
    });
    return null;
  }
}
