import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

/** Única instância tRPC. Client criado em main.tsx (fora do render). headers() injeta X-Session-Token; fetch usa credentials: "include". */
export const trpc = createTRPCReact<AppRouter>();

const TOKEN_KEY = "grs-session-token";

/** Define o token (login chama com o valor; logout chama com null). */
export function setSessionToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/** Lê token do localStorage (para authStore/trpcBatchCall). */
export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Uma única instância: client criado em main.tsx. Header injetado no fetch (fonte de verdade).
export const trpcClientConfig = {
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch(url, options) {
        const t = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) || "" : "";
        const h = new Headers((options?.headers as HeadersInit) || {});
        if (t) h.set("x-session-token", t);
        return fetch(url, {
          ...options,
          headers: h,
          credentials: "include",
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
