/**
 * Camada de command com idempotência atômica e retorno padronizado.
 * Reserva a chave na mesma transação do handler; evita duplicidade mesmo com concorrência.
 */
import { nanoid } from "nanoid";
import type { Database } from "../db/index.js";
import type { InProgressResponse } from "../../shared/idempotency.js";
import { executeIdempotentCommandInService } from "../services/idempotency-command.service.js";

export type { InProgressResponse };

export type CommandResult = {
  ok: boolean;
  traceId: string;
  changes?: string[];
  warnings?: string[];
  [k: string]: unknown;
};

const IN_PROGRESS_MESSAGE = "Em processamento. Aguarde.";

export class IdempotencyInProgressError extends Error {
  constructor(message = IN_PROGRESS_MESSAGE) {
    super(message);
    this.name = "IdempotencyInProgressError";
  }
}

type CommandOptions = {
  commandName: string;
  idempotencyKey?: string | null;
};

/**
 * Executa o handler uma vez por (commandName, idempotencyKey).
 * Se a mesma key estiver em processamento: retorna objeto amigável (ok:false, inProgress:true) em vez de lançar erro.
 */
export async function executeCommand<T extends CommandResult>(
  options: CommandOptions,
  handler: (tx: Database) => Promise<T>
): Promise<T | InProgressResponse> {
  const traceId = nanoid(10);
  const { commandName, idempotencyKey } = options;

  return executeIdempotentCommandInService<T>(
    {
      commandName,
      idempotencyKey,
      traceId,
      inProgressMessage: IN_PROGRESS_MESSAGE,
    },
    handler
  );
}

/** Retorno padronizado para commands. */
export function commandResult(
  ok: boolean,
  changes: string[] = [],
  warnings: string[] = []
): CommandResult {
  return { ok, traceId: nanoid(10), changes, warnings };
}
