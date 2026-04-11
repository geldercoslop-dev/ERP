import { jsPDF } from "jspdf";
import * as db from "./db/index.js";
import { eq, and, inArray } from "./db/index.js";
import archiver from "archiver";
import { PassThrough } from "node:stream";

/**
 * PADRÃO VISUAL DO SISTEMA (Cores e Estilos)
 */
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
function drawHeader(doc: jsPDF, title: string, subtitle?: string) {
  const margin = 20;
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(title, margin, 25);
  
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, margin, 32);
  }
  
  doc.setTextColor(0, 0, 0);
  return 50; // Retorna a próxima posição Y
}

/**
 * GERAÇÃO DE BOLETO PADRONIZADO
 */
export async function gerarBoletoPDF(boletoId: number) {
  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  const boleto = await db_conn.select().from(db.contasReceber).where(eq(db.contasReceber.id, boletoId)).limit(1);
  if (boleto.length === 0) throw new Error("Boleto não encontrado");
  const b = boleto[0];

  const dadosBanco = await db.getConfig("DADOS_BANCO") || "DADOS BANCÁRIOS NÃO CONFIGURADOS";
  const chavePix = await db.getConfig("CHAVE_PIX") || "PIX NÃO CONFIGURADO";

  const doc = new jsPDF();
  let y = drawHeader(doc, "BOLETO DE CONTROLE", `Pedido #${b.pedidoNumero || 'N/A'}`);

  const margin = 20;
  
  // Quadro de Informações Principais
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

  // Valor em Destaque
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.secondary);
  doc.text("VALOR TOTAL A PAGAR", margin, y);
  y += 10;
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.primary);
  doc.text(`R$ ${parseFloat(b.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, margin, y);
  
  y += 20;

  // Instruções de Pagamento
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
  
  // Dados Bancários
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

  y += 50;
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.secondary);
  doc.text("Documento gerado eletronicamente para controle interno de cobrança.", margin, y);

  return doc.output("datauristring");
}

/**
 * Extrato simples por cliente (boletos/vencimentos).
 * Retorna Data URI (para abrir/baixar no front).
 * vendedorId opcional: quando informado (ex.: role vendedor), filtra apenas boletos desse vendedor.
 */
export async function gerarExtratoClientePDF(clienteId: number, vendedorId?: number): Promise<string> {
  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  const clienteRows = await db_conn
    .select({ id: db.clientes.id, nome: db.clientes.nome })
    .from(db.clientes)
    .where(eq(db.clientes.id, clienteId))
    .limit(1);
  const clienteNome = clienteRows[0]?.nome ?? `Cliente ${clienteId}`;

  const whereClause = vendedorId != null
    ? db.and(eq(db.boletos.clienteId, clienteId), eq(db.boletos.vendedorId, vendedorId))
    : eq(db.boletos.clienteId, clienteId);
  const rows = await db_conn
    .select({
      id: db.boletos.id,
      numeroPedido: db.boletos.numeroPedido,
      valorOriginal: db.boletos.valorOriginal,
      valorAberto: db.boletos.valorAberto,
      dataVencimento: db.boletos.dataVencimento,
      status: db.boletos.status,
      createdAt: db.boletos.createdAt,
    })
    .from(db.boletos)
    .where(whereClause);

  const doc = new jsPDF();
  let y = drawHeader(doc, "EXTRATO DO CLIENTE", String(clienteNome || "").toUpperCase());
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
    doc.setTextColor(0, 0, 0);
    return doc.output("datauristring");
  }

  for (const r of rows) {
    const venc = r.dataVencimento ? new Date(r.dataVencimento).toLocaleDateString("pt-BR") : "-";
    const linha = `Pedido #${r.numeroPedido} • Venc: ${venc} • Status: ${String(r.status)} • Em aberto: R$ ${Number(r.valorAberto).toFixed(2)}`;
    doc.text(linha, margin, y);
    y += 5;
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
  }

  return doc.output("datauristring");
}

/**
 * Gera o PDF do boleto em bytes (para ZIP / download binário).
 */
