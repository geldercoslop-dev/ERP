/**
 * Módulo de PDF para pedido de compra e roteiro.
 * Pedido de compra: gera PDF a partir dos itens agregados.
 * Roteiro: delega para o serviço de relatórios.
 */
import { jsPDF } from "jspdf";
import * as reportsPdf from "../../services/reports/pdf.service";

export interface ItemPedidoCompra {
  fornecedor: string | null;
  produtoId: number;
  descricao: string;
  marca: string | null;
  quantidade: number;
  qtdPedidos: number;
}

export async function gerarPedidoCompraPDF(params: { itens: ItemPedidoCompra[] }): Promise<string> {
  const doc = new jsPDF();
  const margin = 20;
  let y = 20;
  doc.setFontSize(14);
  doc.text("Pedido de Compra", margin, y);
  y += 10;
  doc.setFontSize(9);
  doc.text("Fornecedor", margin, y);
  doc.text("Descrição", margin + 50, y);
  doc.text("Marca", margin + 110, y);
  doc.text("Qtd", margin + 145, y);
  doc.text("Pedidos", margin + 165, y);
  y += 8;
  for (const r of params.itens) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(r.fornecedor ?? "-").slice(0, 22), margin, y);
    doc.text(String(r.descricao ?? "").slice(0, 35), margin + 50, y);
    doc.text(String(r.marca ?? "-").slice(0, 15), margin + 110, y);
    doc.text(String(r.quantidade), margin + 145, y);
    doc.text(String(r.qtdPedidos), margin + 165, y);
    y += 7;
  }
  return doc.output("datauristring");
}

/** Roteiro de entrega (multi-tenant). */
export async function gerarRoteiroEntregaPDF(tenantId: number, cargaId: number): Promise<string> {
  return reportsPdf.gerarRoteiroEntregaPDF(tenantId, cargaId);
}
