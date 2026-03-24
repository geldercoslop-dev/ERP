import { buildSessionHeaders } from "./sessionToken";
import { stripForbiddenIdentityKeys } from "./sanitizePayload";

export const GRS_AUTH_UNAUTHORIZED_EVENT = "grs:auth-unauthorized";

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
 * Único ponto de fetch para API autenticada (mesma origem): cookies + token de sessão.
 * Remove chaves de identidade/tenant de JSON no body quando aplicável.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: AuthenticatedFetchOptions
): Promise<Response> {
  const redirectOn401 = opts?.redirectOn401 !== false;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);

  const session = buildSessionHeaders();
  const sanitized = sanitizeInitBody(init);
  const headers = mergeHeaders(sanitized?.headers, session);

  const res = await fetch(input, {
    ...sanitized,
    headers,
    credentials: "include",
  });

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
