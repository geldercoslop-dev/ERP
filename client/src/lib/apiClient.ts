/**
 * Camada HTTP padronizada do frontend (tipagem ApiResponse).
 * Usa o mesmo fetch autenticado do app; não altera o backend.
 */
import { authenticatedFetch } from "@/lib/security/apiClient";
import type { ApiResponse } from "@/lib/api/types";

export type { ApiResponse } from "@/lib/api/types";

function toFriendlyMessage(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes("failed to fetch") || m.includes("network")) return "Servidor offline";
    return err.message;
  }
  return "Erro desconhecido";
}

function messageFromJsonBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const o = body as Record<string, unknown>;
  const m = o.message;
  return typeof m === "string" ? m : undefined;
}

export async function apiRequestJson<T = unknown>(
  input: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const res = await authenticatedFetch(input, init);
    const text = await res.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }

    if (res.status === 401) {
      return { success: false, error: "Não autorizado" };
    }
    if (res.status >= 500) {
      return { success: false, error: "Erro interno" };
    }
    if (!res.ok) {
      const msg = messageFromJsonBody(body) ?? `Erro HTTP ${res.status}`;
      return { success: false, error: msg };
    }

    return { success: true, data: body as T };
  } catch (e) {
    return { success: false, error: toFriendlyMessage(e) };
  }
}
