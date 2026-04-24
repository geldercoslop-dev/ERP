/**
 * Serviço de histórico de rotas: gravação e consulta para relatórios e aprendizado do LEO.
 */
import * as logisticaService from "../../services/logistica.service.js";
export async function registrarEntregaNoHistorico(tenantId, registro) {
    return await logisticaService.insertHistoricoRota(tenantId, registro);
}
export async function listarHistoricoRotas(tenantId, filtros) {
    return await logisticaService.listHistoricoRotas(tenantId, filtros);
}
export async function ultimaCargaPorCidade(tenantId, cidade) {
    const cargas = await logisticaService.listCargas(tenantId);
    const list = Array.isArray(cargas) ? cargas : [];
    const filtradas = list.filter((c) => (String(c.cidadeRota ?? "").toLowerCase()) === cidade.toLowerCase());
    if (filtradas.length === 0)
        return null;
    filtradas.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return filtradas[0];
}
export async function cargasPorPeriodo(tenantId, dataInicio, dataFim) {
    const cargas = await logisticaService.listCargas(tenantId);
    const list = Array.isArray(cargas) ? cargas : [];
    return list.filter((c) => {
        const d = c.dataEntrega ? new Date(c.dataEntrega) : new Date(c.createdAt || 0);
        return d >= dataInicio && d <= dataFim;
    });
}
