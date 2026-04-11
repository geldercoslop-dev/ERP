/**
 * Assistente operacional: analisa dados do banco e gera sugestões em tom amigável e conversacional.
 */
import * as db from "../../db/index.js";
import { inArray, ne } from "drizzle-orm";
import { ContaPagarStatus, ContaReceberStatus, PedidoStatus } from "../../shared/domain-status.js";
import { ValidationError } from "../../_core/errors/typed-errors.js";

export type SugestaoSistema = {
  tipo: string;
  mensagem: string;
  prioridade: "alta" | "media" | "baixa";
  data: Date;
};

function parseTenantId(tenantId: string): number {
  const parsed = Number(tenantId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError("TENANT_ID_REQUIRED: tenantId deve ser inteiro positivo");
  }
  return parsed;
}

type EscolhaResultado<T> =
  | { found: false; item: null }
  | { found: true; item: T };

function escolher<T>(arr: T[]): EscolhaResultado<T> {
  if (arr.length === 0) {
    return { found: false, item: null };
  }
  return { found: true, item: arr[Math.floor(Math.random() * arr.length)] };
}

/** Datas comerciais fixas: { nome, dia, mês } (aviso 15 dias antes). */
const DATAS_COMERCIAIS: { nome: string; dia: number; mes: number }[] = [
  { nome: "Carnaval", dia: 4, mes: 3 },
  { nome: "Dia das Mães", dia: 12, mes: 5 },
  { nome: "Dia dos Namorados", dia: 12, mes: 6 },
  { nome: "Black Friday", dia: 29, mes: 11 },
  { nome: "Natal", dia: 25, mes: 12 },
];

function proximaDataComercial(dia: number, mes: number): Date {
  const hoje = new Date();
  let ano = hoje.getFullYear();
  let d = new Date(ano, mes - 1, dia);
  if (d < hoje) d = new Date(ano + 1, mes - 1, dia);
  return d;
}

/** Retorna true se hoje está no intervalo [data - 15 dias, data]. */
function estaProximo(data: Date, diasAntes: number): boolean {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicio = new Date(data);
  inicio.setDate(inicio.getDate() - diasAntes);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(data);
  fim.setHours(23, 59, 59, 999);
  return hoje >= inicio && hoje <= fim;
}

const VARIACOES_ESTOQUE_PARADO = [
  "esse produto tá parado há 30 dias. bora fazer uma promoção pra girar?",
  "olha isso aqui rapidinho: produto parado há um mês. que tal uma promo?",
  "esse produto tá meio parado hein... faz 30 dias sem movimentar.",
  "vale conferir isso aqui: estoque parado há 30 dias. bora dar uma olhada?",
  "fica de olho nisso aqui: produto sem movimento há 30 dias.",
  "acho que dá pra melhorar isso. produto parado há um mês.",
  "talvez seja hora de fazer uma promo. esse item tá parado há 30 dias.",
  "isso aqui merece atenção. 30 dias sem movimentação nesse produto.",
  "melhor dar uma conferida nisso. estoque parado há 30 dias.",
  "bora dar uma olhada nisso? produto parado há um tempinho.",
  "esse daqui tá parado há 30 dias. que tal uma campanha?",
  "produto sem movimento há 30 dias. vale pensar numa promo.",
];

const VARIACOES_PEDIDO_PARADO = [
  "esse pedido tá parado faz um tempo. dá uma conferida nele.",
  "olha isso aqui rapidinho: pedido parado há mais de 20 dias.",
  "bora dar uma olhada nisso? esse pedido tá parado.",
  "esse pedido tá meio parado hein... já faz mais de 20 dias.",
  "vale conferir isso aqui. pedido parado há mais de 20 dias.",
  "fica de olho nisso aqui. pedido sem alteração há um tempo.",
  "acho que dá pra melhorar isso. pedido parado há 20 dias.",
  "isso aqui merece atenção. pedido parado faz um tempo.",
  "melhor dar uma conferida nisso. pedido parado há mais de 20 dias.",
  "talvez seja hora de dar uma olhada nesse pedido. tá parado há 20 dias.",
  "pedido parado há mais de 20 dias. vale checar.",
  "dá uma conferida nele. esse pedido tá parado faz um tempo.",
];

