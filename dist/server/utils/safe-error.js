/**
 * Mensagem segura a partir de valores capturados em catch (sem assumir Error).
 */
export function getErrorMessage(error) {
    return error instanceof Error ? error.message : "unknown error";
}
