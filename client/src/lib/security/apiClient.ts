import { buildSessionHeaders, clearSessionToken } from "./sessionToken";
import { stripForbiddenIdentityKeys } from "./sanitizePayload";

export const GRS_AUTH_UNAUTHORIZED_EVENT = "grs:auth-unauthorized";

/**
 * AUTH-H6: endpoints que NUNCA disparam refresh — evita recursão e tentativas
 * de refresh durante o próprio login/logout/refresh.
 */
const AUTH_ENDPOINT_MARKERS = ["auth.login", "auth.logout", "auth.refresh"] as const;

function isAuthEndpointUrl(url: string): boolean {
  const u = url.toLowerCase();
  return AUTH_ENDPOINT_MARKERS.some((m) => u.includes(m));
}

/**
 * AUTH-H6: uma única promise de refresh por vez — 401s paralelos aguardam a
 * mesma tentativa (sem refresh paralelo). O browser envia o cookie httpOnly
 * `refresh_token` automaticamente; o client nunca lê nem manipula esse token.
 */
let sessionRefreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (sessionRefreshInFlight) return sessionRefreshInFlight;
  sessionRefreshInFlight = (async () => {
    try {
      const res = await fetch("/api/trpc/auth.refresh?batch=1", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...buildSessionHeaders(),
        },
        body: JSON.stringify({ "0": { json: null } }),
      });
      if (!res.ok) return false;
      // Fail-closed: só sucesso se o batch tRPC vier sem `error`.
      const parsed = (await res.json()) as unknown;
      const row = Array.isArray(parsed)
        ? parsed[0]
        : isRecord(parsed)
          ? parsed["0"]
          : undefined;
      if (!isRecord(row) || "error" in row) return false;
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await sessionRefreshInFlight;
  } finally {
    sessionRefreshInFlight = null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Rotas onde 401 é esperado e não deve forçar redirect (ex.: tela de login). */
export function isSameOriginUrl(url: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function shouldSuppress401Redirect(url: string): boolean {
  const u = url.toLowerCase();
  if (u.includes("auth.login")) return true;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/login")) {
    if (u.includes("auth.me")) return true;
  }
  return false;
}

function mergeHeaders(base: HeadersInit | undefined, extra: Record<string, string>): Headers {
  const h = new Headers(base ?? {});
  for (const [k, v] of Object.entries(extra)) {
    if (v) h.set(k, v);
  }
  return h;
}

function sanitizeInitBody(init?: RequestInit): RequestInit | undefined {
  if (!init?.body || typeof init.body !== "string") return init;
  const trimmed = init.body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return init;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const cleaned = stripForbiddenIdentityKeys(parsed);
    return { ...init, body: JSON.stringify(cleaned) };
  } catch {
    return init;
  }
}

export type AuthenticatedFetchOptions = {
  /** Default: true — em 401 dispara evento global para redirect ao login. */
  redirectOn401?: boolean;
};

/**
 * Único ponto de fetch para API autenticada (mesma origem): cookie-only httpOnly.
 * Remove chaves de identidade/tenant de JSON no body quando aplicável.
 *
 * AUTH-H6: em 401 fora de auth.login/logout/refresh, tenta `auth.refresh`
 * UMA vez (cookie `refresh_token` httpOnly via credentials:"include") e,
 * se bem-sucedido, refaz a request UMA vez. Falha → limpa estado/token
 * legado e dispara o evento de redirect. Nunca recursivo, nunca em loop.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: AuthenticatedFetchOptions
): Promise<Response> {
  const redirectOn401 = opts?.redirectOn401 !== false;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);

  const sanitized = sanitizeInitBody(init);
  const doFetch = (requestInit: RequestInit | undefined) =>
    fetch(input, {
      ...requestInit,
      headers: mergeHeaders(requestInit?.headers, buildSessionHeaders()),
      credentials: "include",
    });

  let res = await doFetch(sanitized);

  // AUTH-H6: refresh-once + retry-once. Endpoints auth são excluídos para
  // não refrescar durante o próprio login/logout/refresh.
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !isAuthEndpointUrl(url)
  ) {
    if (await tryRefreshSession()) {
      // Sessão renovada (novo access cookie httpOnly) → refaz a request UMA vez.
      res = await doFetch(sanitized);
    } else {
      // Refresh falhou → limpa estado local antes do redirect (fail-closed).
      clearSessionToken();
    }
  }

  if (res.status === 401 && redirectOn401 && !shouldSuppress401Redirect(url)) {
    try {
      window.dispatchEvent(new CustomEvent(GRS_AUTH_UNAUTHORIZED_EVENT, { detail: { url } }));
    } catch {
      /* SSR / ambiente sem window */
    }
  }

  return res;
}

/**
 * GET/HEAD públicos (health, probes): sem strip de body; ainda envia credenciais se houver.
 */
export async function sameOriginFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const session = buildSessionHeaders();
  const headers = mergeHeaders(init?.headers, session);
  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}
