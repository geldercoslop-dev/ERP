/**
 * LEO Financial Insights Engine
 * 
 * Motor de análise financeira para gerar insights automáticos sobre faturamento e fluxo de caixa
 */

import * as db from "../../db/index.js";
import * as db from "../../../db/index.js";
import { ContaPagarStatus, ContaReceberStatus, PedidoStatus } from "../../../shared/domain-status.js";

export type FaturamentoDiario = {
  data: string;
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  meta: number;
  percentualMeta: number;
};

export type FaturamentoMensal = {
  mes: string;
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  crescimento: number;
  meta: number;
  percentualMeta: number;
};

export type FluxoCaixa = {
  data: string;
  entradas: number;
  saidas: number;
  saldo: number;
  saldoAcumulado: number;
};

export type IndicadorFinanceiro = {
  nome: string;
  valor: number;
  valorAnterior: number;
  variacao: number;
  variacaoPercentual: number;
  status: 'positivo' | 'negativo' | 'estavel' | 'alerta';
  meta: number;
  atingiuMeta: boolean;
};

export type FinancialInsights = {
  faturamentoDiario: FaturamentoDiario[];
  faturamentoMensal: FaturamentoMensal[];
  fluxoCaixa: FluxoCaixa[];
  indicadores: IndicadorFinanceiro[];
  resumo: {
    faturamentoPeriodo: number;
    crescimentoPeriodo: number;
    ticketMedio: number;
    margemLucro: number;
    saldoCaixa: number;
    previsaoProximoMes: number;
    healthScore: number;
  };
};

/**
 * Analisa faturamento diário dos últimos 30 dias
 */
