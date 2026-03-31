import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import { GRS_AUTH_UNAUTHORIZED_EVENT } from "./security/apiClient";

/**
 * Handler centralizado para erros tRPC.
 * Extrai a mensagem e o código do erro e exibe um toast coerente.
 * Usar em onError de qualquer mutation.
 *
 * Exemplo de uso:
 *   onError: handleTrpcError
 *   onError: (e) => handleTrpcError(e, "Erro ao salvar produto")
 */
export function handleTrpcError(
  error: unknown,
  fallbackMessage = "Ocorreu um erro. Tente novamente."
): void {
  if (error instanceof TRPCClientError) {
    const code = error.data?.code as string | undefined;
    const message = error.message || fallbackMessage;

    if (code === "UNAUTHORIZED") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(GRS_AUTH_UNAUTHORIZED_EVENT, { detail: { source: "trpc-handler" } }));
      }
      return;
    }
    if (code === "FORBIDDEN") {
      toast.error("Você não tem permissão para realizar esta ação.");
      return;
    }
    if (code === "NOT_FOUND") {
      toast.error("Registro não encontrado.");
      return;
    }
    if (code === "BAD_REQUEST") {
      toast.error(`Dados inválidos: ${message}`);
      return;
    }

    toast.error(message);
    return;
  }

  if (error instanceof Error) {
    toast.error(error.message || fallbackMessage);
    return;
  }

  toast.error(fallbackMessage);
}
