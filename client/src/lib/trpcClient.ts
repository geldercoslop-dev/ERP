/**
 * Cliente tRPC central: batch HTTP + React tRPC (tipagem AppRouter).
 * Único ponto de POST batch para serviços (fora das hooks use trpc.*).
 */
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";
import { authenticatedFetch, shouldSuppress401Redirect } from "./security/apiClient";
import { GRS_API_NETWORK_ERROR } from "./api/events";
import { GRS_API_ORIGIN } from "./apiOrigin";

/** Entrada JSON de procedures (objeto). Para void use `null` explicitamente. */
export type Payload = Record<string, unknown>;

export type TrpcCallInput = Payload | null | undefined;

const TRPC_CALL_TIMEOUT_MS = 10000;

function resolveTrpcBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  const raw = import.meta.env.VITE_TRPC_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  const viteApi = import.meta.env.VITE_API_URL?.trim();
  return (viteApi && viteApi.replace(/\/+$/, "")) || GRS_API_ORIGIN;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Evita vazar senha em logs estruturados. */
function redactLogInput(input: TrpcCallInput): unknown {
  if (input === undefined || input === null) return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = k === "password" && typeof v === "string" ? "[redacted]" : v;
  }
  return out;
}

function logTrpcError(procedure: string, input: TrpcCallInput, response: unknown): void {
  console.error("TRPC ERROR", {
    procedure,
    input: redactLogInput(input),
    response,
  });
}

/**
 * Extrai `result.data.json` do batch (formato `{ "0": { ... } }` ou array `[{ ... }]`).
 * Lança se formato inválido ou se o slot contém erro tRPC.
 */
function safeParseTrpc(json: unknown): unknown {
  let row: unknown;
  if (Array.isArray(json)) {
    if (json.length === 0) {
      throw new Error("Invalid TRPC response format");
    }
    row = json[0];
  } else if (isPlainObject(json) && "0" in json) {
    row = json["0"];
  } else {
    throw new Error("Invalid TRPC response format");
  }

  if (!isPlainObject(row)) {
    throw new Error("Invalid TRPC response format");
  }

  if ("error" in row && row.error !== undefined) {
    const errPart = row.error;
    let msg = "Erro tRPC";
    let code: string | undefined;
    if (isPlainObject(errPart)) {
      const j = errPart.json;
      if (isPlainObject(j) && typeof j.message === "string") msg = j.message;
      else if (typeof errPart.message === "string") msg = errPart.message;
      if (isPlainObject(j) && typeof j.code === "string") code = j.code;
      else if (isPlainObject(errPart.data) && typeof errPart.data.code === "string") {
        code = errPart.data.code;
      }
    }
    const err = new Error(msg);
    Object.assign(err, { code, name: "TRPCClientError" });
    throw err;
  }

  const result = row.result;
  if (!isPlainObject(result)) {
    return null;
  }
  const data = result.data;
  if (!isPlainObject(data)) {
    return null;
  }
  if (!("json" in data)) {
    return null;
  }
  return data.json;
}

function parseTrpcResponseBody(
  text: string,
  procedure: string,
  input: TrpcCallInput
): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    logTrpcError(procedure, input, text.slice(0, 200));
    throw new Error(`Resposta tRPC inválida (não JSON): ${text.slice(0, 160)}`);
  }

  if (
    isPlainObject(parsed) &&
    !Array.isArray(parsed) &&
    "error" in parsed &&
    !("result" in parsed)
  ) {
    const top = parsed as { error?: { message?: string; code?: string } };
    const msg = top.error?.message ?? top.error?.code ?? "Erro na API";
    logTrpcError(procedure, input, parsed);
    const err = new Error(msg);
    if (top.error?.code) Object.assign(err, { code: top.error.code });
    throw err;
  }

  try {
    return safeParseTrpc(parsed);
  } catch (e) {
    logTrpcError(procedure, input, parsed);
    if (e instanceof Error) throw e;
    throw new Error("Invalid TRPC response format");
  }
}

/**
 * Chamada batch tRPC (POST) com credenciais e headers de sessão.
 * HARDENING: timeout 10s, parse seguro, log em falhas; 401 → `/login` quando aplicável.
 */
export async function trpcCall(procedure: string, input?: TrpcCallInput): Promise<unknown> {
  const origin = resolveTrpcBaseUrl();
  const path = procedure.replace(/^\//, "");
  const url = `${origin}/api/trpc/${path}?batch=1`;

  const jsonBody: Payload | null =
    input === undefined ? {} : input === null ? null : input;

  const body = JSON.stringify({
    "0": {
      json: jsonBody,
    },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRPC_CALL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await authenticatedFetch(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        signal: controller.signal,
      },
      { redirectOn401: false }
    );
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      logTrpcError(procedure, input, { reason: "timeout", ms: TRPC_CALL_TIMEOUT_MS });
      throw new Error(`Requisição tRPC excedeu ${TRPC_CALL_TIMEOUT_MS / 1000}s`);
    }
    logTrpcError(procedure, input, { reason: "network", error: String(e) });
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await res.text();

  if (res.status === 401) {
    if (typeof window !== "undefined" && !shouldSuppress401Redirect(url)) {
      window.location.assign("/login");
    }
    try {
      return parseTrpcResponseBody(text, procedure, input);
    } catch (e) {
      if (e instanceof Error && e.message !== "Invalid TRPC response format") {
        throw e;
      }
      const err = new Error("Não autorizado");
      Object.assign(err, { code: "UNAUTHORIZED", name: "TRPCClientError" });
      throw err;
    }
  }

  if (!res.ok) {
    try {
      return parseTrpcResponseBody(text, procedure, input);
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  return parseTrpcResponseBody(text, procedure, input);
}

/** Única instância tRPC React. Sessão: cookie + x-session-token (via authenticatedFetch no link). */
export const trpc = createTRPCReact<AppRouter>();

export { getSessionToken, setSessionToken } from "./security/sessionToken";

export const trpcClientConfig = {
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch(url, options) {
        return authenticatedFetch(url, options as RequestInit).catch((err: unknown) => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(GRS_API_NETWORK_ERROR, { detail: { url, err } }));
          }
          throw err;
        });
      },
    }),
  ],
  queryClientConfig: {
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  },
};
