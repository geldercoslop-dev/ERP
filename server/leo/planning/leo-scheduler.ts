import * as financeEngine from "../../services/ai/finance-engine";
import * as ordersService from "../../services/orders.service";
import * as inventoryService from "../../services/inventory.service";

const INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_TENANT_ID = 1;

export type TarefaResult = {
  nome: string;
  ok: boolean;
  resumo?: string;
  erro?: string;
};

async function verificarVendasDoDia(): Promise<TarefaResult> {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fim = new Date(hoje);
    fim.setHours(23, 59, 59, 999);
    const res = await ordersService.getReportVendasPeriodo(DEFAULT_TENANT_ID, { dataInicio: hoje, dataFim: fim });
    const total = Number(res.totalValor ?? 0);
    const qtd = Array.isArray(res.itens) ? res.itens.length : 0;
    return { nome: "vendas_do_dia", ok: true, resumo: `Vendas hoje: ${qtd} movimento(s), R$ ${total.toFixed(2)}` };
  } catch (e) {
    return { nome: "vendas_do_dia", ok: false, erro: (e as Error)?.message ?? String(e) };
  }
}

async function verificarEstoqueBaixo(): Promise<TarefaResult> {
  try {
    const count = await inventoryService.countProdutosAtivosEstoqueAte(DEFAULT_TENANT_ID, 5);
    return {
      nome: "estoque_baixo",
      ok: true,
      resumo: count > 0 ? `${count} produto(s) com estoque ≤ 5` : "Nenhum produto com estoque baixo.",
    };
  } catch (e) {
    return { nome: "estoque_baixo", ok: false, erro: (e as Error)?.message ?? String(e) };
  }
}

async function verificarBoletosVencidos(): Promise<TarefaResult> {
  try {
    const { total, quantidade } = await financeEngine.boletosVencidos();
    return {
      nome: "boletos_vencidos",
      ok: true,
      resumo: quantidade > 0 ? `${quantidade} boleto(s) vencido(s), R$ ${total.toFixed(2)}` : "Nenhum boleto vencido.",
    };
  } catch (e) {
    return { nome: "boletos_vencidos", ok: false, erro: (e as Error)?.message ?? String(e) };
  }
}

async function verificarPedidosParados(): Promise<TarefaResult> {
  try {
    const limite = new Date();
    limite.setDate(limite.getDate() - 3);
    const qtd = await ordersService.countPedidosParadosGeradoConferido(DEFAULT_TENANT_ID, limite);
    return {
      nome: "pedidos_parados",
      ok: true,
      resumo: qtd > 0 ? `${qtd} pedido(s) em GERADO/CONFERIDO há mais de 3 dias` : "Nenhum pedido parado.",
    };
  } catch (e) {
    return { nome: "pedidos_parados", ok: false, erro: (e as Error)?.message ?? String(e) };
  }
}

export async function executarTarefas(): Promise<TarefaResult[]> {
  const results: TarefaResult[] = [];
  results.push(await verificarVendasDoDia());
  results.push(await verificarEstoqueBaixo());
  results.push(await verificarBoletosVencidos());
  results.push(await verificarPedidosParados());
  return results;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (intervalId != null) return;
  executarTarefas()
    .then((r) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[LEO scheduler] Primeira execução:", r.map((x) => x.resumo ?? x.erro).join("; "));
      }
    })
    .catch((e) => console.error("[LEO scheduler] Erro na primeira execução:", e));
  intervalId = setInterval(() => {
    executarTarefas()
      .then(async (results) => {
        const alertas = results.filter((r) => r.ok && r.resumo && !r.resumo.startsWith("Nenhum"));
        if (alertas.length > 0 && process.env.NODE_ENV !== "production") {
          console.log("[LEO scheduler]", alertas.map((a) => a.resumo).join("; "));
        }
        const { enviarNotificacoesInteligentes } = await import("../utils/leo-notifier");
        await enviarNotificacoesInteligentes(results).catch(() => {});
      })
      .catch((e) => console.error("[LEO scheduler]", (e as Error)?.message ?? e));
  }, INTERVAL_MS);
}

export function stopScheduler(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
