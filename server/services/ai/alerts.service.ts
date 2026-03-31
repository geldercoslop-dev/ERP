/**
 * Serviço de alertas proativos do LEO.
 * Monitora eventos críticos do sistema e envia notificações amigáveis.
 */
import { logger, logWarn, logInfo } from '../../_core/logger.js';
import * as db from '../leo-erp-data.facade.js';
import { eq, lt, and, sql, ne } from "drizzle-orm";
import { CargaStatus, ContaReceberStatus, PedidoStatus } from "../../shared/domain-status.js";

export type Alerta = {
  id: string;
  tipo: 'estoque_baixo' | 'contas_atrasadas' | 'vendas_baixas' | 'pedido_pendente' | 'carga_atrasada';
  titulo: string;
  mensagem: string;
  severidade: 'baixa' | 'media' | 'alta';
  data: Date;
  lido: boolean;
  acaoSugerida?: string;
  dados?: Record<string, unknown>;
};

/**
 * Verifica estoque baixo e gera alertas.
 */
export async function verificarEstoqueBaixo(): Promise<Alerta[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const produtos = await dbConnection
      .select({
        id: db.produtos.id,
        nome: db.produtos.descricao,
        quantidade: db.produtos.estoque,
        estoqueMinimo: sql`5`, // TODO: adicionar coluna estoque_minimo no schema
      })
      .from(db.produtos)
      .where(
        and(
          lt(db.produtos.estoque, sql`5`),
          eq(db.produtos.ativo, true)
        )
      )
      .limit(10);

    const alertas: Alerta[] = produtos.map((produto: Record<string, unknown>) => ({
      id: `estoque_${produto.id}_${Date.now()}`,
      tipo: 'estoque_baixo' as const,
      titulo: 'Estoque Baixo',
      mensagem: `Produto "${produto.nome}" com estoque crítico: ${produto.quantidade}/${produto.estoqueMinimo}`,
      severidade: produto.quantidade === 0 ? 'alta' : 'media' as const,
      data: new Date(),
      lido: false,
      acaoSugerida: 'leo abre estoque',
      dados: { produtoId: produto.id as number, nome: produto.nome },
    }));

    return alertas;
  } catch (e: unknown) {
    logWarn('Erro ao verificar estoque baixo', { erro: (e as Error)?.message });
    return [];
  }
}

/**
 * Verifica contas a receber vencidas.
 */
export async function verificarContasAtrasadas(): Promise<Alerta[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const hoje = new Date();
    const contas = await dbConnection
      .select({
        id: db.contasReceber.id,
        clienteNome: db.contasReceber.clienteNome,
        valor: db.contasReceber.valor,
        dataVencimento: db.contasReceber.dataVencimento,
      })
      .from(db.contasReceber)
      .where(
        and(
          lt(db.contasReceber.dataVencimento, hoje),
          ne(db.contasReceber.status, ContaReceberStatus.RECEBIDA)
        )
      )
      .limit(10);

    const alertas: Alerta[] = contas.map((conta: Record<string, unknown>) => ({
      id: `conta_${conta.id}_${Date.now()}`,
      tipo: 'contas_atrasadas' as const,
      titulo: 'Conta Vencida',
      mensagem: `Conta de ${conta.clienteNome} vencida: ${formatarMoeda(Number(conta.valor ?? 0))}`,
      severidade: 'media' as const,
      data: new Date(),
      lido: false,
      acaoSugerida: 'leo abre contas',
      dados: { contaId: conta.id, clienteNome: conta.clienteNome },
    }));

    return alertas;
  } catch (e: unknown) {
    logWarn('Erro ao verificar contas atrasadas', { erro: (e as Error)?.message });
    return [];
  }
}

/**
 * Verifica vendas baixas do dia.
 */
export async function verificarVendasBaixas(): Promise<Alerta[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const hoje = new Date();
    const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const fimDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);

    const [result] = await dbConnection
      .select({ 
        count: db.sql<number>`COUNT(*)`,
        total: db.sql<number>`SUM(total)` 
      })
      .from(db.pedidos)
      .where(
        and(
          sql`${db.pedidos.createdAt} >= ${inicioDia}`,
          lt(db.pedidos.createdAt, fimDia),
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    const totalPedidos = Number((result as { count?: unknown } | undefined)?.count ?? 0);
    const totalVendas = Number((result as { total?: unknown } | undefined)?.total ?? 0);

    // Alerta se tiver menos de 3 pedidos ou menos de R$500 em vendas
    if (totalPedidos < 3 || totalVendas < 500) {
      return [{
        id: `vendas_${Date.now()}`,
        tipo: 'vendas_baixas' as const,
        titulo: 'Vendas Baixas',
        mensagem: `Vendas do dia abaixo do esperado: ${totalPedidos} pedidos, ${formatarMoeda(totalVendas)}`,
        severidade: 'baixa' as const,
        data: new Date(),
        lido: false,
        acaoSugerida: 'leo abre vendas',
        dados: { totalPedidos, totalVendas },
      }];
    }

    return [];
  } catch (e: unknown) {
    logWarn('Erro ao verificar vendas baixas', { erro: (e as Error)?.message });
    return [];
  }
}

