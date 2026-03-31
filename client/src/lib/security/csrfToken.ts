/** CSRF token storage and retrieval. */

const CSRF_TOKEN_STORAGE_KEY = "grs-csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";

let csrfTokenCache: string | null = null;

/**
 * Get cached CSRF token.
 * If not cached, tries to load from localStorage.
 */
export function getCSRFToken(): string | null {
  if (csrfTokenCache) return csrfTokenCache;
  
  if (typeof window === "undefined") return null;
  try {
    csrfTokenCache = localStorage.getItem(CSRF_TOKEN_STORAGE_KEY);
    return csrfTokenCache;
  } catch {
    return null;
  }
}

/**
 * Set CSRF token in cache and localStorage.
 */
export function setCSRFToken(token: string | null): void {
  csrfTokenCache = token;
  
  if (typeof window === "undefined") return;
  try {
    if (token) {
      localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

/**
 * Fetch CSRF token from backend and cache it.
 * Called on app initialization or after logout.
 */
export async function fetchCSRFToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/csrf-token", {
      method: "GET",
      credentials: "include", // Send cookies
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("[CSRF] Failed to fetch token:", response.status);
      return null;
    }

    const data = (await response.json()) as {
      csrfToken?: string;
      headerName?: string;
    };

    const token = data.csrfToken;
    if (token) {
      setCSRFToken(token);
      return token;
    }

    return null;
  } catch (error) {
    console.error("[CSRF] Error fetching token:", error);
    return null;
  }
}

/**
 * Clear CSRF token (on logout).
 */
export function clearCSRFToken(): void {
  setCSRFToken(null);
}

/**
 * Get CSRF header name.
 */
export function getCSRFHeaderName(): string {
  return CSRF_HEADER_NAME;
}
