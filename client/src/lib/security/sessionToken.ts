/** Token de sessão persistido após login (complementa o cookie httpOnly no servidor). */

import { getCSRFToken, getCSRFHeaderName } from "./csrfToken";

export const SESSION_TOKEN_STORAGE_KEY = "grs-session-token";

export function setSessionToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    /* storage indisponível */
  }
}

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Headers enviados em todas as chamadas à API da mesma origem. */
export function buildSessionHeaders(): Record<string, string> {
  const token = getSessionToken();
  const csrfToken = getCSRFToken();
  const appSecret = import.meta.env.VITE_APP_SECRET;

  const headers: Record<string, string> = {};

  // Session token headers
  if (token) {
    headers["x-session-token"] = token;
    headers["X-Session-Token"] = token;
    headers["Authorization"] = `Bearer ${token}`;
  }

  // CSRF token header (required)
  if (csrfToken) {
    headers[getCSRFHeaderName()] = csrfToken;
  }

  // App secret header (only send if defined in env)
  // In dev: configure VITE_APP_SECRET in .env.development
  // In prod: rely on CSRF + session cookie instead
  if (appSecret) {
    headers["x-app-secret"] = appSecret;
  }

  return headers;
}
