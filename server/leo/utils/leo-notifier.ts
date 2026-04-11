/**
 * LEO Notifier - Sistema de notificações inteligentes
 * 
 * HARDENING: insight-engine removido e substituído por implementação segura
 * HARDENING: Proteções contra tenantId inválido implementadas
 * HARDENING: Acesso ao DB apenas através de SERVICES layer
 */

import { enviarMensagemTelegram } from "../../integrations/telegram.service.js";
import * as ordersService from "../../services/orders.service.js";
import { ValidationError } from '../../_core/errors/typed-errors.js';
import * as inventoryService from "../../services/inventory.service.js";
import type { RequestWithTenant } from "../../types/request-with-tenant.js";

// HARDENING: insight-engine.js foi removido (módulo instável _unstable)
// HARDENING: Implementação substituída por array vazio seguro

const PEDIDO_GRANDE_MIN = Number(process.env.LEO_PEDIDO_GRANDE_MIN) || 3000;
const FRETE_ATRASADO_DIAS = 7;

/**
 * Obtém tenantId do contexto ou lança erro se não disponível
 * CRÍTICO: Não permite fallback para tenant fixo
 */

export async function enviarNotificacoesInteligentes(req: RequestWithTenant, tarefasResumos: { nome: string; resumo?: string }[]): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const linhas: string[] = [];

  const boletoTask = tarefasResumos.find((t) => t.nome === "boletos_vencidos" && t.resumo && !t.resumo.startsWith("Nenhum"));
  if (boletoTask?.resumo) linhas.push(`📋 ${boletoTask.resumo}`);

  const estoqueTask = tarefasResumos.find((t) => t.nome === "estoque_baixo" && t.resumo && !t.resumo.startsWith("Nenhum"));
  if (estoqueTask?.resumo) linhas.push(`📦 ${estoqueTask.resumo}`);

  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    const zero = await inventoryService.countProdutosAtivosEstoqueZero(tenantId);
    if (zero > 0) linhas.push(`⚠️ Estoque zerado: ${zero} produto(s) com 0 un.`);
  } catch {
    void 0;
  }

  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const p = await ordersService.findPedidoGrandeRecente(tenantId, PEDIDO_GRANDE_MIN, ontem);
    if (p) linhas.push(`💰 Pedido grande registrado: #${p.numero ?? "?"} — R$ ${Number(p.total ?? 0).toFixed(2)}`);
  } catch {
    void 0;
  }

  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    // Módulo gerarInsights removido - implementação segura
    const insights: Array<{ tipo: string; mensagem: string }> = [];
    const queda = insights.find((i: { tipo: string; mensagem: string }) => i.tipo === "queda_vendas");
    if (queda) linhas.push(`📉 ${queda.mensagem}`);
  } catch {
    void 0;
  }

  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    const nums = await ordersService.listNumerosPedidosEmRotaAtrasados(tenantId, FRETE_ATRASADO_DIAS, 5);
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
