/**
 * Serviço de roteiro de entrega: geração de roteiro (PDF/impressão) e dados para relatório.
 */
import * as logisticaService from "../../services/logistica.service";
import * as pdf from "../../infra/pdf/pdf";

export interface ItemRoteiro {
  ordem: number;
  pedidoNumero: number;
  cliente: string;
  valor: number;
  bairro: string;
  cidade: string;
  vendedor: string;
  horarioPrevisto: string | null;
  observacao: string | null;
}

export async function obterRoteiroPorCargaId(tenantId: number, cargaId: number): Promise<{ cidade: string; dataEntrega: string; itens: ItemRoteiro[] } | null> {
  const carga = await logisticaService.getCargaById(tenantId, cargaId);
  if (!carga) return null;

  const cargaObj = carga as Record<string, unknown>;
  const pedidos = (cargaObj.pedidos as unknown[]) ?? [];
  const itens: ItemRoteiro[] = pedidos.map((p: unknown, idx: number) => {
    const row = p as Record<string, unknown>;
    return {
      ordem: Number(row.ordemEntrega ?? idx) + 1,
      pedidoNumero: Number(row.numero ?? 0),
      cliente: String(row.clienteNome ?? ""),
      valor: Number(row.total ?? 0),
      bairro: String(row.bairro ?? row.clienteBairro ?? ""),
      cidade: String(row.cidade ?? row.clienteCidade ?? cargaObj.cidadeRota ?? ""),
      vendedor: String(row.vendedorNome ?? ""),
      horarioPrevisto: (row.horarioPrevisto as string) ?? null,
      observacao: (row.observacao != null ? String(row.observacao) : row.observacoes != null ? String(row.observacoes) : null),
    };
  });

  const dataEntrega = cargaObj.dataEntrega
    ? new Date(cargaObj.dataEntrega as string).toLocaleDateString("pt-BR")
    : "";

  return {
    cidade: String(cargaObj.cidadeRota ?? ""),
    dataEntrega,
    itens,
  };
}

export async function gerarRoteiroPDF(tenantId: number, cargaId: number): Promise<string> {
  return await pdf.gerarRoteiroEntregaPDF(tenantId, cargaId);
}