export async function gerarBoletoPDFBytes(boletoId: number): Promise<Uint8Array> {
  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  const boleto = await db_conn.select().from(db.contasReceber).where(eq(db.contasReceber.id, boletoId)).limit(1);
  if (boleto.length === 0) throw new Error("Boleto não encontrado");
  const b = boleto[0];

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
  return new Uint8Array(ab);
}

/**
 * Gera um ZIP com 1 PDF por boleto (para envio ao cliente).
 * Retorna base64 para download no frontend.
 */


// ===== ROMANEIO (CARGA) =====
export async function gerarRomaneioPDF(tenantId: number, cargaId: number): Promise<string> {
  const carga = await db.getCargaById(tenantId, cargaId);
  if (!carga) throw new Error('Carga não encontrada');

  const doc = new jsPDF();
  const numero = String((carga as any).numero || '').padStart(4, '0');
  const cidade = String((carga as any).cidadeRota || '').toUpperCase();
  const dataEntrega = (carga as any).dataEntrega ? new Date((carga as any).dataEntrega) : new Date();
  const dataStr = dataEntrega.toLocaleDateString('pt-BR');

  let y = drawHeader(doc, 'ROMANEIO DE ENTREGA', `CARGA #${numero} • ${cidade} • ${dataStr}`);

  // Colunas
  const margin = 12;
  const pageW = 210;
  const usableW = pageW - margin * 2;

  const col = {
    pedido: 16,
    cliente: 58,
    tel: 26,
    vend: 32,
    pag: 34,
    valor: 16,
    obs: usableW - (16+58+26+32+34+16),
  };

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

  function ensureSpace(minH: number) {
    if (y + minH > 287) {
      doc.addPage();
      y = 20;
      drawTableHeader();
    }
  }

  function money(v: any) {
    const n = typeof v === 'string' ? Number(v) : Number(v || 0);
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function cleanText(s: any, max = 60) {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    return t.length > max ? t.slice(0, max-1) + '…' : t;
  }

  function pagamentoResumo(p: any) {
    // formaPagamento pode ser string ou JSON; aqui deixamos robusto
    if (!p) return '';
    const raw = String(p);
    try {
      const obj = JSON.parse(raw);
      if (typeof obj === 'string') return obj;
      if (obj?.texto) return String(obj.texto);
      if (obj?.formaCombinada) return String(obj.formaCombinada);
    } catch {}
    return raw;
  }

  drawTableHeader();

  const itens = Array.isArray((carga as any).pedidos) ? (carga as any).pedidos : [];
  // Ordena por nome do cliente, depois número do pedido
  itens.sort((a: any, b: any) => {
    const ac = String(a?.clienteNome || '').localeCompare(String(b?.clienteNome || ''), 'pt-BR');
    if (ac !== 0) return ac;
    return Number(a?.numero || 0) - Number(b?.numero || 0);
  });

  let zebra = false;
  for (const p of itens) {
    ensureSpace(9);

    const rowH = 9;
    if (zebra) {
      doc.setFillColor(...COLORS.bg);
      doc.rect(x0, y, usableW, rowH, 'F');
    }
    zebra = !zebra;

    doc.setFontSize(9);
    doc.setTextColor(0,0,0);

    let x = x0 + 2;
    doc.text(String(p.numero ?? ''), x, y + 5.8); x += col.pedido;
    doc.text(cleanText(p.clienteNome, 30), x, y + 5.8); x += col.cliente;
    doc.text(cleanText(p.clienteTelefone, 14), x, y + 5.8); x += col.tel;
    doc.text(cleanText(p.vendedorNome, 18), x, y + 5.8); x += col.vend;
    doc.text(cleanText(pagamentoResumo(p.formaPagamento), 18), x, y + 5.8); x += col.pag;
    doc.text(money(p.total), x, y + 5.8); x += col.valor;
    doc.text(cleanText(p.observacoes, 28), x, y + 5.8);

    y += rowH;
  }

  // Total
  ensureSpace(16);
  y += 6;
  doc.setDrawColor(...COLORS.border);
  doc.line(x0, y, x0 + usableW, y);
  y += 8;
  const total = itens.reduce((acc: number, p: any) => acc + Number(p?.total || 0), 0);
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.primary);
  doc.text(`TOTAL DA CARGA: R$ ${money(total)}`, x0, y);

  // Campo assinatura
  y += 14;
  doc.setFontSize(10);
  doc.setTextColor(0,0,0);
  doc.text('Assinatura do Recebedor:', x0, y);
  doc.line(x0 + 55, y, x0 + 160, y);

  return doc.output('datauristring');
}