export async function getFaturamentoDiario(tenantId: number): Promise<FaturamentoDiario[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const faturamento = await dbConnection
      .select({
        data: sql<string>`DATE(${db.pedidos.createdAt})`.as('data'),
        faturamento: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)`.as('faturamento'),
        pedidos: sql<number>`COUNT(*)`.as('pedidos')
      })
      .from(db.pedidos)
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${trintaDiasAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(sql`DATE(${db.pedidos.createdAt})`)
      .orderBy(sql`DATE(${db.pedidos.createdAt})`);

    // Meta diária (pode vir de configurações)
    const metaDiaria = await getMetaDiaria(tenantId);

    return faturamento.map((dia) => ({
      ...dia,
      ticketMedio: Number(dia.pedidos) > 0 ? Number(dia.faturamento) / Number(dia.pedidos) : 0,
      meta: metaDiaria,
      percentualMeta: metaDiaria > 0 ? (Number(dia.faturamento) / metaDiaria) * 100 : 0,
    }));
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getFaturamentoDiario:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Analisa faturamento mensal dos últimos 12 meses
 */
export async function getFaturamentoMensal(tenantId: number): Promise<FaturamentoMensal[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const dozeMesesAtras = new Date();
    dozeMesesAtras.setMonth(dozeMesesAtras.getMonth() - 12);

    const faturamento = await dbConnection
      .select({
        mes: sql<string>`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`.as('mes'),
        faturamento: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)`.as('faturamento'),
        pedidos: sql<number>`COUNT(*)`.as('pedidos')
      })
      .from(db.pedidos)
      .where(
        and(
          eq(db.pedidos.tenantId, tenantId),
          sql`${db.pedidos.createdAt} >= ${dozeMesesAtras}`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      )
      .groupBy(sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m')`);

    // Meta mensal e cálculo de crescimento
    const metaMensal = await getMetaMensal(tenantId);
    
    return faturamento.map((mes, index: number) => {
      if (!('mes' in mes)) {
        throw new Error('Invalid mes object');
      }
      const faturamentoAnterior = index > 0 ? Number(faturamento[index - 1]?.faturamento) : 0;
      const fat = Number(mes.faturamento);
      const ped = Number(mes.pedidos);
      const crescimento = faturamentoAnterior > 0 ? ((fat - faturamentoAnterior) / faturamentoAnterior) * 100 : 0;

      return {
        ...mes,
        ticketMedio: ped > 0 ? fat / ped : 0,
        crescimento: Number(crescimento.toFixed(1)),
        meta: metaMensal,
        percentualMeta: metaMensal > 0 ? (fat / metaMensal) * 100 : 0
      };
    });
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getFaturamentoMensal:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Analisa fluxo de caixa (entradas e saídas)
 */
export async function getFluxoCaixa(tenantId: number): Promise<FluxoCaixa[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    // Entradas (Contas Recebidas) — schema usa dataRecebimento
    const entradas = await dbConnection
      .select({
        data: sql<string>`DATE(${db.contasReceber.dataRecebimento})`.as('data'),
        total: sql<number>`SUM(${db.contasReceber.valor})`.as('total')
      })
      .from(db.contasReceber)
      .where(
        and(
          eq(db.contasReceber.tenantId, tenantId),
          eq(db.contasReceber.status, ContaReceberStatus.RECEBIDA),
          sql`${db.contasReceber.dataRecebimento} >= ${trintaDiasAtras}`
        )
      )
      .groupBy(sql`DATE(${db.contasReceber.dataRecebimento})`);

    // Saídas (Contas Pagas) — schema usa dataPagamento
    const saidas = await dbConnection
      .select({
        data: sql<string>`DATE(${db.contasPagar.dataPagamento})`.as('data'),
        total: sql<number>`SUM(${db.contasPagar.valor})`.as('total')
      })
      .from(db.contasPagar)
      .where(
        and(
          eq(db.contasPagar.tenantId, tenantId),
          eq(db.contasPagar.status, ContaPagarStatus.PAGO),
          sql`${db.contasPagar.dataPagamento} >= ${trintaDiasAtras}`
        )
      )
      .groupBy(sql`DATE(${db.contasPagar.dataPagamento})`);

    // Merge e cálculo de saldo
    const fluxo: FluxoCaixa[] = [];
    let saldoAcumulado = 0;

    // TODO: Implementar merge real de datas
    
    return fluxo;
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getFluxoCaixa:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Calcula indicadores financeiros chave
 */
export async function getIndicadoresFinanceiros(): Promise<IndicadorFinanceiro[]> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return [];

  try {
    const indicadores: IndicadorFinanceiro[] = [];

    // Faturamento do mês
    const faturamentoMes = await getFaturamentoMesAtual();
    const faturamentoMesAnterior = await getFaturamentoMesAnterior();

    // Ticket médio
    const ticketMedio = await getTicketMedio();
    const ticketMedioAnterior = await getTicketMedioAnterior();

    // Margem de lucro (estimada)
    const margemLucro = await getMargemLucro();
    const margemLucroAnterior = await getMargemLucroAnterior();

    // Saldo de caixa
    const saldoCaixa = await getSaldoCaixa();
    const saldoCaixaAnterior = await getSaldoCaixaAnterior();

    // Criar indicadores
    const metas = await getMetasFinanceiras();

    indicadores.push({
      nome: 'Faturamento Mensal',
      valor: faturamentoMes,
      valorAnterior: faturamentoMesAnterior,
      variacao: faturamentoMes - faturamentoMesAnterior,
      variacaoPercentual: faturamentoMesAnterior > 0 ? ((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior) * 100 : 0,
      status: faturamentoMes >= metas.faturamentoMensal ? 'positivo' : 'alerta',
      meta: metas.faturamentoMensal,
      atingiuMeta: faturamentoMes >= metas.faturamentoMensal
    });

    indicadores.push({
      nome: 'Ticket Médio',
      valor: ticketMedio,
      valorAnterior: ticketMedioAnterior,
      variacao: ticketMedio - ticketMedioAnterior,
      variacaoPercentual: ticketMedioAnterior > 0 ? ((ticketMedio - ticketMedioAnterior) / ticketMedioAnterior) * 100 : 0,
      status: ticketMedio >= metas.ticketMedio ? 'positivo' : 'negativo',
      meta: metas.ticketMedio,
      atingiuMeta: ticketMedio >= metas.ticketMedio
    });

    indicadores.push({
      nome: 'Margem de Lucro',
      valor: margemLucro,
      valorAnterior: margemLucroAnterior,
      variacao: margemLucro - margemLucroAnterior,
      variacaoPercentual: margemLucroAnterior > 0 ? ((margemLucro - margemLucroAnterior) / margemLucroAnterior) * 100 : 0,
      status: margemLucro >= metas.margemLucro ? 'positivo' : 'alerta',
      meta: metas.margemLucro,
      atingiuMeta: margemLucro >= metas.margemLucro
    });

    indicadores.push({
      nome: 'Saldo de Caixa',
      valor: saldoCaixa,
      valorAnterior: saldoCaixaAnterior,
      variacao: saldoCaixa - saldoCaixaAnterior,
      variacaoPercentual: saldoCaixaAnterior > 0 ? ((saldoCaixa - saldoCaixaAnterior) / Math.abs(saldoCaixaAnterior)) * 100 : 0,
      status: saldoCaixa >= metas.saldoMinimoCaixa ? 'estavel' : 'alerta',
      meta: metas.saldoMinimoCaixa,
      atingiuMeta: saldoCaixa >= metas.saldoMinimoCaixa
    });

    return indicadores;
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getIndicadoresFinanceiros:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Gera análise financeira completa
 */
export async function getFinancialInsights(tenantId: number): Promise<FinancialInsights> {
  const [faturamentoDiario, faturamentoMensal, fluxoCaixa] = await Promise.all([
    getFaturamentoDiario(tenantId),
    getFaturamentoMensal(tenantId),
    getFluxoCaixa(tenantId)
  ]);

  // Resumo atual
  const faturamentoPeriodo = faturamentoDiario.reduce((sum, d) => sum + d.faturamento, 0);
  const totalPedidos = faturamentoDiario.reduce((sum, d) => sum + d.pedidos, 0);
  const ticketMedio = totalPedidos > 0 ? faturamentoPeriodo / totalPedidos : 0;
  
  return {
    faturamentoDiario,
    faturamentoMensal,
    fluxoCaixa,
    indicadores: [],
    resumo: {
      faturamentoPeriodo,
      crescimentoPeriodo: 0,
      ticketMedio,
      margemLucro: 0,
      saldoCaixa: 0,
      previsaoProximoMes: 0,
      healthScore: 85
    }
  };
}

// Funções auxiliares

/**
 * Busca meta diária de faturamento
 */
async function getMetaDiaria(tenantId: number): Promise<number> {
  return 1000; 
}

/**
 * Busca meta mensal de faturamento
 */
async function getMetaMensal(tenantId: number): Promise<number> {
  return 30000;
}

async function getMetasFinanceiras(): Promise<{
  faturamentoMensal: number;
  ticketMedio: number;
  margemLucro: number;
  saldoMinimoCaixa: number;
}> {
  // Poderia vir de tabela de configurações
  return {
    faturamentoMensal: 50000,
    ticketMedio: 150,
    margemLucro: 30,
    saldoMinimoCaixa: 10000
  };
}

async function getFaturamentoMesAtual(): Promise<number> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return 0;

  try {
    const [result] = await dbConnection
      .select({ total: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)` })
      .from(db.pedidos)
      .where(
        and(
          sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    return result?.total || 0;
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getFaturamentoMesAtual:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

async function getFaturamentoMesAnterior(): Promise<number> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return 0;

  try {
    const [result] = await dbConnection
      .select({ total: sql<number>`COALESCE(SUM(${db.pedidos.total}), 0)` })
      .from(db.pedidos)
      .where(
        and(
          sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m') = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m')`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    return result?.total || 0;
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getFaturamentoMesAnterior:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

async function getTicketMedio(): Promise<number> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return 0;

  try {
    const [result] = await dbConnection
      .select({ ticket: sql<number>`COALESCE(AVG(${db.pedidos.total}), 0)` })
      .from(db.pedidos)
      .where(
        and(
          sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    return Number(result?.ticket.toFixed(2)) || 0;
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getTicketMedio:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

async function getTicketMedioAnterior(): Promise<number> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return 0;

  try {
    const [result] = await dbConnection
      .select({ ticket: sql<number>`COALESCE(AVG(${db.pedidos.total}), 0)` })
      .from(db.pedidos)
      .where(
        and(
          sql`DATE_FORMAT(${db.pedidos.createdAt}, '%Y-%m') = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y-%m')`,
          ne(db.pedidos.status, PedidoStatus.CANCELADO)
        )
      );

    return Number(result?.ticket.toFixed(2)) || 0;
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getTicketMedioAnterior:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

async function getMargemLucro(): Promise<number> {
  // Estimativa baseada em markup médio de 30%
  return 30;
}

async function getMargemLucroAnterior(): Promise<number> {
  return 28;
}

async function getSaldoCaixa(): Promise<number> {
  const dbConnection = await db.getDb();
  if (!dbConnection) return 0;

  try {
    const [entradas] = await dbConnection
      .select({ total: sql<number>`COALESCE(SUM(${db.contasReceber.valor}), 0)` })
      .from(db.contasReceber)
      .where(eq(db.contasReceber.status, ContaReceberStatus.RECEBIDA));

    const [saidas] = await dbConnection
      .select({ total: sql<number>`COALESCE(SUM(${db.contasPagar.valor}), 0)` })
      .from(db.contasPagar)
      .where(eq(db.contasPagar.status, ContaPagarStatus.PAGO));

    return (entradas?.total || 0) - (saidas?.total || 0);
  } catch (error: unknown) {
    console.error('[LEO Financial Insights] Erro em getSaldoCaixa:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

async function getSaldoCaixaAnterior(): Promise<number> {
  return 8000;
}

async function calcularCrescimentoFaturamento(): Promise<number> {
  const atual = await getFaturamentoMesAtual();
  const anterior = await getFaturamentoMesAnterior();
  return anterior > 0 ? ((atual - anterior) / anterior) * 100 : 0;
}

async function calcularPrevisaoProximoMes(): Promise<number> {
  const atual = await getFaturamentoMesAtual();
  const crescimento = await calcularCrescimentoFaturamento();
  return Number((atual * (1 + crescimento / 100)).toFixed(2));
}

function calcularHealthScore(indicadores: IndicadorFinanceiro[]): number {
  const indicadoresPositivos = indicadores.filter(i => i.status === 'positivo' || i.atingiuMeta).length;
  const totalIndicadores = indicadores.length;
  return totalIndicadores > 0 ? (indicadoresPositivos / totalIndicadores) * 100 : 0;
}
