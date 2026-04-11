/**
 * Contexto do LEO
 * 
 * Responsável por reunir informações do sistema para tomada de decisão:
 * - usuário logado
 * - estado ERP
 * - alertas
 * - estoque
 * - pedidos recentes
 * - estado do servidor
 */


/** Contexto de runtime construído para o LEO (tomada de decisão / ações). LeoContext em `shared/types` é o tipo canônico de contexto. */
export interface LeoRuntimeContext {
  tenantId: number;
  usuario: {
    id?: number;
    nome: string;
    role?: string;
    vendedorId?: number;
  };
  erp: {
    pedidosHoje: number;
    pedidosPendentes: number;
    clientesCount: number;
    produtosCount: number;
    estoqueBaixo: number;
  };
  alertas: {
    estoqueCritico: number;
    pedidosAtrasados: number;
    sistemaIssues: number;
  };
  servidor: {
    uptime: number;
    memoria: NodeJS.MemoryUsage;
    databaseConnected: boolean;
  };
  timestamp: Date;
}

/**
 * Constrói o contexto completo do Leo para tomada de decisão
 */
export async function buildLeoContext(usuarioNome: string, tenantId: number): Promise<LeoRuntimeContext> {
  // LEO não acessa DB diretamente: contexto base operacional.
  const contextoBase: LeoRuntimeContext = {
    tenantId,
    usuario: {
      nome: usuarioNome,
    },
    erp: {
      pedidosHoje: 0,
      pedidosPendentes: 0,
      clientesCount: 0,
      produtosCount: 0,
      estoqueBaixo: 0,
    },
    alertas: {
      estoqueCritico: 0,
      pedidosAtrasados: 0,
      sistemaIssues: 0,
    },
    servidor: {
      uptime: process.uptime(),
      memoria: process.memoryUsage(),
      databaseConnected: false,
    },
    timestamp: new Date(),
  };
  return contextoBase;
}
