import * as db from "../db/index.js";
import { buildBootstrapInvocation, runWithServiceInvocationAsync } from "../runtime/service-invocation.js";
import { InfrastructureError } from "../_core/errors/typed-errors.js";
export async function executeIdempotentCommandInService(options, handler) {
    const { commandName, idempotencyKey, traceId, inProgressMessage } = options;
    const key = idempotencyKey?.trim() || null;
    return runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
        const conn = await db.getDb();
        if (!conn) {
            throw new InfrastructureError("Database not available");
        }
        return conn.transaction(async (tx) => {
            if (key) {
                const reserve = await db.reserveIdempotencyKey(tx, commandName, key);
                if (!reserve.reserved) {
                    const result = reserve;
                    if (result.resultJson != null) {
                        try {
                            const parsed = JSON.parse(result.resultJson);
                            return {
                                ...parsed,
                                traceId: parsed.traceId ?? result.traceId ?? traceId,
                            };
                        }
                        catch {
                            // JSON inválido: deixa seguir e reexecutar.
                        }
                    }
                    const inProgress = {
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
