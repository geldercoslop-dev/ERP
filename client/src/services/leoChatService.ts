/**
 * Serviço de comunicação com o assistente LEO.
 * Envia mensagem para POST /api/leo/chat ou usa fallback via tRPC.
 */

import { sanitizePlainTextInput } from "../lib/security/sanitizePayload";
import { GRS_API_ORIGIN } from "../lib/apiOrigin";
import { apiClient } from "../lib/api/apiClient";
import { InfrastructureError } from "../lib/errors/typed-errors.js";

const getBaseUrl = () =>
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : GRS_API_ORIGIN);

export type LeoChatResponse = {
  response: string;
  action?: string;
  data?: unknown;
  context?: Record<string, unknown>;
  pendingConfirmation?: {
    action: string;
    resumo: string;
    payload: Record<string, unknown>;
  };
};

/**
 * Envia mensagem ao LEO via POST /api/leo/chat.
 * Body: { message: string }
 * Retorno esperado: { response, action?, data?, context? }
 */
export async function sendMessageToLeo(message: string): Promise<LeoChatResponse> {
  const safeMessage = sanitizePlainTextInput(message);
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/leo/chat`;
  const res = await apiClient<unknown, { message: string }>(url, {
    method: "POST",
    payload: { message: safeMessage },
    timeoutMs: 10_000,
    retries: 2,
  });

  if (!res.ok) {
    throw new InfrastructureError(res.error.code === "NOT_FOUND" ? "LEO_CHAT_NOT_AVAILABLE" : res.error.message);
  }

  return normalizeLeoResponse(res.data);
}

/**
 * Normaliza resposta do backend para o formato esperado pelo frontend.
 */
export function normalizeLeoResponse(raw: unknown): LeoChatResponse {
  if (raw && typeof raw === "object" && "response" in raw) {
    const r = raw as Record<string, unknown>;
    return {
      response: String(r.response ?? ""),
      action: r.action != null ? String(r.action) : undefined,
      data: r.data,
      context: r.context as Record<string, unknown> | undefined,
      pendingConfirmation: r.pendingConfirmation as LeoChatResponse["pendingConfirmation"],
    };
  }
  if (raw && typeof raw === "object" && "mensagem" in raw) {
    const r = raw as Record<string, unknown>;
    const mensagem = r.mensagem;
    if (mensagem && typeof mensagem === "object" && "response" in (mensagem as object)) {
      return normalizeLeoResponse(mensagem);
    }
    return {
      response: String(mensagem ?? ""),
      action: r.action != null ? String(r.action) : undefined,
      data: r.data,
      context: r.context as Record<string, unknown> | undefined,
    };
  }
  return {
    response: typeof raw === "string" ? raw : "Resposta recebida.",
    data: raw,
  };
}
