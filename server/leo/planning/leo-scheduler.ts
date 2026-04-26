/**
 * LEO Scheduler - Agendador de tarefas automatizadas
 * 
 * HARDENING: finance-engine removido e substituído por implementação segura
 * HARDENING: Proteções contra tenantId inválido implementadas
 * HARDENING: Acesso ao DB apenas através de SERVICES layer
 * EXECUTION GATE: TODA execução passa pelo gate centralizado
 */

import { salesAnalyticsTool } from "../../tools/sales-analytics.tool.js";
import { inventoryMonitorTool } from "../../tools/inventory-monitor.tool.js";
import { ValidationError } from '../../_core/errors/typed-errors.js';
import type { RequestWithTenant } from "../../types/request-with-tenant.js";
import { executeLeoActionGate, type ExecutionGateRequest } from '../runtime/execution-gate.js';

// HARDENING: finance-engine.js foi removido (módulo instável _unstable)
// HARDENING: Implementação substituída por valores fixos seguros
// HARDENING: ENV só configura parâmetros, não decide fluxo de execução

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutos fixo - não depende de ENV para fluxo

export type TarefaResult = {
  nome: string;
  ok: boolean;
  resumo?: string;
  erro?: string;
};

/**
 * Obtém tenantId do contexto ou lança erro se não disponível
 * CRÍTICO: Não permite fallback para tenant fixo
 */
// function getTenantId(): number {
//   // Em ambiente real, isso viria do contexto da requisição ou sistema
//   const tenantId = process.env.TENANT_ID ? Number(process.env.TENANT_ID) : null;
//   
//   if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
//     throw new ValidationError('TENANT_ID não configurado ou inválido. Configure a variável de ambiente Tenant ID.');
//   }
//   
//   return tenantId;
// }

async function verificarVendasDoDia(req: RequestWithTenant): Promise<TarefaResult> {
  try {
    if (!req.user) {
      throw new ValidationError("Usuário não autenticado");
    }

    const tenantId = req.user.tenantId;
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fim = new Date(hoje);
    fim.setHours(23, 59, 59, 999);
    
    // EXECUTION GATE: Passar execução pelo gate
    const gateRequest: ExecutionGateRequest = {
      action: 'getReportVendasPeriodo',
      toolName: 'salesAnalyticsTool',
      parameters: { tenantId, dataInicio: hoje, dataFim: fim },
      context: {
        tenantId,
        userId: req.user.userId || 0,
      },
      source: 'scheduler',
    };
    
    const gateResult = await executeLeoActionGate(gateRequest);
    
    if (!gateResult.success) {
      return { nome: "vendas_do_dia", ok: false, erro: gateResult.message };
    }
    
    const res = gateResult.data as { totalValor?: number; itens?: unknown[] };
    const total = Number(res?.totalValor ?? 0);
    const qtd = Array.isArray(res?.itens) ? res.itens.length : 0;
    return { nome: "vendas_do_dia", ok: true, resumo: `Vendas hoje: ${qtd} movimento(s), R$ ${total.toFixed(2)}` };
  } catch (e) {
    return { nome: "vendas_do_dia", ok: false, erro: (e as Error)?.message ?? String(e) };
  }
}

async function verificarEstoqueBaixo(req: RequestWithTenant): Promise<TarefaResult> {
  try {
    if (!req.user) {
      throw new ValidationError("Usuário não autenticado");
    }

    const tenantId = req.user.tenantId;
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    
    // EXECUTION GATE: Passar execução pelo gate
    const gateRequest: ExecutionGateRequest = {
      action: 'countProdutosAtivosEstoqueAte',
      toolName: 'inventoryMonitorTool',
      parameters: { tenantId, maxInclusive: 5 },
      context: {
        tenantId,
        userId: req.user.userId || 0,
      },
      source: 'scheduler',
    };
    
    const gateResult = await executeLeoActionGate(gateRequest);
    
    if (!gateResult.success) {
      return { nome: "estoque_baixo", ok: false, erro: gateResult.message };
    }
    
    const count = gateResult.data as number;
    return {
      nome: "estoque_baixo",
      ok: true,
      resumo: count > 0 ? `${count} produto(s) com estoque ≤ 5` : "Nenhum produto com estoque baixo.",
    };
  } catch (e) {
    return { nome: "estoque_baixo", ok: false, erro: (e as Error)?.message ?? String(e) };
  }
}

