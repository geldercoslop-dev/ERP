/**
 * Tipo e type guard para resposta "em processamento" de comandos idempotentes.
 * Usado no server (routers) e no client para narrowing seguro.
 */
export type InProgressResponse = {
  ok: false;
  inProgress: true;
  traceId: string;
  message?: string; // opcional, usado no client para toast
};

export function isInProgress(res: unknown): res is InProgressResponse {
  return (
    typeof res === "object" &&
    res !== null &&
    (res as Record<string, unknown>).ok === false &&
    (res as Record<string, unknown>).inProgress === true
  );
}
