import * as db from "../db/index.js";
import type { Database } from "../db/index.js";
import type { InProgressResponse } from "../../shared/idempotency.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../_core/service-entry-guard.js";
import { InfrastructureError } from "../_core/errors/typed-errors.js";

type StoredCommandResult = { traceId?: string } & Record<string, unknown>;

export interface IdempotentCommandExecutionOptions {
  commandName: string;
  idempotencyKey?: string | null;
  traceId: string;
  inProgressMessage: string;
}

export async function executeIdempotentCommandInService<T extends StoredCommandResult>(
  options: IdempotentCommandExecutionOptions,
  handler: (tx: Database) => Promise<T>
): Promise<T | InProgressResponse> {
  const { commandName, idempotencyKey, traceId, inProgressMessage } = options;
  const key = idempotencyKey?.trim() || null;

  return runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
    const conn = await db.getDb();
    if (!conn) {
      throw new InfrastructureError("Database not available");
    }

    return (conn as unknown as {
      transaction: <R>(fn: (tx: Database) => Promise<R>) => Promise<R>;
    }).transaction(async (tx: Database) => {
      if (key) {
        const reserve = await db.reserveIdempotencyKey(tx, commandName, key);
        if (!reserve.reserved) {
          const result = reserve as unknown as { resultJson: string | null; traceId: string | null };
          if (result.resultJson != null) {
            try {
              const parsed = JSON.parse(result.resultJson) as T;
              return {
                ...parsed,
                traceId: parsed.traceId ?? result.traceId ?? traceId,
              };
            } catch {
              // JSON inválido: deixa seguir e reexecutar.
            }
          }

          const inProgress: InProgressResponse = {
            ok: false,
            inProgress: true,
            traceId: result.traceId ?? traceId,
            message: inProgressMessage,
          };
          return inProgress;
        }
      }

      const commandResult = await handler(tx);
      const resultForStorage = { ...commandResult, traceId: commandResult.traceId ?? traceId };

      if (key) {
        await db.updateIdempotencyResult(tx, commandName, key, JSON.stringify(resultForStorage), resultForStorage.traceId);
      }

      return resultForStorage;
    });
  });
}