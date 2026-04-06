/**
 * Geração de relatórios em PDF para o ERP: boletos, romaneios, pedidos, estoque, vendas.
 * Todos os métodos exigem tenantId para isolamento multi-tenant.
 */
import { jsPDF } from "jspdf";
import * as db from "../../db/index.js";
import { getDb, clienteVendedores } from "../../db/index.js";
import { pedidos, itensPedido, produtos, clientes, contasReceber } from "../../../drizzle/schema.js";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import * as logisticaService from "../logistica.service.js";
import * as financeService from "../finance.service.js";
import * as ordersService from "../orders.service.js";
import * as inventoryService from "../inventory.service.js";
import { eq, and, inArray, asc, desc, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { ContaReceberStatus } from "../../shared/domain-status.js";
import type { ServiceActor } from "../../_core/service-actor.js";

/** Payload dinâmico de carga (retorno de getCargaById). */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asCargaRecord(carga: unknown): Record<string, unknown> {
  return isRecord(carga) ? carga : {};
}

function pedidosCargaLista(carga: Record<string, unknown>): Record<string, unknown>[] {
  const p = carga["pedidos"];
  if (!Array.isArray(p)) return [];
  return p.filter(isRecord);
}

type ClienteRowPdf = InferSelectModel<typeof clientes>;

const COLORS = {
  primary: [30, 58, 138] as [number, number, number], // Blue 900
  secondary: [71, 85, 105] as [number, number, number], // Slate 600
  accent: [220, 38, 38] as [number, number, number], // Red 600
  border: [226, 232, 240] as [number, number, number], // Slate 200
  bg: [248, 250, 252] as [number, number, number] // Slate 50
};

/**
 * FUNÇÃO AUXILIAR PARA CABEÇALHO PADRÃO
 */
function drawHeader(doc: jsPDF, title: string, subtitle?: string): number {
  const margin = 20;
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, margin, 25);
  
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, margin, 32);
  }
  
  doc.setTextColor(0, 0, 0);
  return 50; // Retorna a próxima posição Y
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  let yy = y;
  if (yy + need > 285) {
    doc.addPage();
    yy = 20;
  }
  return yy;
}

/**
 * GERAÇÃO DE BOLETO PADRONIZADO
 */
