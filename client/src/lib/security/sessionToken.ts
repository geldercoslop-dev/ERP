/**
 * AUTH-H6 — sessão no browser é 100% cookie httpOnly (access + refresh).
 * O client NÃO persiste token em localStorage/sessionStorage e NÃO envia
 * Authorization/x-session-token no navegador; o browser entrega os cookies
 * via `credentials: "include"` em toda request.
 *
 * As funções mantêm os nomes legados para não quebrar imports existentes,
 * mas nunca escrevem em storage. No browser, getSessionToken() retorna
 * sempre null; em contexto Node/teste, um token pode existir apenas em
 * memória (compat explícita, isolada).
 */

import { getCSRFToken, getCSRFHeaderName } from "./csrfToken";

export const SESSION_TOKEN_STORAGE_KEY = "grs-session-token";

/** Chaves de token que versões anteriores podiam persistir — removidas sempre. */
const LEGACY_SESSION_KEYS = [SESSION_TOKEN_STORAGE_KEY] as const;

let memorySessionToken: string | null = null;

/** Remove chaves legadas de token do storage persistente (idempotente, browser-safe). */
export function clearLegacySessionTokenStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_SESSION_KEYS) localStorage.removeItem(key);
  } catch {
    /* storage indisponível */
  }
  try {
    for (const key of LEGACY_SESSION_KEYS) sessionStorage.removeItem(key);
  } catch {
    /* storage indisponível */
  }
}

// Higiene AUTH-H6: qualquer token persistido por versões anteriores morre no boot.
clearLegacySessionTokenStorage();

/**
 * Compat: mesmo nome/assinatura de antes. Nunca persiste.
 * Browser: no-op (sessão é o cookie httpOnly).
 * Node/teste: mantém apenas em memória transitória.
 */
export function setSessionToken(token: string | null): void {
  memorySessionToken = typeof window === "undefined" ? token : null;
}

/** Browser: sempre null (cookie-only). Node/teste: token em memória, se houver. */
export function getSessionToken(): string | null {
  if (typeof window !== "undefined") return null;
  return memorySessionToken;
}

/** Limpa o token em memória e remove qualquer legado persistido de storage. */
export function clearSessionToken(): void {
  memorySessionToken = null;
  clearLegacySessionTokenStorage();
}

/** Headers enviados em todas as chamadas à API da mesma origem. */
export function buildSessionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  // AUTH-H6: no browser, NUNCA Authorization/x-session-token — a sessão
  // trafega no cookie httpOnly. Headers de token só existem fora do browser
  // (Node/teste), quando um token foi explicitamente mantido em memória.
  if (typeof window === "undefined") {
    const token = getSessionToken();
    if (token) {
      headers["x-session-token"] = token;
      headers["X-Session-Token"] = token;
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  // CSRF token header (required)
  const csrfToken = getCSRFToken();
  if (csrfToken) {
    headers[getCSRFHeaderName()] = csrfToken;
  }

  // App secret header (only send if defined in env)
  // In dev: configure VITE_APP_SECRET in .env.development
  // In prod: rely on CSRF + session cookie instead
  const appSecret = import.meta.env.VITE_APP_SECRET;
  if (appSecret) {
    headers["x-app-secret"] = appSecret;
  }

  return headers;
}
