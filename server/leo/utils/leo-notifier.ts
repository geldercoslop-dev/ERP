import { gerarInsights } from "../../services/ai/insight-engine";
import { enviarMensagemTelegram } from "../../integrations/telegram.service";
import * as ordersService from "../../services/orders.service";
import * as inventoryService from "../../services/inventory.service";

const PEDIDO_GRANDE_MIN = Number(process.env.LEO_PEDIDO_GRANDE_MIN) || 3000;
const FRETE_ATRASADO_DIAS = 7;
const DEFAULT_TENANT_ID = 1;

export async function enviarNotificacoesInteligentes(tarefasResumos: { nome: string; resumo?: string }[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const linhas: string[] = [];

  const boletoTask = tarefasResumos.find((t) => t.nome === "boletos_vencidos" && t.resumo && !t.resumo.startsWith("Nenhum"));
  if (boletoTask?.resumo) linhas.push(`📋 ${boletoTask.resumo}`);

  const estoqueTask = tarefasResumos.find((t) => t.nome === "estoque_baixo" && t.resumo && !t.resumo.startsWith("Nenhum"));
  if (estoqueTask?.resumo) linhas.push(`📦 ${estoqueTask.resumo}`);

  try {
    const zero = await inventoryService.countProdutosAtivosEstoqueZero(DEFAULT_TENANT_ID);
    if (zero > 0) linhas.push(`⚠️ Estoque zerado: ${zero} produto(s) com 0 un.`);
  } catch {
    void 0;
  }

  try {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const p = await ordersService.findPedidoGrandeRecente(DEFAULT_TENANT_ID, PEDIDO_GRANDE_MIN, ontem);
    if (p) linhas.push(`💰 Pedido grande registrado: #${p.numero ?? "?"} — R$ ${Number(p.total ?? 0).toFixed(2)}`);
  } catch {
    void 0;
  }

  try {
    const insights = await gerarInsights(DEFAULT_TENANT_ID);
    const queda = insights.find((i) => i.tipo === "queda_vendas");
    if (queda) linhas.push(`📉 ${queda.mensagem}`);
  } catch {
    void 0;
  }

  try {
    const nums = await ordersService.listNumerosPedidosEmRotaAtrasados(DEFAULT_TENANT_ID, FRETE_ATRASADO_DIAS, 5);
    if (nums.length > 0) {
      const joined = nums.map((n) => `#${n}`).join(", ");
      linhas.push(`🚚 Frete atrasado: pedido(s) ${joined} em rota há mais de ${FRETE_ATRASADO_DIAS} dias.`);
    }
  } catch {
    void 0;
  }

  const paradosTask = tarefasResumos.find((t) => t.nome === "pedidos_parados" && t.resumo && !t.resumo.startsWith("Nenhum"));
  if (paradosTask?.resumo) linhas.push(`📌 ${paradosTask.resumo}`);

  if (linhas.length === 0) return;
  const texto = `🔔 <b>LEO — Alertas</b>\n\n${linhas.join("\n")}`;
  await enviarMensagemTelegram(texto, chatId);
}