export async function gerarBoletoPDF(tenantId: number, boletoId: number): Promise<{ success: boolean; data?: string; error?: string }> {
  const db_conn = await db.getDb();
  if (!db_conn) return { success: false, error: "Database not available" };

  const result = await db_conn.select().from(db.contasReceber)
    .where(and(eq(db.contasReceber.tenantId, tenantId), eq(db.contasReceber.id, boletoId)))
    .limit(1);
    
  if (result.length === 0) return { success: false, error: "Boleto não encontrado" };
  const b = result[0];

  const dadosBanco = await db.getConfig("DADOS_BANCO") || "DADOS BANCÁRIOS NÃO CONFIGURADOS";
  const chavePix = await db.getConfig("CHAVE_PIX") || "PIX NÃO CONFIGURADO";

  const doc = new jsPDF();
  let y = drawHeader(doc, "BOLETO DE CONTROLE", `Pedido #${b.pedidoNumero || 'N/A'}`);

  const margin = 20;
  doc.setDrawColor(...COLORS.border);
  doc.setFillColor(...COLORS.bg);
  doc.rect(margin, y, 170, 30, 'F');
  
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.secondary);
  doc.text("CLIENTE", margin + 5, y + 8);
  doc.text("VENCIMENTO", margin + 120, y + 8);
  
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text(b.clienteNome.toUpperCase(), margin + 5, y + 18);
  doc.text(new Date(b.dataVencimento).toLocaleDateString('pt-BR'), margin + 120, y + 18);
  
  y += 40;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.secondary);
  doc.text("VALOR TOTAL A PAGAR", margin, y);
  y += 10;
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.primary);
  doc.text(`R$ ${parseFloat(b.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, margin, y);
  
  y += 20;
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, 190, y);
  y += 10;
  
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("INSTRUÇÕES PARA PAGAMENTO", margin, y);
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("1. Utilize a Chave PIX abaixo para realizar o pagamento.", margin, y);
  y += 6;
  doc.text(`2. IMPORTANTE: Informe o código ${b.id.toString().padStart(5, '0')} na descrição do PIX.`, margin, y);
  
  y += 15;
  doc.setFillColor(...COLORS.bg);
  doc.rect(margin, y, 170, 35, 'F');
  doc.setFont("helvetica", "bold");
  doc.text("CHAVE PIX:", margin + 5, y + 10);
  doc.setTextColor(...COLORS.accent);
  doc.text(chavePix, margin + 40, y + 10);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text("BANCO:", margin + 5, y + 20);
  const splitBanco = doc.splitTextToSize(dadosBanco, 120);
  doc.text(splitBanco, margin + 40, y + 20);

  return { success: true, data: doc.output("datauristring") };
}

/**
 * Extrato simples por cliente (boletos/vencimentos).
 */
export async function gerarExtratoClientePDF(tenantId: number, clienteId: number, vendedorId?: number): Promise<string> {
  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  const cliente = await db_conn.select({ nome: db.clientes.nome })
    .from(db.clientes)
    .where(and(eq(db.clientes.tenantId, tenantId), eq(db.clientes.id, clienteId)))
    .limit(1);
  const clienteNome = cliente[0]?.nome ?? `Cliente ${clienteId}`;

  const whereParts = [eq(db.boletos.tenantId, tenantId), eq(db.boletos.clienteId, clienteId)];
  if (vendedorId != null) whereParts.push(eq(db.boletos.vendedorId, vendedorId));

  const rows = await db_conn.select().from(db.boletos).where(and(...whereParts)).orderBy(desc(db.boletos.dataVencimento));

  const doc = new jsPDF();
  let y = drawHeader(doc, "EXTRATO DO CLIENTE", String(clienteNome).toUpperCase());
  const margin = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("BOLETOS / VENCIMENTOS", margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  if (!rows.length) {
    doc.setTextColor(...COLORS.secondary);
    doc.text("Nenhum boleto encontrado para este cliente.", margin, y);
    return doc.output("datauristring");
  }

  for (const r of rows) {
    y = ensureSpace(doc, y, 8);
    const venc = r.dataVencimento ? new Date(r.dataVencimento).toLocaleDateString("pt-BR") : "-";
    const linha = `Pedido #${r.numeroPedido} • Venc: ${venc} • Status: ${String(r.status)} • Em aberto: R$ ${Number(r.valorAberto).toFixed(2)}`;
    doc.text(linha, margin, y);
    y += 6;
  }

  return doc.output("datauristring");
}

/**
 * Gera o PDF do boleto em bytes (para ZIP / download binário).
 */
