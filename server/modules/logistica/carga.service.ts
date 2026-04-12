/**
 * Serviço de cargas para o módulo de logística.
 * Encapsula criação, listagem e atualização de cargas (sem alterar regras de negócio do ERP).
 */
import * as logisticsService from "../../services/logistica.service.js";

export type CargaStatus = "ABERTA" | "EM_ROTA" | "ENTREGUE";

export async function listarCargas(tenantId: number): Promise<unknown> {
  return await logisticsService.listCargas(tenantId);
}

export async function obterCargaPorId(tenantId: number, id: number): Promise<unknown> {
  return await logisticsService.getCargaById(tenantId, id);
}

export async function criarCarga(tenantId: number, data: { cidadeRota: string; dataEntrega: Date }): Promise<unknown> {
  return await logisticsService.createCarga(tenantId, {
    numero: 0, // Valor padrão, será gerado pelo serviço
    status: 'ABERTA',
    dataEntrega: data.dataEntrega
  });
}

export async function atualizarPedidosDaCarga(tenantId: number, cargaId: number, changes: { addIds?: number[]; removeIds?: number[] }): Promise<unknown> {
  let result: unknown = null;
  if (changes.addIds && changes.addIds.length > 0) {
    result = await logisticsService.addPedidosToCarga(tenantId, cargaId, changes.addIds);
  }
  if (changes.removeIds && changes.removeIds.length > 0) {
    result = await logisticsService.removePedidosFromCarga(tenantId, cargaId, changes.removeIds);
  }
  return result;
}

export async function fecharCarga(tenantId: number, cargaId: number): Promise<unknown> {
  return await logisticsService.updateCargaStatus(tenantId, { id: cargaId, status: 'EM_ROTA' });
}

export async function finalizarCarga(tenantId: number, cargaId: number): Promise<unknown> {
  return await logisticsService.finalizarCarga(tenantId, cargaId);
}

export async function gerarRelatorioViagemPDF(tenantId: number, cargaId: number): Promise<unknown> {
  // This function might not exist in the service yet, return placeholder
  throw new Error('Função não implementada no serviço de logística');
}

export async function atualizarOrdemEntrega(tenantId: number, cargaId: number, itens: { pedidoCargaId: number; ordemEntrega: number }[]): Promise<unknown> {
  // Update each item individually since there's no batch update function
  for (const item of itens) {
    await logisticsService.updatePedidoCarga(tenantId, item.pedidoCargaId, { ordemEntrega: item.ordemEntrega });
  }
  return { success: true };
}

export async function atualizarHorarioPrevisto(tenantId: number, pedidoCargaId: number, horarioPrevisto: string | null): Promise<unknown> {
  return await logisticsService.updatePedidoCarga(tenantId, pedidoCargaId, { horarioPrevisto: horarioPrevisto || undefined });
}

export async function atualizarPedidoCargaCampos(
  tenantId: number,
  pedidoCargaId: number,
  data: { observacao?: string | null; bairro?: string | null; cidade?: string | null }
) {
  return await logisticsService.updatePedidoCarga(tenantId, pedidoCargaId, {
    observacao: data.observacao || undefined
  });
}