const VARIACOES_FINANCEIRO_DESEQUILIBRADO = [
  "hoje saiu mais dinheiro do que entrou. fica de olho no caixa.",
  "olha isso aqui rapidinho: pagamentos hoje superaram os recebimentos.",
  "bora dar uma olhada nisso? o caixa tá desequilibrado hoje.",
  "esse fluxo tá meio estranho hein... saiu mais do que entrou hoje.",
  "vale conferir isso aqui. hoje pagamos mais do que recebemos.",
  "fica de olho no caixa. saiu mais dinheiro do que entrou hoje.",
  "acho que dá pra melhorar isso. fluxo de caixa negativo hoje.",
  "isso aqui merece atenção. pagamentos > recebimentos hoje.",
  "melhor dar uma conferida no financeiro. caixa desequilibrado hoje.",
  "talvez seja hora de revisar. hoje saiu mais do que entrou.",
  "hoje o caixa ficou no negativo. fica de olho.",
  "atenção: mais saídas que entradas hoje.",
];

const VARIACOES_CONTAS_RECEBER_HOJE = [
  "tem contas pra receber hoje. vale dar uma checada.",
  "olha isso aqui rapidinho: contas vencendo hoje.",
  "bora dar uma olhada nisso? tem valores a receber hoje.",
  "vale conferir isso aqui. contas a receber com vencimento hoje.",
  "fica de olho nisso aqui. tem contas vencendo hoje.",
  "tem recebimentos previstos pra hoje. dá uma conferida.",
  "isso aqui merece atenção. contas a receber hoje.",
  "melhor dar uma checada. tem contas vencendo hoje.",
  "talvez seja hora de cobrar. tem contas a receber hoje.",
  "tem contas pra receber hoje. bora conferir?",
  "contas com vencimento hoje. vale dar uma olhada.",
  "atenção: existem contas a receber vencendo hoje.",
];

const VARIACOES_MOVIMENTO_FRACO = [
  "movimento de vendas hoje tá mais fraco que o normal.",
  "olha isso aqui rapidinho: vendas hoje abaixo da média semanal.",
  "bora dar uma olhada nisso? movimento hoje tá fraco.",
  "esse movimento tá meio fraco hein... menos pedidos que a média.",
  "vale conferir isso aqui. vendas hoje abaixo do esperado.",
  "fica de olho nisso aqui. movimento de hoje mais fraco que a média.",
  "acho que dá pra melhorar isso. vendas hoje fracas.",
  "isso aqui merece atenção. menos pedidos que a média semanal.",
  "melhor dar uma conferida. movimento hoje tá fraco.",
  "talvez seja hora de impulsionar. vendas abaixo da média hoje.",
  "movimento hoje mais fraco que o normal. fica de olho.",
  "pedidos hoje abaixo da média semanal.",
];

const VARIACOES_DATA_COMERCIAL = [
  "essa data comercial tá chegando... talvez seja uma boa pensar numa promoção.",
  "olha isso aqui rapidinho: data comercial se aproximando. que tal uma promo?",
  "bora dar uma olhada nisso? essa data especial tá chegando.",
  "vale conferir isso aqui. data comercial a 15 dias. hora de planejar?",
  "fica de olho nisso aqui. data comercial se aproximando.",
  "essa data tá chegando... talvez seja uma boa pensar numa promo.",
  "isso aqui merece atenção. data comercial em breve.",
  "melhor já ir pensando. data comercial a 15 dias.",
  "talvez seja hora de preparar uma promo. data comercial chegando.",
  "data comercial se aproximando. que tal uma campanha?",
  "essa data especial tá chegando. vale planejar.",
  "em 15 dias é a data comercial. bora pensar numa promo?",
];

/**
 * Gera sugestões do sistema a partir dos dados do banco.
 * Tom amigável, conversacional; muitas variações para não repetir.
 */
