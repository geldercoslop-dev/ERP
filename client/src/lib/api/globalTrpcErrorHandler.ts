import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import { GRS_AUTH_UNAUTHORIZED_EVENT } from "@/lib/security/apiClient";
import { GRS_API_NETWORK_ERROR } from "@/lib/api/events";

function isLikelyNetworkFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("network request failed") ||
    m.includes("econnrefused")
  );
}

/**
 * Tratamento global de erros tRPC / React Query.
 * - 401 → evento GRS_AUTH_UNAUTHORIZED (logout / redirect via SessionExpiredBridge)
 * - 500 / INTERNAL_SERVER_ERROR → toast "Erro interno"
 * - rede → toast "Servidor offline" + evento GRS_API_NETWORK_ERROR
 */
export function handleGlobalTrpcOrQueryError(error: unknown): void {
  if (error instanceof TRPCClientError) {
    const code = error.data?.code as string | undefined;
    const httpStatus = error.data?.httpStatus as number | undefined;

    if (code === "UNAUTHORIZED" || httpStatus === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(GRS_AUTH_UNAUTHORIZED_EVENT, { detail: { source: "trpc-global" } })
        );
      }
      return;
    }

    if (httpStatus === 500 || code === "INTERNAL_SERVER_ERROR") {
      toast.error("Erro interno", { id: "grs-http-500" });
      return;
    }

    const msg = error.message || "";
    if (!httpStatus && isLikelyNetworkFailure(msg)) {
      toast.error("Servidor offline", { id: "grs-offline" });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(GRS_API_NETWORK_ERROR, { detail: { source: "trpc" } }));
      }
      return;
    }

    return;
  }

  if (error instanceof TypeError && typeof (error as Error).message === "string") {
    if (isLikelyNetworkFailure((error as Error).message)) {
      toast.error("Servidor offline", { id: "grs-offline" });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(GRS_API_NETWORK_ERROR, { detail: { source: "fetch" } }));
      }
    }
  }
}