/**
 * Verifica pedidos pendentes há muito tempo.
 */
export async function verificarPedidosPendentes(): Promise<Alerta[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const tresDiasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const pedidos = await dbConnection
      .select({
        id: db.pedidos.id,
        numero: db.pedidos.numero,
        clienteNome: db.pedidos.clienteNome,
        createdAt: db.pedidos.createdAt,
        total: db.pedidos.total,
      })
      .from(db.pedidos)
      .where(
        and(
          lt(db.pedidos.createdAt, tresDiasAtras),
          ne(db.pedidos.status, PedidoStatus.ENTREGUE),
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .limit(5);

    const alertas: Alerta[] = pedidos.map((pedido: Record<string, unknown>) => ({
      id: `pedido_${pedido.id}_${Date.now()}`,
      tipo: 'pedido_pendente' as const,
      titulo: 'Pedido Pendente',
      mensagem: `Pedido #${pedido.numero} de ${pedido.clienteNome} pendente há mais de 3 dias`,
      severidade: 'media' as const,
      data: new Date(),
      lido: false,
      acaoSugerida: 'leo abre vendas',
      dados: { pedidoId: pedido.id, numero: pedido.numero },
    }));

    return alertas;
  } catch (e: unknown) {
    logWarn('Erro ao verificar pedidos pendentes', { erro: (e as Error)?.message });
    return [];
  }
}

/**
 * Verifica cargas em atraso.
 */
export async function verificarCargasAtrasadas(): Promise<Alerta[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const cargas = await dbConnection
      .select({
        id: db.cargas.id,
        numero: db.cargas.numero,
        data: db.cargas.dataEntrega,
        cidade: db.cargas.cidadeRota,
        status: db.cargas.status,
      })
      .from(db.cargas)
      .where(
        and(
          lt(db.cargas.dataEntrega, ontem),
          ne(db.cargas.status, CargaStatus.ENTREGUE)
        )
      )
      .limit(5);

    const alertas: Alerta[] = cargas.map((carga: Record<string, unknown>) => ({
      id: `carga_${carga.id}_${Date.now()}`,
      tipo: 'carga_atrasada' as const,
      titulo: 'Carga Atrasada',
      mensagem: `Carga #${carga.numero} com status "${String(carga.status ?? "")}" deveria ter sido entregue ontem`,
      severidade: 'alta' as const,
      data: new Date(),
      lido: false,
      acaoSugerida: 'leo abre logística',
      dados: { cargaId: carga.id, numero: carga.numero },
    }));

    return alertas;
  } catch (e: unknown) {
    logWarn('Erro ao verificar cargas atrasadas', { erro: (e as Error)?.message });
    return [];
  }
}

/**
 * Executa todas as verificações de alertas.
 */
export async function verificarTodosAlertas(): Promise<Alerta[]> {
  const [
    estoqueAlertas,
    contasAlertas,
    vendasAlertas,
    pedidosAlertas,
    cargasAlertas,
  ] = await Promise.all([
    verificarEstoqueBaixo(),
    verificarContasAtrasadas(),
    verificarVendasBaixas(),
    verificarPedidosPendentes(),
    verificarCargasAtrasadas(),
  ]);

  const todosAlertas = [
    ...estoqueAlertas,
    ...contasAlertas,
    ...vendasAlertas,
    ...pedidosAlertas,
    ...cargasAlertas,
  ];

  // Ordenar por severidade (alta > media > baixa) e depois por data
  todosAlertas.sort((a, b) => {
    const severidadeOrder = { alta: 3, media: 2, baixa: 1 };
    const diffSeveridade = severidadeOrder[b.severidade] - severidadeOrder[a.severidade];
    if (diffSeveridade !== 0) return diffSeveridade;
    return b.data.getTime() - a.data.getTime();
  });

  // Log dos alertas gerados
  if (todosAlertas.length > 0) {
    logInfo('Alertas proativos gerados', { 
      total: todosAlertas.length,
      porTipo: todosAlertas.reduce((acc: Record<string, number>, alerta: Alerta) => {
        acc[alerta.tipo] = (acc[alerta.tipo] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });
  }

  return todosAlertas;
}

/**
 * Marca alerta como lida.
 */
export async function marcarAlertaComoLida(alertaId: string): Promise<boolean> {
  try {
    // Aqui poderíamos salvar no banco, mas por enquanto apenas log
    logInfo('Alerta marcada como lida', { alertaId });
    return true;
  } catch (e: unknown) {
    logWarn('Erro ao marcar alerta como lida', { alertaId, erro: (e as Error)?.message });
    return false;
  }
}

/**
 * Formata valor monetário.
 */
function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  }).format(valor || 0);
}