export async function gerarSugestoesSistema(tenantId: string): Promise<{ success: boolean; data?: SugestaoSistema[]; error?: string }> {
  try {
    const tenantIdNum = parseTenantId(tenantId);
    const conn = await db.getDb();
    if (!conn) return { success: false, error: "Database connection failed" };

    const sugestoes: SugestaoSistema[] = [];
    const hoje = new Date();

  // 1) Estoque parado: produto com saldo > 0 e sem movimentação (venda) há 30 dias
  const produtosComEstoque = await conn
    .select({ id: db.produtos.id, descricao: db.produtos.descricao, estoque: db.produtos.estoque })
    .from(db.produtos)
    .where(db.and(db.eq(db.produtos.tenantId, tenantIdNum), db.sql`${db.produtos.estoque} > 0`, db.eq(db.produtos.ativo, true)));
  const ultimaVendaPorProduto = await conn
    .select({
      produtoId: db.itensPedido.produtoId,
      ultimaData: db.sql<Date>`MAX(${db.pedidos.updatedAt})`.as("ultimaData"),
    })
    .from(db.itensPedido)
    .innerJoin(db.pedidos, db.eq(db.pedidos.id, db.itensPedido.pedidoId))
    .where(db.and(db.eq(db.pedidos.tenantId, tenantIdNum), db.eq(db.itensPedido.tenantId, tenantIdNum), ne(db.pedidos.status, PedidoStatus.CANCELADO)))
    .groupBy(db.itensPedido.produtoId);
  const ultimaPorId = new Map<number, Date>();
  for (const r of ultimaVendaPorProduto as Array<{ produtoId: number | null; ultimaData: Date }>) {
    if (r.produtoId != null) ultimaPorId.set(r.produtoId, r.ultimaData);
  }
  const limite30 = new Date(hoje);
  limite30.setDate(limite30.getDate() - 30);
  for (const p of produtosComEstoque as Array<{ id: number; descricao: string; estoque: number }>) {
    const ultima = ultimaPorId.get(p.id);
    if (ultima == null || new Date(ultima) < limite30) {
      const escolha = escolher(VARIACOES_ESTOQUE_PARADO);
      sugestoes.push({
        tipo: "estoque_parado",
        mensagem: escolha.found ? escolha.item : "Produto parado há 30 dias. Verifique.",
        prioridade: "media",
        data: hoje,
      });
      break; // uma sugestão genérica para “tem produtos parados”
    }
  }

  // 2) Pedido parado: criado há mais de 20 dias sem alteração de status (GERADO ou PENDENTE_ESTOQUE)
  const pedidosParados = await conn
    .select({ id: db.pedidos.id, numero: db.pedidos.numero })
    .from(db.pedidos)
    .where(
      db.and(
        db.eq(db.pedidos.tenantId, tenantIdNum),
        inArray(db.pedidos.status, [PedidoStatus.GERADO, PedidoStatus.PENDENTE_ESTOQUE]),
        db.sql`${db.pedidos.createdAt} < DATE_SUB(NOW(), INTERVAL 20 DAY)`
      )
    )
    .limit(1);
  if (pedidosParados.length > 0) {
    const escolhaPedido = escolher(VARIACOES_PEDIDO_PARADO);
    sugestoes.push({
      tipo: "pedido_parado",
      mensagem: escolhaPedido.found ? escolhaPedido.item : "Pedido parado há mais de 20 dias. Verifique.",
      prioridade: "alta",
      data: hoje,
    });
  }

  // 3) Financeiro desequilibrado: pagamentos hoje > recebimentos hoje
  const [recebidoHoje] = await conn
    .select({ total: db.sql<string>`COALESCE(SUM(${db.contasReceber.valor}), 0)` })
    .from(db.contasReceber)
    .where(
      db.and(
        db.eq(db.contasReceber.tenantId, tenantIdNum),
        db.eq(db.contasReceber.status, ContaReceberStatus.RECEBIDA),
        db.sql`DATE(${db.contasReceber.dataRecebimento}) = CURDATE()`
      )
    );
  const [pagoHoje] = await conn
    .select({ total: db.sql<string>`COALESCE(SUM(${db.contasPagar.valor}), 0)` })
    .from(db.contasPagar)
    .where(
      db.and(
        db.eq(db.contasPagar.tenantId, tenantIdNum),
        db.eq(db.contasPagar.status, ContaPagarStatus.PAGO),
        db.sql`DATE(${db.contasPagar.dataPagamento}) = CURDATE()`
      )
    );
  const totalRecebido = Number((recebidoHoje as unknown as Array<{ total: string | number }> | undefined)?.[0]?.total ?? 0);
  const totalPago = Number((pagoHoje as unknown as Array<{ total: string | number }> | undefined)?.[0]?.total ?? 0);
  if (totalPago > totalRecebido) {
    const escolhaFinanceiro = escolher(VARIACOES_FINANCEIRO_DESEQUILIBRADO);
    sugestoes.push({
      tipo: "financeiro_desequilibrado",
      mensagem: escolhaFinanceiro.found ? escolhaFinanceiro.item : "Fluxo de caixa desequilibrado hoje.",
      prioridade: "alta",
      data: hoje,
    });
  }

  // 4) Contas a receber hoje
  const contasReceberHoje = await conn
    .select({ id: db.contasReceber.id })
    .from(db.contasReceber)
    .where(
      db.and(
        db.eq(db.contasReceber.tenantId, tenantIdNum),
        db.eq(db.contasReceber.status, ContaReceberStatus.PENDENTE),
        db.sql`DATE(${db.contasReceber.dataVencimento}) = CURDATE()`
      )
    )
    .limit(1);
  if (contasReceberHoje.length > 0) {
    const escolhaContas = escolher(VARIACOES_CONTAS_RECEBER_HOJE);
    sugestoes.push({
      tipo: "contas_receber_hoje",
      mensagem: escolhaContas.found ? escolhaContas.item : "Existem contas a receber hoje.",
      prioridade: "media",
      data: hoje,
    });
  }

  // 5) Movimento fraco: menos pedidos que média semanal (últimos 7 dias)
  const [pedidosHoje] = await conn
    .select({ c: db.sql<number>`COUNT(*)` })
    .from(db.pedidos)
    .where(db.and(db.eq(db.pedidos.tenantId, tenantIdNum), db.sql`DATE(${db.pedidos.createdAt}) = CURDATE()`));
  const [pedidosUltimos7] = await conn
    .select({ c: db.sql<number>`COUNT(*)` })
    .from(db.pedidos)
    .where(db.and(db.eq(db.pedidos.tenantId, tenantIdNum), db.sql`${db.pedidos.createdAt} >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`));
  const countHoje = Number((pedidosHoje as unknown as Array<{ c: string | number }> | undefined)?.[0]?.c ?? 0);
  const count7 = Number((pedidosUltimos7 as unknown as Array<{ c: string | number }> | undefined)?.[0]?.c ?? 0);
  const mediaSemanal = count7 / 7;
  if (mediaSemanal > 0 && countHoje < mediaSemanal) {
    const escolhaMovimento = escolher(VARIACOES_MOVIMENTO_FRACO);
    sugestoes.push({
      tipo: "movimento_fraco",
      mensagem: escolhaMovimento.found ? escolhaMovimento.item : "Movimento de vendas fraco hoje.",
      prioridade: "baixa",
      data: hoje,
    });
  }

  // 6) Datas comerciais: avisar 15 dias antes
  for (const dc of DATAS_COMERCIAIS) {
    const dataRef = proximaDataComercial(dc.dia, dc.mes);
    if (estaProximo(dataRef, 15)) {
      const escolhaData = escolher(VARIACOES_DATA_COMERCIAL);
      const mensagemBase = escolhaData.found ? escolhaData.item : "Data comercial se aproximando.";
      sugestoes.push({
        tipo: "data_comercial",
        mensagem: mensagemBase.replace(/essa data comercial/gi, dc.nome),
        prioridade: "media",
        data: hoje,
      });
    }
  }

  return { success: true, data: sugestoes };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}
