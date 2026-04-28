/**
 * LEGACY / DEPRECATED — DO NOT IMPORT THIS FILE DIRECTLY
 *
 * This module no longer has direct DB access and is NOT tenant-aware.
 * All PDF generation must go through: server/services/reports/pdf.service.ts
 * which requires tenantId for multi-tenant isolation.
 *
 * Functions without tenantId throw explicitly (fail-hard).
 * Functions with tenantId delegate to pdf.service.ts.
 *
 * Importing from this file is BLOCKED by anti-regress guard.
 * See: scripts/anti-regress-check.js (rule 6)
 */
import { ValidationError } from './_core/errors/typed-errors.js';
import * as pdfService from "./services/reports/pdf.service.js";

const LEGACY_ERROR = "server/pdf.ts é legado e não é tenant-aware. Use server/services/reports/pdf.service.ts com tenantId.";

/**
 * @deprecated Use pdfService.gerarBoletoPDF(tenantId, boletoId) instead.
 */
export async function gerarBoletoPDF(boletoId: number) {
  throw new ValidationError(LEGACY_ERROR);
}

/**
 * @deprecated Use pdfService.gerarExtratoClientePDF(tenantId, clienteId, vendedorId?) instead.
 */
export async function gerarExtratoClientePDF(clienteId: number, vendedorId?: number): Promise<string> {
  throw new ValidationError(LEGACY_ERROR);
}

/**
 * @deprecated Use pdfService.gerarBoletoPDFBytes(tenantId, boletoId) instead.
 */
export async function gerarBoletoPDFBytes(boletoId: number): Promise<Uint8Array> {
  throw new ValidationError(LEGACY_ERROR);
}

/**
 * @deprecated Use pdfService.gerarRomaneioPDF(tenantId, cargaId) instead.
 */
export async function gerarRomaneioPDF(tenantId: number, cargaId: number): Promise<string> {
  return await pdfService.gerarRomaneioPDF(tenantId, cargaId);
}

/**
 * @deprecated Use pdfService.gerarRelatorioViagemPDF(tenantId, cargaId) instead.
 */
export async function gerarRelatorioViagemPDF(tenantId: number, cargaId: number): Promise<string> {
  return await pdfService.gerarRomaneioPDF(tenantId, cargaId);
}

/**
 * @deprecated Use pdfService.gerarZipBoletos(tenantId, params) instead.
 */
export async function gerarZipBoletos(params: { boletoIds: number[]; pedidoNumero: number; clienteNome: string; }): Promise<{ fileName: string; base64: string; }> {
  throw new ValidationError(LEGACY_ERROR);
}

/**
 * @deprecated Use pdfService.gerarPedidoPDF(tenantId, pedidoId) instead.
 */
export async function gerarPedidoPDF(pedidoId: number): Promise<string> {
  throw new ValidationError(LEGACY_ERROR);
}

/**
 * @deprecated Use pdfService.gerarBoletosCargaPDF(tenantId, cargaId, pedidoNumero?) instead.
 */
export async function gerarBoletosCargaPDF(tenantId: number, cargaId: number, pedidoNumero?: number) {
  return await pdfService.gerarBoletosCargaPDF(tenantId, cargaId, pedidoNumero);
}

/**
 * @deprecated Use pdfService.gerarRelatorioFinanceiroPDF(tenantId, tipo, mesAno) instead.
 */
export async function gerarRelatorioFinanceiroPDF(tipo: 'PAGAR' | 'RECEBER', mesAno: string) {
  throw new ValidationError(LEGACY_ERROR);
}
