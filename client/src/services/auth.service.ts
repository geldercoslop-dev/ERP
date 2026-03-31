/**
 * Auth Service — autenticação via tRPC real (`/api/trpc/auth.*`).
 */

import { trpcCall } from "../lib/trpcClient";
import { clearCSRFToken } from "../lib/security/csrfToken";

export interface LoginInput {
  /** Nome de usuário (login). */
  username: string;
  password: string;
}

/** Compat: formulários que ainda enviam `email` como identificador de login. */
export type LoginPayload = LoginInput | { email: string; password: string };

export interface LoginResponse {
  ok: boolean;
  sessionToken?: string;
  openId?: string;
  name?: string;
  role?: string;
  vendedorId?: number;
  error?: string;
}

export interface UserInfo {
  id: string | number;
  name: string;
  role: string;
  email?: string;
  openId?: string;
}

function usernameFromPayload(data: LoginPayload): string {
  if ("username" in data && typeof data.username === "string") {
    return data.username.trim();
  }
  if ("email" in data && typeof data.email === "string") {
    return data.email.trim();
  }
  return "";
}

/**
 * Login — `auth.login` (mutation).
 */
export async function login(data: LoginPayload): Promise<LoginResponse> {
  const username = usernameFromPayload(data);
  const password = "password" in data ? data.password : "";
  try {
    const raw = (await trpcCall("auth.login", {
      username,
      password,
    })) as LoginResponse;
    if (raw && typeof raw === "object" && raw.ok === true) {
      return raw;
    }
    return {
      ok: false,
      error: "Resposta de login inválida",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao fazer login";
    return { ok: false, error: msg };
  }
}

/**
 * Logout — `auth.logout` (mutation).
 */
export async function logout(): Promise<{ ok: boolean; error?: string }> {
  try {
    await trpcCall("auth.logout", null);
    clearCSRFToken(); // Clear CSRF token on logout
    return { ok: true };
  } catch (e) {
    clearCSRFToken(); // Clear even on error
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao fazer logout",
    };
  }
}

/**
 * Usuário atual — `auth.me` (query).
 */
export async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    const raw = await trpcCall("auth.me", null);
    if (raw == null) return null;
    const u = raw as Record<string, unknown>;
    if (typeof u.id === "undefined") return null;
    return {
      id: u.id as string | number,
      name: String(u.name ?? ""),
      role: String(u.role ?? "vendedor"),
      email: typeof u.email === "string" ? u.email : undefined,
      openId: typeof u.openId === "string" ? u.openId : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Sessão válida se `auth.me` retorna usuário.
 */
export async function validateToken(): Promise<boolean> {
  const u = await getCurrentUser();
  return u != null;
}

export function storeToken(token: string): void {
  setSessionToken(token);
}

export function getStoredToken(): string | null {
  return getSessionToken();
}

export function clearStoredToken(): void {
  setSessionToken(null);
}
