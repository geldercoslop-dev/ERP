/**
 * Serviço de roteiro de entrega: geração de roteiro (PDF/impressão) e dados para relatório.
 */
import * as logisticaService from "../../services/logistica.service.js";
import * as pdf from "../../infra/pdf/pdf.js";
export async function obterRoteiroPorCargaId(tenantId, cargaId) {
    const carga = await logisticaService.getCargaById(tenantId, cargaId);
    if (!carga)
        return null;
    const cargaObj = carga;
    const pedidos = cargaObj.pedidos ?? [];
    const itens = pedidos.map((p, idx) => {
        const row = p;
        return {
            ordem: Number(row.ordemEntrega ?? idx) + 1,
            pedidoNumero: Number(row.numero ?? 0),
            cliente: String(row.clienteNome ?? ""),
            valor: Number(row.total ?? 0),
            bairro: String(row.bairro ?? row.clienteBairro ?? ""),
            cidade: String(row.cidade ?? row.clienteCidade ?? cargaObj.cidadeRota ?? ""),
            vendedor: String(row.vendedorNome ?? ""),
            horarioPrevisto: row.horarioPrevisto ?? null,
            observacao: (row.observacao != null ? String(row.observacao) : row.observacoes != null ? String(row.observacoes) : null),
        };
    });
    const dataEntrega = cargaObj.dataEntrega
        ? new Date(cargaObj.dataEntrega).toLocaleDateString("pt-BR")
        : "";
    return {
        cidade: String(cargaObj.cidadeRota ?? ""),
        dataEntrega,
        itens,
    };
}
export async function gerarRoteiroPDF(tenantId, cargaId) {
    return await pdf.gerarRoteiroEntregaPDF(tenantId, cargaId);
}