export async function gerarBoletoPDFBytes(tenantId: number, boletoId: number): Promise<{ success: boolean; data?: Uint8Array; error?: string }> {
  const db_conn = await db.getDb();
  if (!db_conn) return { success: false, error: "Database not available" };

  const result = await db_conn.select().from(db.contasReceber)
    .where(and(eq(db.contasReceber.tenantId, tenantId), eq(db.contasReceber.id, boletoId)))
    .limit(1);
  if (result.length === 0) return { success: false, error: "Boleto não encontrado" };
  const b = result[0];

  const dadosBanco = await db.getConfig("DADOS_BANCO") || "DADOS BANCÁRIOS NÃO CONFIGURADOS";
  const chavePix = await db.getConfig("CHAVE_PIX") || "PIX NÃO CONFIGURADO";

  const doc = new jsPDF();
  let y = drawHeader(doc, "BOLETO DE CONTROLE", `Pedido #${b.pedidoNumero || 'N/A'}`);

  const margin = 20;
  doc.setDrawColor(...COLORS.border);
  doc.setFillColor(...COLORS.bg);
  doc.rect(margin, y, 170, 30, 'F');

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.secondary);
  doc.text("CLIENTE", margin + 5, y + 8);
  doc.text("VENCIMENTO", margin + 120, y + 8);

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text(String(b.clienteNome).toUpperCase(), margin + 5, y + 18);
  doc.text(new Date(b.dataVencimento).toLocaleDateString('pt-BR'), margin + 120, y + 18);
  y += 40;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.secondary);
  doc.text("VALOR TOTAL A PAGAR", margin, y);
  y += 10;
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.primary);
  doc.text(`R$ ${parseFloat(String(b.valor)).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, margin, y);
  y += 20;

  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, 190, y);
  y += 10;

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("INSTRUÇÕES PARA PAGAMENTO", margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("1. Utilize a Chave PIX abaixo para realizar o pagamento.", margin, y);
  y += 6;
  doc.text(`2. Informe o código ${String(b.id).padStart(5, '0')} na descrição do PIX.`, margin, y);
  y += 15;

  doc.setFillColor(...COLORS.bg);
  doc.rect(margin, y, 170, 35, 'F');
  doc.setFont("helvetica", "bold");
  doc.text("CHAVE PIX:", margin + 5, y + 10);
  doc.setTextColor(...COLORS.accent);
  doc.text(chavePix, margin + 40, y + 10);

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.text("BANCO:", margin + 5, y + 20);
  const splitBanco = doc.splitTextToSize(dadosBanco, 120);
  doc.text(splitBanco, margin + 40, y + 20);

  const ab = doc.output('arraybuffer');
  return { success: true, data: new Uint8Array(ab) };
}

/**
 * GERAÇÃO DE ROMANEIO (CARGA)
 */
export async function gerarRomaneioPDF(tenantId: number, cargaId: number): Promise<string> {
  const carga = await logisticaService.getCargaById(tenantId, cargaId);
  if (!carga) throw new Error('Carga não encontrada');

  const cr = asCargaRecord(carga);
  const doc = new jsPDF();
  const numero = String(cr["numero"] ?? "").padStart(4, "0");
  const cidade = String(cr["cidadeRota"] ?? "").toUpperCase();
  const de = cr["dataEntrega"];
  const dataEntrega =
    de instanceof Date ? de : typeof de === "string" || typeof de === "number" ? new Date(de) : new Date();
  const dataStr = dataEntrega.toLocaleDateString('pt-BR');

  let y = drawHeader(doc, 'ROMANEIO DE ENTREGA', `CARGA #${numero} • ${cidade} • ${dataStr}`);

  const margin = 12;
  const pageW = 210;
  const usableW = pageW - margin * 2;
  const col = { pedido: 16, cliente: 58, tel: 26, vend: 32, pag: 34, valor: 16, obs: usableW - (16+58+26+32+34+16) };
  const x0 = margin;
  const headerH = 8;
  y += 6;

  function drawTableHeader() {
    doc.setFillColor(...COLORS.border);
    doc.rect(x0, y, usableW, headerH, 'F');
    doc.setTextColor(0,0,0);
    doc.setFontSize(9);
    let x = x0 + 2;
    doc.text('PED', x, y + 5.5); x += col.pedido;
    doc.text('CLIENTE', x, y + 5.5); x += col.cliente;
    doc.text('TEL', x, y + 5.5); x += col.tel;
    doc.text('VEND', x, y + 5.5); x += col.vend;
    doc.text('PAGTO', x, y + 5.5); x += col.pag;
    doc.text('R$', x, y + 5.5); x += col.valor;
    doc.text('OBS', x, y + 5.5);
    y += headerH;
  }

  drawTableHeader();

  const itens = pedidosCargaLista(cr);
  itens.sort((a, b) =>
    String(a["clienteNome"] ?? "").localeCompare(String(b["clienteNome"] ?? ""), "pt-BR")
  );

  let zebra = false;
  for (const p of itens) {
    y = ensureSpace(doc, y, 10);
    const rowH = 9;
    if (zebra) {
      doc.setFillColor(...COLORS.bg);
      doc.rect(x0, y, usableW, rowH, 'F');
    }
    zebra = !zebra;
    doc.setFontSize(9);
    doc.setTextColor(0,0,0);
    let x = x0 + 2;
    doc.text(String(p["numero"] ?? ""), x, y + 5.8); x += col.pedido;
    doc.text(String(p["clienteNome"] ?? "").slice(0, 30), x, y + 5.8); x += col.cliente;
    doc.text(String(p["clienteTelefone"] ?? "").slice(0, 14), x, y + 5.8); x += col.tel;
    doc.text(String(p["vendedorNome"] ?? "").slice(0, 18), x, y + 5.8); x += col.vend;
    doc.text(String(p["formaPagamento"] ?? "").slice(0, 18), x, y + 5.8); x += col.pag;
    doc.text(Number(p["total"] ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), x, y + 5.8); x += col.valor;
    doc.text(String(p["observacoes"] ?? "").slice(0, 28), x, y + 5.8);
    y += rowH;
  }

  y += 10;
  const total = itens.reduce((acc, p) => acc + Number(p["total"] ?? 0), 0);
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.primary);
  doc.text(`TOTAL DA CARGA: R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, x0, y);

  return doc.output('datauristring');
}

/**
 * GERAÇÃO DE ROTEIRO DE ENTREGA (Logística)
 */
export async function gerarRoteiroEntregaPDF(tenantId: number, cargaId: number): Promise<string> {
  const carga = await logisticaService.getCargaById(tenantId, cargaId);
  if (!carga) throw new Error('Carga não encontrada');

  const cr = asCargaRecord(carga);
  const doc = new jsPDF({ orientation: 'landscape' });
  const numero = String(cr["numero"] ?? "").padStart(4, "0");
  const cidade = String(cr["cidadeRota"] ?? "").toUpperCase();
  const deR = cr["dataEntrega"];
  const dataEntrega =
    deR instanceof Date ? deR : typeof deR === "string" || typeof deR === "number" ? new Date(deR) : new Date();
  const dataStr = dataEntrega.toLocaleDateString('pt-BR');

  let y = drawHeader(doc, 'ROTEIRO DE ENTREGA', `${cidade} • ${dataStr}`);

  const margin = 12;
  const pageW = 297;
  const usableW = pageW - margin * 2;
  const col = { ordem: 10, pedido: 14, cliente: 42, valor: 18, bairro: 28, cidade: 24, vendedor: 22, horario: 16, obs: usableW - (10+14+42+18+28+24+22+16) };
  const x0 = margin;
  const headerH = 8;
  y += 6;

  function drawTableHeader() {
    doc.setFillColor(...COLORS.border);
    doc.rect(x0, y, usableW, headerH, 'F');
    doc.setTextColor(0,0,0);
    doc.setFontSize(8);
    let x = x0 + 2;
    doc.text('ORD', x, y + 5.5); x += col.ordem;
    doc.text('PED', x, y + 5.5); x += col.pedido;
    doc.text('CLIENTE', x, y + 5.5); x += col.cliente;
    doc.text('VALOR', x, y + 5.5); x += col.valor;
    doc.text('BAIRRO', x, y + 5.5); x += col.bairro;
    doc.text('CIDADE', x, y + 5.5); x += col.cidade;
    doc.text('VEND', x, y + 5.5); x += col.vendedor;
    doc.text('HORÁRIO', x, y + 5.5); x += col.horario;
    doc.text('OBS', x, y + 5.5);
    y += headerH;
  }

  drawTableHeader();

  const itens = pedidosCargaLista(cr);
  itens.sort((a, b) => Number(a["ordemEntrega"] ?? 999) - Number(b["ordemEntrega"] ?? 999));

  let zebra = false;
  for (const p of itens) {
    y = ensureSpace(doc, y, 10);
    const rowH = 8;
    if (zebra) {
      doc.setFillColor(...COLORS.bg);
      doc.rect(x0, y, usableW, rowH, 'F');
    }
    zebra = !zebra;
    doc.setFontSize(8);
    let x = x0 + 2;
    doc.text(String(Number(p["ordemEntrega"] ?? 0) + 1), x, y + 5.5); x += col.ordem;
    doc.text(String(p["numero"] ?? ""), x, y + 5.5); x += col.pedido;
    doc.text(String(p["clienteNome"] ?? "").slice(0, 22), x, y + 5.5); x += col.cliente;
    doc.text(Number(p["total"] ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), x, y + 5.5); x += col.valor;
    doc.text(String(p["bairro"] ?? p["clienteBairro"] ?? "").slice(0, 16), x, y + 5.5); x += col.bairro;
    doc.text(String(p["cidade"] ?? p["clienteCidade"] ?? "").slice(0, 14), x, y + 5.5); x += col.cidade;
    doc.text(String(p["vendedorNome"] ?? "").slice(0, 12), x, y + 5.5); x += col.vendedor;
    doc.text(String(p["horarioPrevisto"] ?? "-"), x, y + 5.5); x += col.horario;
    doc.text(String(p["observacao"] ?? p["observacoes"] ?? "").slice(0, 35), x, y + 5.5);
    y += rowH;
  }

  return doc.output('datauristring');
}

/**
 * GERAÇÃO DE ZIP COM BOLETOS
 */
export async function gerarZipBoletos(tenantId: number, params: { boletoIds: number[]; pedidoNumero: number; clienteNome: string; }): Promise<{ fileName: string; base64: string; }> {
  const { boletoIds, pedidoNumero, clienteNome } = params;
  if (!boletoIds.length) throw new Error('Nenhum boleto para gerar ZIP');

  const safeCliente = String(clienteNome || 'CLIENTE').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
  const fileName = `BOLETOS_PED-${String(pedidoNumero).padStart(4, '0')}_${safeCliente}.zip`;

  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (c) => chunks.push(Buffer.from(c)));

  archive.pipe(stream);

  for (const [i, id] of Array.from(boletoIds.entries())) {
    const pdfBytes = await gerarBoletoPDFBytes(tenantId, id);
    if (!pdfBytes.success || !pdfBytes.data) {
      throw new Error(pdfBytes.error ?? `Falha ao gerar PDF do boleto ${id}`);
    }
    const pdfName = `BOLETO_${String(i + 1).padStart(2, '0')}_ID-${id}.pdf`;
    archive.append(Buffer.from(pdfBytes.data), { name: pdfName });
  }

  await archive.finalize();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    archive.on('error', reject);
  });

  const zipBuffer = Buffer.concat(chunks);
  return { fileName, base64: zipBuffer.toString('base64') };
}

/**
 * GERAÇÃO DE RELATÓRIO DE ESTOQUE
 */
export async function gerarEstoquePDF(tenantId: number): Promise<{ dataUri: string; nomeArquivo: string }> {
  const items = await inventoryService.getAllProdutos(tenantId);
  const doc = new jsPDF();
  const hoje = new Date().toLocaleDateString("pt-BR");
  let y = drawHeader(doc, "Relatório de Estoque", `Gerado em ${hoje}`);
  const margin = 20;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Descrição", margin, y);
  doc.text("Marca", margin + 80, y);
  doc.text("Estoque", margin + 140, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  for (const r of items) {
    y = ensureSpace(doc, y, 8);
    doc.text(String(r.descricao ?? "").slice(0, 45), margin, y);
    doc.text(String(r.marca ?? "-").slice(0, 20), margin + 80, y);
    doc.text(String(r.estoque ?? 0), margin + 140, y);
    y += 8;
  }
  return { dataUri: doc.output("datauristring"), nomeArquivo: `estoque_${hoje.replace(/\//g, "-")}.pdf` };
}

/**
 * GERAÇÃO DE RELATÓRIO DE VENDAS
 */
export async function gerarVendasPDF(tenantId: number, params: { dataInicio: Date, dataFim: Date }): Promise<{ dataUri: string; nomeArquivo: string }> {
  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  const vendas = await db_conn.select({
    data: sql<string>`DATE(${db.pedidos.createdAt})`,
    quantidade: sql<number>`COUNT(*)`,
    valor: sql<number>`SUM(${db.pedidos.total})`
  })
  .from(db.pedidos)
  .where(and(
    eq(db.pedidos.tenantId, tenantId),
    sql`${db.pedidos.createdAt} >= ${params.dataInicio}`,
    sql`${db.pedidos.createdAt} <= ${params.dataFim}`
  ))
  .groupBy(sql`DATE(${db.pedidos.createdAt})`)
  .orderBy(asc(sql`DATE(${db.pedidos.createdAt})`));

  const doc = new jsPDF();
  const hoje = new Date().toLocaleDateString("pt-BR");
  let y = drawHeader(doc, "Relatório de Vendas", `Período: ${params.dataInicio.toLocaleDateString()} a ${params.dataFim.toLocaleDateString()}`);
  const margin = 20;

  const totalPedidos = vendas.reduce((acc: number, v: { quantidade: number }) => acc + Number(v.quantidade), 0);
  const totalValor = vendas.reduce((acc: number, v: { valor: number }) => acc + Number(v.valor), 0);

  doc.setFontSize(11);
  doc.text(`Total de pedidos: ${totalPedidos}`, margin, y);
  y += 8;
  doc.text(`Valor total: R$ ${totalValor.toFixed(2).replace(".", ",")}`, margin, y);
  y += 15;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Data", margin, y);
  doc.text("Qtd", margin + 40, y);
  doc.text("Valor", margin + 80, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  for (const item of vendas) {
    y = ensureSpace(doc, y, 8);
    doc.text(String(item.data), margin, y);
    doc.text(String(item.quantidade), margin + 40, y);
    doc.text(`R$ ${Number(item.valor).toFixed(2)}`, margin + 80, y);
    y += 8;
  }

  return { dataUri: doc.output("datauristring"), nomeArquivo: `vendas_${hoje.replace(/\//g, "-")}.pdf` };
}

/**
 * GERAÇÃO DO PEDIDO (para impressão do motorista)
 */
export async function gerarPedidoPDF(tenantId: number, pedidoId: number): Promise<string> {
  const p = await ordersService.getPedidoById(tenantId, pedidoId);
  if (!p) throw new Error('Pedido não encontrado');

  const itens = await ordersService.getItensPedido(tenantId, pedidoId);

  const doc = new jsPDF();
  let y = drawHeader(doc, 'PEDIDO', `PED-${String(p.numero).padStart(4, '0')} • ${new Date(p.createdAt || Date.now()).toLocaleDateString('pt-BR')}`);
  const margin = 20;

  // Cliente + Endereço
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('CLIENTE', margin, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(String(p.clienteNome || '').toUpperCase(), margin, y);
  y += 6;
  const tel1 = p.clienteTelefone ? String(p.clienteTelefone) : '';
  const tel2 = p.clienteTelefoneRecado ? String(p.clienteTelefoneRecado) : '';
  const linhaTel = [tel1 && `Cel: ${tel1}`, tel2 && `Recado: ${tel2}`].filter(Boolean).join(' • ');
  if (linhaTel) {
    doc.setTextColor(...COLORS.secondary);
    doc.text(linhaTel, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  const endereco = [
    p.clienteRua ? String(p.clienteRua) : '',
    p.clienteNumero ? `nº ${String(p.clienteNumero)}` : '',
    p.clienteBairro ? String(p.clienteBairro) : '',
    p.clienteCidade ? String(p.clienteCidade) : '',
    p.clienteUf ? String(p.clienteUf) : '',
  ].filter(Boolean).join(' • ');
  if (endereco) {
    doc.text(endereco, margin, y);
    y += 6;
  }
  
  y += 10;

  // Itens
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ITENS DO PEDIDO', margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.secondary);
  doc.text('QTD', margin, y);
  doc.text('DESCRIÇÃO', margin + 18, y);
  doc.text('UNIT', 150, y, { align: 'right' });
  doc.text('TOTAL', 190, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 4;
  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, 190, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  for (const it of itens) {
    y = ensureSpace(doc, y, 10);
    const qtd = String(it.quantidade);
    const desc = String(it.descricao || '').toUpperCase();
    const unit = Number(it.valorUnitario || 0);
    const tot = unit * Number(it.quantidade || 0);
    const descLines = doc.splitTextToSize(desc, 115);
    doc.text(qtd, margin, y);
    doc.text(descLines, margin + 18, y);
    doc.text(`R$ ${unit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 150, y, { align: 'right' });
    doc.text(`R$ ${tot.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 190, y, { align: 'right' });
    y += Math.max(6, descLines.length * 5);
  }

  // Totais
  y += 4;
  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, 190, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL: R$ ${Number(p.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 190, y, { align: 'right' });

  return doc.output('datauristring');
}

/**
 * GERAÇÃO DE PDF AGRUPADO (CARGA OU CLIENTE ESPECÍFICO)
 */
export async function gerarBoletosCargaPDF(tenantId: number, cargaId: number, pedidoNumero?: number): Promise<string> {
  const carga = await logisticaService.getCargaById(tenantId, cargaId);
  if (!carga) throw new Error("Carga não encontrada");

  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  const cr = asCargaRecord(carga);
  const pedidosFiltro = pedidoNumero
    ? [pedidoNumero]
    : pedidosCargaLista(cr)
        .map((p) => Number(p["numero"]))
        .filter((n) => typeof n === "number" && Number.isFinite(n));

  const boletos = await db_conn.select().from(db.contasReceber)
    .where(and(
      eq(db.contasReceber.tenantId, tenantId),
      inArray(db.contasReceber.pedidoNumero, pedidosFiltro),
      eq(db.contasReceber.formaPagamento, 'BOLETO'),
      eq(db.contasReceber.status, ContaReceberStatus.PENDENTE)
    ));

  if (boletos.length === 0) throw new Error("Nenhum boleto encontrado.");

  const doc = new jsPDF();
  const dadosBanco = await db.getConfig("DADOS_BANCO") || "DADOS BANCÁRIOS NÃO CONFIGURADOS";
  const chavePix = await db.getConfig("CHAVE_PIX") || "PIX NÃO CONFIGURADO";

  for (let i = 0; i < boletos.length; i++) {
    const b = boletos[i];
    if (i > 0) doc.addPage();

    let y = drawHeader(doc, "BOLETO DE COBRANÇA", `Pedido #${b.pedidoNumero}`);
    const margin = 20;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(b.clienteNome.toUpperCase(), margin, y);
    doc.text(`VENCIMENTO: ${new Date(b.dataVencimento).toLocaleDateString('pt-BR')}`, 130, y);
    y += 15;

    doc.setFontSize(20);
    doc.setTextColor(...COLORS.primary);
    doc.text(`VALOR: R$ ${parseFloat(b.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, margin, y);
    
    y += 20;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PAGAMENTO VIA PIX:", margin, y);
    doc.setTextColor(...COLORS.accent);
    doc.text(chavePix, margin + 45, y);
    
    y += 10;
    doc.setTextColor(0, 0, 0);
    doc.text("IDENTIFICAÇÃO:", margin, y);
    doc.text(b.id.toString().padStart(5, '0'), margin + 45, y);
    
    y += 15;
    doc.setFont("helvetica", "normal");
    const splitBanco = doc.splitTextToSize(dadosBanco, 160);
    doc.text(splitBanco, margin, y);
  }

  return doc.output("datauristring");
}

/**
 * GERAÇÃO DE RELATÓRIO LEO (AI Assistant)
 */
export async function gerarRelatorioLeoPDF(
  tenantId: number,
  tipo: 'estoque' | 'vendas' | 'clientes',
  actor?: ServiceActor
): Promise<{ dataUri: string; nomeArquivo: string }> {
  if (!tenantId || tenantId <= 0) {
    throw new Error("tenantId é obrigatório para relatório LEO");
  }
  
  switch (tipo) {
    case 'estoque':
      return await gerarEstoquePDF(tenantId);
    case 'vendas':
      const dataFim = new Date();
      const dataInicio = new Date(dataFim.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      return await gerarVendasPDF(tenantId, { dataInicio, dataFim });
    case 'clientes':
      // For now, return a simple clientes report
      const db_conn = await db.getDb();
      if (!db_conn) throw new Error("Database not available");
      
      // ✅ HARDENING: Filtrar por ownership (userId ou admin)
      let clientesList;
      if (actor?.role === 'vendedor' && actor?.userId) {
        // Vendedor: apenas seus clientes via clienteVendedores
        const clienteVendedorIds = await db_conn.select({ clienteId: clienteVendedores.clienteId })
          .from(clienteVendedores)
          .where(and(
            eq(clienteVendedores.vendedorId, actor.vendedorId || 0)
          ));
        
        const clienteIds = clienteVendedorIds.map(cv => cv.clienteId);
        
        clientesList = await db_conn.select().from(clientes)
          .where(and(
            eq(clientes.tenantId, tenantId),
            inArray(clientes.id, clienteIds)
          ))
          .limit(1000);
      } else {
        // Admin: todos os clientes do tenant
        clientesList = await db_conn.select().from(clientes)
          .where(eq(clientes.tenantId, tenantId))
          .limit(1000);
      }
      const doc = new jsPDF();
      const hoje = new Date().toLocaleDateString("pt-BR");
      
      doc.setFontSize(16);
      doc.text(`Relatório de Clientes - ${hoje}`, 20, 20);
      
      doc.setFontSize(10);
      let y = 40;
      clientesList.forEach((c: ClienteRowPdf) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(`${c.nome} - ${c.telefone || 'N/A'}`, 20, y);
        y += 10;
      });
      
      const dataUri = doc.output('datauristring');
      return { dataUri, nomeArquivo: `relatorio_clientes_${hoje.replace(/\//g, '-')}.pdf` };
    default:
      throw new Error(`Tipo de relatório não suportado: ${tipo}`);
  }
}

/**
 * GERAÇÃO DE RELATÓRIO FINANCEIRO PADRONIZADO
 */
export async function gerarRelatorioFinanceiroPDF(tenantId: number, tipo: 'PAGAR' | 'RECEBER', mesAno: string): Promise<string> {
  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  const doc = new jsPDF();
  let y = drawHeader(doc, `RELATÓRIO DE CONTAS A ${tipo}`, `Mês Referência: ${mesAno}`);
  const margin = 20;

  doc.setFillColor(...COLORS.bg);
  doc.rect(margin, y, 170, 10, 'F');
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("DATA/VENC", margin + 2, y + 7);
  doc.text("DESCRIÇÃO / FORNECEDOR", margin + 30, y + 7);
  doc.text("VALOR", margin + 130, y + 7);
  doc.text("STATUS", margin + 155, y + 7);
  
  y += 15;
  doc.setFont("helvetica", "normal");

  const table = tipo === 'RECEBER' ? db.contasReceber : db.contasPagar;
  const dados = await db_conn.select().from(table)
    .where(eq(table.tenantId, tenantId))
    .limit(100);

  let total = 0;
  for (const item of dados) {
    y = ensureSpace(doc, y, 10);
    
    const data = new Date(item.dataVencimento).toLocaleDateString('pt-BR');
    const desc =
      tipo === "RECEBER"
        ? "clienteNome" in item && item.clienteNome != null
          ? String(item.clienteNome)
          : "S/D"
        : "fornecedor" in item && item.fornecedor != null
          ? String(item.fornecedor)
          : "S/D";
    const valor = parseFloat(String(item.valor));
    const status = String(item.status ?? "");

    doc.text(data, margin + 2, y);
    doc.text(desc.substring(0, 35).toUpperCase(), margin + 30, y);
    doc.text(valor.toLocaleString('pt-BR', {minimumFractionDigits: 2}), margin + 130, y);
    doc.text(status, margin + 155, y);
    
    total += valor;
    y += 8;
    doc.setDrawColor(...COLORS.border);
    doc.line(margin, y - 2, 190, y - 2);
  }

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`TOTAL: R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, 110, y);

  return doc.output("datauristring");
}
