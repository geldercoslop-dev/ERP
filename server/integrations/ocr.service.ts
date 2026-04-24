/**
 * Integração OCR.space — leitura de texto em imagens/PDFs (notas fiscais, listas de preço).
 * API gratuita com limite de requisições. Requer OCR_SPACE_API_KEY.
 * https://ocr.space/ocrapi
 */
const BASE = "https://api.ocr.space/parse/image";

function getApiKey(): string | undefined {
  return process.env.OCR_SPACE_API_KEY;
}

/**
 * Envia imagem (URL ou base64) para extração de texto.
 */
export async function lerDocumento(params: {
  url?: string;
  base64?: string;
  language?: string;
}): Promise<{ ok: boolean; texto?: string; erro?: string }> {
  const key = getApiKey();
  if (!key) {
    return { ok: false, erro: "OCR.space não configurado. Defina OCR_SPACE_API_KEY." };
  }
  const form = new FormData();
  form.append("apikey", key);
  form.append("language", params.language ?? "por");
  if (params.url) form.append("url", params.url);
  else if (params.base64) {
    const base64Data = params.base64.replace(/^data:image\/\w+;base64,/, "");
    form.append("base64Image", base64Data);
  } else {
    return { ok: false, erro: "Informe url ou base64 da imagem." };
  }
  try {
    const res = await fetch(BASE, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json() as unknown;
    const dataRecord = data as Record<string, unknown>;
    const parsedResults = dataRecord.ParsedResults as unknown[];
    const text = parsedResults?.[0] as Record<string, unknown> | undefined;
    const parsedText = text?.ParsedText as string | undefined;
    if (dataRecord.OCRExitCode !== 1 || !parsedText) {
      return { ok: false, erro: String(dataRecord.ErrorMessage ?? "Nenhum texto reconhecido.") };
    }
    return { ok: true, texto: parsedText.trim() };
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Timeout ao processar OCR." : e instanceof Error ? e.message : "Erro ao processar OCR.";
    return { ok: false, erro: msg };
  }
}
