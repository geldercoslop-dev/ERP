/**
 * Serviço de cargas para o módulo de logística.
 * Encapsula criação, listagem e atualização de cargas (sem alterar regras de negócio do ERP).
 */
import * as logisticsService from "../../services/logistica.service.js";
import { ValidationError } from '../../_core/errors/typed-errors.js';
import { toDbDateStrict } from '../../utils/date.js';
export async function listarCargas(tenantId) {
    return await logisticsService.listCargas(tenantId);
}
export async function obterCargaPorId(tenantId, id) {
    return await logisticsService.getCargaById(tenantId, id);
}
export async function criarCarga(tenantId, data) {
    return await logisticsService.createCarga(tenantId, {
        numero: 0, // Valor padrão, será gerado pelo serviço
        status: 'ABERTA',
        dataEntrega: toDbDateStrict(data.dataEntrega)
    });
}
export async function atualizarPedidosDaCarga(tenantId, cargaId, changes) {
    let result = null;
    if (changes.addIds && changes.addIds.length > 0) {
        result = await logisticsService.addPedidosToCarga(tenantId, cargaId, changes.addIds);
    }
    if (changes.removeIds && changes.removeIds.length > 0) {
        result = await logisticsService.removePedidosFromCarga(tenantId, cargaId, changes.removeIds);
    }
    return result;
}
export async function fecharCarga(tenantId, cargaId) {
    return await logisticsService.updateCargaStatus(tenantId, { id: cargaId, status: 'EM_ROTA' });
}
export async function finalizarCarga(tenantId, cargaId) {
    return await logisticsService.finalizarCarga(tenantId, cargaId);
}
export async function gerarRelatorioViagemPDF(tenantId, cargaId) {
    // This function might not exist in the service yet, return placeholder
    throw new ValidationError('Função não implementada no serviço de logística');
}
export async function atualizarOrdemEntrega(tenantId, cargaId, itens) {
    // Update each item individually since there's no batch update function
    for (const item of itens) {
        await logisticsService.updatePedidoCarga(tenantId, item.pedidoCargaId, { ordemEntrega: item.ordemEntrega });
    }
    return { success: true };
}
export async function atualizarHorarioPrevisto(tenantId, pedidoCargaId, horarioPrevisto) {
    return await logisticsService.updatePedidoCarga(tenantId, pedidoCargaId, { horarioPrevisto: horarioPrevisto || undefined });
}
export async function atualizarPedidoCargaCampos(tenantId, pedidoCargaId, data) {
    return await logisticsService.updatePedidoCarga(tenantId, pedidoCargaId, {
        observacao: data.observacao || undefined
    });
}
