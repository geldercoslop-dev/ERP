/**
 * Camada de command com idempotência atômica e retorno padronizado.
 * Reserva a chave na mesma transação do handler; evita duplicidade mesmo com concorrência.
 */
import { nanoid } from "nanoid";
import * as db from "../db";
import type { InProgressResponse } from "@shared/idempotency";

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
  handler: (tx: any) => Promise<T>
): Promise<T | InProgressResponse> {
  const traceId = nanoid(10);
  const { commandName, idempotencyKey } = options;
  const key = idempotencyKey?.trim() || null;

  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  return await (conn as any).transaction(async (tx: any) => {
    if (key) {
      const reserve = await db.reserveIdempotencyKey(tx, commandName, key);
      if (!reserve.reserved) {
        if (reserve.resultJson != null) {
          try {
            const parsed = JSON.parse(reserve.resultJson) as T;
            return { ...parsed, traceId: parsed.traceId ?? reserve.traceId ?? traceId };
          } catch {
            // JSON inválido: deixa seguir e reexecutar
          }
        } else {
          const inProgress: InProgressResponse = {
            ok: false,
            inProgress: true,
            traceId: reserve.traceId ?? traceId,
            message: IN_PROGRESS_MESSAGE,
          };
          return inProgress;
        }
      }
    }

    const result = await handler(tx);
    const resultForStorage = { ...result, traceId: result.traceId ?? traceId };

    if (key) {
      await db.updateIdempotencyResult(
        tx,
        commandName,
        key,
        JSON.stringify(resultForStorage),
        resultForStorage.traceId
      );
    }
    return resultForStorage as T;
  });
}

/** Retorno padronizado para commands. */
export function commandResult(
  ok: boolean,
  changes: string[] = [],
  warnings: string[] = []
): CommandResult {
  return { ok, traceId: nanoid(10), changes, warnings };
}
