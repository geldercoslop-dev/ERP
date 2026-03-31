import { leoLongMemory } from "../leo/memory/leo-long-memory.js";
import { buildLeoContext } from "../leo/utils/leo-context.js";
import {
  aggregateTicketPedidos,
  sumPedidosTotalBetween,
} from "./orders.service.js";
import { listClientes } from "./clientes.service.js";
import { getAllProdutos } from "./inventory.service.js";
import { ADMIN_ACTOR } from "../_core/service-actor.js";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYesterday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - 1);
  return d;
}

export async function askLeoQuestion(
  tenantId: number,
  question: string,
  context?: string
): Promise<{ answer: string; processingTime: number }> {
  const startedAt = Date.now();
  await leoLongMemory.saveEvent(
    tenantId,
    `Usuário perguntou: ${question}`,
    context || "Pergunta via API",
    "medium"
  );

  const answer = await processLeoQuestion(tenantId, question);

  await leoLongMemory.saveInsight(
    tenantId,
    `LEO respondeu: ${answer}`,
    `Resposta à pergunta: ${question}`,
    "medium"
  );

  return {
    answer,
    processingTime: Date.now() - startedAt,
  };
}

export async function getLeoStatusSummary(
  tenantId: number,
  detailed: boolean
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const basicStatus = {
    online: true,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };

  if (!detailed) {
    return { ...basicStatus, success: true };
  }

  const [
    memoryStats,
    recentOrders,
    activeClientsPage,
    lowStockProducts,
    context,
  ] = await Promise.all([
    leoLongMemory.getMemoryStats(tenantId),
    aggregateTicketPedidos(tenantId, { since: startOfToday() }),
    listClientes(tenantId, ADMIN_ACTOR, { page: 1, pageSize: 1 }),
    getAllProdutos(tenantId),
    buildLeoContext("leo").catch(() => null),
  ]);

  const lowStockCount = lowStockProducts.filter(
    (p) => Number(p.estoque ?? 0) < 10
  ).length;

  return {
    ...basicStatus,
    memory: {
      heapUsed: Math.round(basicStatus.memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(basicStatus.memory.heapTotal / 1024 / 1024),
      external: Math.round(basicStatus.memory.external / 1024 / 1024),
    },
    leoMemory: memoryStats,
    erpData: {
      recentOrders: recentOrders.count,
      activeClients: activeClientsPage.total,
      lowStockProducts: lowStockCount,
    },
    context: context
      ? {
          pedidosHoje: context.erp.pedidosHoje,
          clientesCount: context.erp.clientesCount,
          produtosCount: context.erp.produtosCount,
          estoqueBaixo: context.erp.estoqueBaixo,
        }
      : null,
    processingTime: Date.now() - startedAt,
    success: true,
  };
}

async function processLeoQuestion(
  tenantId: number,
  question: string
): Promise<string> {
  const lowerQuestion = question.toLowerCase();
  if (lowerQuestion.includes("venda") || lowerQuestion.includes("pedido")) {
    return handleSalesQuestion(tenantId, lowerQuestion);
  }
  if (lowerQuestion.includes("cliente")) {
    return handleClientQuestion(tenantId, lowerQuestion);
  }
  if (lowerQuestion.includes("estoque") || lowerQuestion.includes("produto")) {
    return handleStockQuestion(tenantId);
  }
  if (lowerQuestion.includes("status") || lowerQuestion.includes("como está")) {
    return handleSystemStatusQuestion(tenantId);
  }
  return `Entendi sua pergunta sobre "${question}". Estou analisando os dados para fornecer a melhor resposta.`;
}

async function handleSalesQuestion(
  tenantId: number,
  question: string
): Promise<string> {
  try {
    const todayStart = startOfToday();
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const todayCount = await aggregateTicketPedidos(tenantId, { since: todayStart });
    const todayTotal = await sumPedidosTotalBetween(tenantId, todayStart, tomorrowStart);

    if (question.includes("ontem")) {
      const yesterdayStart = startOfYesterday();
      const yesterdayTotal = await sumPedidosTotalBetween(
        tenantId,
        yesterdayStart,
        todayStart
      );
      return `Ontem o total vendido foi R$ ${yesterdayTotal.toFixed(2)}. Hoje já temos ${todayCount.count} vendas e R$ ${todayTotal.toFixed(2)}.`;
    }

    return `Hoje tivemos ${todayCount.count} vendas totalizando R$ ${todayTotal.toFixed(2)}.`;
  } catch {
    return "Nao consegui acessar os dados de vendas no momento.";
  }
}

async function handleClientQuestion(
  tenantId: number,
  question: string
): Promise<string> {
  try {
    const clientes = await listClientes(tenantId, ADMIN_ACTOR, {
      page: 1,
      pageSize: 200,
      busca: question.includes("novo") ? "" : undefined,
    });
    return `Atualmente temos ${clientes.total} clientes cadastrados no sistema.`;
  } catch {
    return "Nao consegui acessar os dados de clientes no momento.";
  }
}

async function handleStockQuestion(tenantId: number): Promise<string> {
  try {
    const produtos = await getAllProdutos(tenantId);
    const lowStock = produtos.filter((p) => Number(p.estoque ?? 0) < 10).length;
    return `Temos ${lowStock} produtos com estoque abaixo do mínimo recomendado.`;
  } catch {
    return "Nao consegui verificar o estoque agora.";
  }
}

async function handleSystemStatusQuestion(tenantId: number): Promise<string> {
  try {
    const pending = await aggregateTicketPedidos(tenantId, {});
    const produtos = await getAllProdutos(tenantId);
    const stockAlerts = produtos.filter((p) => Number(p.estoque ?? 0) < 10).length;
    return `O sistema está estável. Temos ${pending.count} pedidos monitorados e ${stockAlerts} alertas de estoque baixo.`;
  } catch {
    return "O sistema está operando normalmente, mas nao consegui extrair os indicadores agora.";
  }
}
