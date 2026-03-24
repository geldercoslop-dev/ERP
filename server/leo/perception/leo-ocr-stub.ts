/**
 * LEO OCR - Stub Implementation
 * 
 * Implementação mínima para evitar erros de compilação
 * OCR desativado temporariamente
 */

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
  return {
    text: "OCR not implemented - stub mode",
    confidence: 0.0,
    words: []
  };
}

export async function recognizeTextFromBuffer(buffer: Buffer): Promise<OCRResult> {
  console.log("[LEO OCR STUB] recognizeTextFromBuffer called");
  return {
    text: "OCR not implemented - stub mode",
    confidence: 0.0,
    words: []
  };
}

export function isOCRAvailable(): boolean {
  return false; // OCR desativado
}

export default {
  recognizeText,
  recognizeTextFromBuffer,
  isOCRAvailable
};
