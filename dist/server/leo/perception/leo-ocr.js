/**
 * LEO OCR - Stub Implementation
 *
 * Implementação mínima para ERP Core + LEO Básico
 * OCR desativado temporariamente para reduzir erros de compilação
 */
import { insertLeoLegacyActionLog } from '../../services/leo-action-log.service.js';
async function insertLeoActionLog(params) {
    await insertLeoLegacyActionLog(params);
}
export async function recognizeText(imagePath) {
    console.log(`[LEO OCR STUB] recognizeText called for: ${imagePath}`);
    try {
        await insertLeoActionLog({
            usuario: 'leo',
            acao: 'ocr_recognize',
            entidade: 'image',
            dados: JSON.stringify({ mode: 'stub', path: imagePath }),
            resultado: 'success'
        });
    }
    catch (error) {
        console.error('[LEO OCR STUB] Error logging action:', error);
    }
    return {
        text: "OCR not implemented - stub mode",
        confidence: 0.0,
        words: []
    };
}
export async function recognizeTextFromBuffer(buffer) {
    console.log("[LEO OCR STUB] recognizeTextFromBuffer called");
    try {
        await insertLeoActionLog({
            usuario: 'leo',
            acao: 'ocr_recognize_buffer',
            entidade: 'buffer',
            dados: JSON.stringify({ mode: 'stub', size: buffer.length }),
            resultado: 'success'
        });
    }
    catch (error) {
        console.error('[LEO OCR STUB] Error logging action:', error);
    }
    return {
        text: "OCR not implemented - stub mode",
        confidence: 0.0,
        words: []
    };
}
export function isOCRAvailable() {
    return false; // OCR desativado
}
export async function readTextFromScreen(_params) {
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
