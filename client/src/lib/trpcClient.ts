import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";
import { authenticatedFetch } from "@/lib/security/apiClient";
import { GRS_API_NETWORK_ERROR } from "@/lib/api/events";
// Origem real da API em dev: @/lib/apiOrigin (proxy /api → localhost:3000)

/** Única instância tRPC. Client criado em main.tsx. Sessão: cookie + x-session-token. */
export const trpc = createTRPCReact<AppRouter>();

export { getSessionToken, setSessionToken } from "@/lib/security/sessionToken";

export const trpcClientConfig = {
  links: [
    httpBatchLink({
      /** Mesma origem no browser; em dev o Vite encaminha para GRS_API_ORIGIN. */
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