/** Alias para telas de logística (mesmo PDF do romaneio de carga). */
export async function gerarRelatorioViagemPDF(tenantId: number, cargaId: number): Promise<string> {
  return gerarRomaneioPDF(tenantId, cargaId);
}

export async function gerarZipBoletos(params: { boletoIds: number[]; pedidoNumero: number; clienteNome: string; }): Promise<{ fileName: string; base64: string; }> {
  const { boletoIds, pedidoNumero, clienteNome } = params;
  if (!boletoIds.length) throw new Error('Nenhum boleto para gerar ZIP');

  const safeCliente = String(clienteNome || 'CLIENTE').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
  const fileName = `BOLETOS_PED-${String(pedidoNumero).padStart(4, '0')}_${safeCliente}.zip`;

  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (c) => chunks.push(Buffer.from(c)));

  archive.pipe(stream);

  for (let i = 0; i < boletoIds.length; i++) {
    const id = boletoIds[i];
    const pdfBytes = await gerarBoletoPDFBytes(id);
    const pdfName = `BOLETO_${String(i + 1).padStart(2, '0')}_${String(boletoIds.length).padStart(2, '0')}_ID-${String(id).padStart(5, '0')}.pdf`;
    archive.append(Buffer.from(pdfBytes), { name: pdfName });
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
 * GERAÇÃO DO PEDIDO (para impressão do motorista)
 * Inclui o pagamento combinado (planejado) para orientar a entrega.
 */
export async function gerarPedidoPDF(pedidoId: number): Promise<string> {
  const db_conn = await db.getDb();
  if (!db_conn) throw new Error('Database not available');

  const pedidoRows = await db_conn.select().from(db.pedidos).where(eq(db.pedidos.id, pedidoId)).limit(1);
  if (!pedidoRows.length) throw new Error('Pedido não encontrado');
  const p = pedidoRows[0] as any;

  const itens = await db_conn.select().from(db.itensPedido).where(eq(db.itensPedido.pedidoId, pedidoId));

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
  const cond = [
    p.clienteCondominio ? `Condomínio: ${String(p.clienteCondominio)}` : '',
    p.clienteBloco ? `Bloco: ${String(p.clienteBloco)}` : '',
    p.clienteApartamento ? `Apto: ${String(p.clienteApartamento)}` : '',
  ].filter(Boolean).join(' • ');
  if (cond) {
    doc.text(cond, margin, y);
    y += 6;
  }
  if (p.clienteReferencia) {
    doc.setTextColor(...COLORS.secondary);
    doc.text(`Referência: ${String(p.clienteReferencia)}`, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 8;
  } else {
    y += 4;
  }

  // Pagamento combinado (planejado)
  const pagamentoTexto = (() => {
    try {
      if (!p.formaPagamento) return '';
      const obj = JSON.parse(String(p.formaPagamento));
      if (!obj?.planejado) return '';

      // Novo formato (2026): entrada (valor) + restante (BOLETO ou CARTAO)
      // Exemplos:
      // - 300 de entrada e 3x no boleto
      // - entrada de 300 e restante no cartão
      // - boleto em 6x
      const total = Number(obj.total || p.total || 0);
      const entrada = obj.entradaValor != null ? Number(obj.entradaValor) : null;
      const restanteTipo = String(obj.restanteTipo || '').toUpperCase();

      if (obj.tipo === 'BOLETO') {
        const parcelas = obj.boleto?.parcelas || 1;
        return `Forma de pagamento: BOLETO em ${parcelas}x`;
      }
      if (obj.tipo === 'CARTAO') {
        return `Forma de pagamento: CARTÃO`;
      }

      // Entrada + restante
      if (entrada != null && entrada > 0) {
        const entradaTxt = `Entrada de R$ ${entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        if (restanteTipo === 'BOLETO') {
          const parcelas = obj.boleto?.parcelas || 1;
          const restante = Math.max(0, Number((total - entrada).toFixed(2)));
          return `Forma de pagamento: ${entradaTxt} + BOLETO em ${parcelas}x`;
        }
        if (restanteTipo === 'CARTAO') {
          const restante = Math.max(0, Number((total - entrada).toFixed(2)));
          return `Forma de pagamento: ${entradaTxt} + restante no CARTÃO`;
        }
      }

      return '';
    } catch {
      return '';
    }
  })();

  if (pagamentoTexto) {
    doc.setFillColor(...COLORS.bg);
    doc.setDrawColor(...COLORS.border);
    doc.rect(margin, y, 170, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('PAGAMENTO COMBINADO', margin + 5, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(pagamentoTexto.replace('Pagamento combinado: ', ''), 160);
    doc.text(lines, margin + 5, y + 12);
    y += 22;
  }

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
  for (const it of itens as any[]) {
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
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }

  // Totais
  y += 4;
  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, 190, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL: R$ ${Number(p.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 190, y, { align: 'right' });

  // Observações
  if (p.observacoes) {
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('OBSERVAÇÕES', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const obs = doc.splitTextToSize(String(p.observacoes), 170);
    doc.text(obs, margin, y);
  }

  return doc.output('datauristring');
}

/**
 * GERAÇÃO DE PDF AGRUPADO (CARGA OU CLIENTE ESPECÍFICO)
 */
export async function gerarBoletosCargaPDF(tenantId: number, cargaId: number, pedidoNumero?: number) {
  const carga = await db.getCargaById(tenantId, cargaId);
  if (!carga) throw new Error("Carga não encontrada");

  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  // Filtra por todos os pedidos da carga ou apenas um específico
  const isCargaComPedidos = (
    x: unknown
  ): x is { pedidos: Array<{ numero: number }> } =>
    typeof x === "object" &&
    x !== null &&
    "pedidos" in x &&
    Array.isArray((x as { pedidos?: unknown }).pedidos) &&
    ((x as { pedidos: unknown[] }).pedidos.length === 0 ||
      typeof (x as { pedidos: Array<{ numero?: unknown }> }).pedidos[0]?.numero === "number");

  const pedidosFiltro = pedidoNumero
    ? [pedidoNumero]
    : isCargaComPedidos(carga)
      ? carga.pedidos.map((p) => p.numero)
      : (() => {
          throw new Error("Carga inválida: pedidos não disponíveis");
        })();

  const boletos = await db_conn.select().from(db.contasReceber)
    .where(and(
      inArray(db.contasReceber.pedidoNumero, pedidosFiltro),
      eq(db.contasReceber.formaPagamento, 'BOLETO'),
      eq(db.contasReceber.status, 'PENDENTE')
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
 * GERAÇÃO DE RELATÓRIO FINANCEIRO PADRONIZADO
 */
export async function gerarRelatorioFinanceiroPDF(tipo: 'PAGAR' | 'RECEBER', mesAno: string) {
  const db_conn = await db.getDb();
  if (!db_conn) throw new Error("Database not available");

  const doc = new jsPDF();
  let y = drawHeader(doc, `RELATÓRIO DE CONTAS A ${tipo}`, `Mês Referência: ${mesAno}`);
  const margin = 20;

  // Cabeçalho da Tabela
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

  // Aqui buscaria os dados reais do banco baseado no tipo e mês
  // Exemplo simplificado de listagem
  const dados = tipo === 'RECEBER' 
    ? await db_conn.select().from(db.contasReceber).limit(50)
    : await db_conn.select().from(db.contasPagar).limit(50);

  let total = 0;
  for (const item of dados) {
    if (y > 270) { doc.addPage(); y = 20; }
    
    const data = new Date(item.dataVencimento).toLocaleDateString('pt-BR');
    const desc = (tipo === 'RECEBER' ? (item as any).clienteNome : (item as any).fornecedor) || 'S/D';
    const valor = parseFloat(item.valor);
    const status = (item as any).status;

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
  doc.text(`TOTAL DO PERÍODO: R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, 110, y);

  return doc.output("datauristring");
}
