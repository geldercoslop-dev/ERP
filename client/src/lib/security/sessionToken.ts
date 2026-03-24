/** Token de sessão persistido após login (complementa o cookie httpOnly no servidor). */

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
  if (!token) return {};
  return {
    "x-session-token": token,
    "X-Session-Token": token,
    Authorization: `Bearer ${token}`,
  };
}
