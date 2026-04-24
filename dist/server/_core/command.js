/**
 * Camada de command com idempotência atômica e retorno padronizado.
 * Reserva a chave na mesma transação do handler; evita duplicidade mesmo com concorrência.
 */
import { nanoid } from "nanoid";
import { executeIdempotentCommandInService } from "../services/idempotency-command.service.js";
const IN_PROGRESS_MESSAGE = "Em processamento. Aguarde.";
export class IdempotencyInProgressError extends Error {
    constructor(message = IN_PROGRESS_MESSAGE) {
        super(message);
        this.name = "IdempotencyInProgressError";
    }
}
/**
 * Executa o handler uma vez por (commandName, idempotencyKey).
 * Se a mesma key estiver em processamento: retorna objeto amigável (ok:false, inProgress:true) em vez de lançar erro.
 */
export async function executeCommand(options, handler) {
    const traceId = nanoid(10);
    const { commandName, idempotencyKey } = options;
    return executeIdempotentCommandInService({
        commandName,
        idempotencyKey,
        traceId,
        inProgressMessage: IN_PROGRESS_MESSAGE,
    }, handler);
}
/** Retorno padronizado para commands. */
export function commandResult(ok, changes = [], warnings = []) {
    return { ok, traceId: nanoid(10), changes, warnings };
}
