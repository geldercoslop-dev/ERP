/**
 * LEO OCR - Stub Implementation
 * 
 * Implementação mínima para ERP Core + LEO Básico
 * OCR desativado temporariamente para reduzir erros de compilação
 */

import type { Payload } from '@shared/types';
import { insertLeoLegacyActionLog } from '../../services/leo-action-log.service';

type InsertLeoActionLogParams = { usuario: string; acao: string; entidade: string; dados?: string | null; resultado: string };
async function insertLeoActionLog(params: InsertLeoActionLogParams): Promise<void> {
  await insertLeoLegacyActionLog(params);
}

export interface OCRResult {
  text: string;
  confidence: number;
  words?: Array<{
    text: string;
    bbox: [number, number, number, number];
    confidence: number;
  }>;
}

export async function recognizeText(imagePath: string): Promise<OCRResult> {
  console.log(`[LEO OCR STUB] recognizeText called for: ${imagePath}`);
  
  try {
    await insertLeoActionLog({
      usuario: 'leo',
      acao: 'ocr_recognize',
      entidade: 'image',
      dados: JSON.stringify({ mode: 'stub', path: imagePath }),
      resultado: 'success'
    });
  } catch (error) {
    console.error('[LEO OCR STUB] Error logging action:', error);
  }

  return {
    text: "OCR not implemented - stub mode",
    confidence: 0.0,
    words: []
  };
}

export async function recognizeTextFromBuffer(buffer: Buffer): Promise<OCRResult> {
  console.log("[LEO OCR STUB] recognizeTextFromBuffer called");
  
  try {
    await insertLeoActionLog({
      usuario: 'leo',
      acao: 'ocr_recognize_buffer',
      entidade: 'buffer',
      dados: JSON.stringify({ mode: 'stub', size: buffer.length }),
      resultado: 'success'
    });
  } catch (error) {
    console.error('[LEO OCR STUB] Error logging action:', error);
  }

  return {
    text: "OCR not implemented - stub mode",
    confidence: 0.0,
    words: []
  };
}

export function isOCRAvailable(): boolean {
  return false; // OCR desativado
}

export async function readTextFromScreen(_params?: Payload): Promise<{ success: boolean; message: string; data?: { text: string } }> {
  return {
    success: true,
    message: 'OCR stub - text not extracted',
    data: { text: '' }
  };
}

export default {
  recognizeText,
  recognizeTextFromBuffer,
  isOCRAvailable,
  readTextFromScreen
};
