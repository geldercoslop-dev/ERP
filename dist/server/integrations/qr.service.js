/**
 * Integração goqr.me — geração de QR Code via URL (gratuito).
 * https://goqr.me/api/
 */
const BASE = "https://api.qrserver.com/v1/create-qr-code";
/**
 * Gera URL da imagem do QR Code para o conteúdo informado.
 * Uso: manual de montagem, link de produto, etiquetas.
 */
export function gerarQRCode(params) {
    const size = Math.min(400, Math.max(100, params.tamanho ?? 200));
    const margin = params.margin ?? 2;
    const url = `${BASE}/?size=${size}x${size}&margin=${margin}&data=${encodeURIComponent(params.conteudo)}`;
    return url;
}