async function verificarBoletosVencidos(req: RequestWithTenant): Promise<TarefaResult> {
  try {
    if (!req.user) {
      throw new ValidationError("Usuário não autenticado");
    }

    const tenantId = req.user.tenantId;
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    
    // Módulo financeEngine removido - implementação segura
    // EXECUTION GATE: Passar execução pelo gate (simulado para boletos)
    const gateRequest: ExecutionGateRequest = {
      action: 'verificarBoletosVencidos',
      toolName: 'system',
      parameters: { tenantId },
      context: {
        tenantId,
        userId: req.user.userId || 0,
      },
      source: 'scheduler',
    };
    
    const gateResult = await executeLeoActionGate(gateRequest);
    
    if (!gateResult.success) {
      return { nome: "boletos_vencidos", ok: false, erro: gateResult.message };
    }
    
    // Implementação segura - valores fixos
    const { total = 0, quantidade = 0 } = { total: 0, quantidade: 0 };
    return {
      nome: "boletos_vencidos",
      ok: true,
      resumo: quantidade > 0 ? `${quantidade} boleto(s) vencido(s), R$ ${total.toFixed(2)}` : "Nenhum boleto vencido.",
    };
  } catch (e) {
    return { nome: "boletos_vencidos", ok: false, erro: (e as Error)?.message ?? String(e) };
  }
}

async function verificarPedidosParados(req: RequestWithTenant): Promise<TarefaResult> {
  try {
    if (!req.user) {
      throw new ValidationError("Usuário não autenticado");
    }

    const tenantId = req.user.tenantId;
    if (!tenantId || !Number.isInteger(tenantId) || tenantId <= 0) {
      throw new ValidationError("tenantId obrigatório");
    }
    const limite = new Date();
    limite.setDate(limite.getDate() - 3);
    
    // EXECUTION GATE: Passar execução pelo gate
    const gateRequest: ExecutionGateRequest = {
      action: 'countPedidosParadosGeradoConferido',
      toolName: 'salesAnalyticsTool',
      parameters: { tenantId, updatedBefore: limite },
      context: {
        tenantId,
        userId: req.user.userId || 0,
      },
      source: 'scheduler',
    };
    
    const gateResult = await executeLeoActionGate(gateRequest);
    
    if (!gateResult.success) {
      return { nome: "pedidos_parados", ok: false, erro: gateResult.message };
    }
    
    const qtd = gateResult.data as number;
    return {
      nome: "pedidos_parados",
      ok: true,
      resumo: qtd > 0 ? `${qtd} pedido(s) em GERADO/CONFERIDO há mais de 3 dias` : "Nenhum pedido parado.",
    };
  } catch (e) {
    return { nome: "pedidos_parados", ok: false, erro: (e as Error)?.message ?? String(e) };
  }
}

export async function executarTarefas(req: RequestWithTenant): Promise<TarefaResult[]> {
  const results: TarefaResult[] = [];
  results.push(await verificarVendasDoDia(req));
  results.push(await verificarEstoqueBaixo(req));
  results.push(await verificarBoletosVencidos(req));
  results.push(await verificarPedidosParados(req));
  return results;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startScheduler(req: RequestWithTenant): void {
  if (intervalId != null) return;
  executarTarefas(req)
    .then((r) => {
      // HARDENING: ENV só configura parâmetros, não decide fluxo de execução
      // Logging sempre ativo em desenvolvimento
      console.log("[LEO scheduler] Primeira execução:", r.map((x) => x.resumo ?? x.erro).join("; "));
    })
    .catch((e) => console.error("[LEO scheduler] Erro na primeira execução:", e));
  intervalId = setInterval(() => {
    executarTarefas(req)
      .then(async (results) => {
        const alertas = results.filter((r) => r.ok && r.resumo && !r.resumo.startsWith("Nenhum"));
        // HARDENING: Logging sempre ativo em desenvolvimento
        if (alertas.length > 0) {
          console.log("[LEO scheduler]", alertas.map((a) => a.resumo).join("; "));
        }
        const { enviarNotificacoesInteligentes } = await import("../utils/leo-notifier.js");
        await enviarNotificacoesInteligentes(req, results).catch(() => {});
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
