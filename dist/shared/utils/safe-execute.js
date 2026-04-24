export function safeExecute(fn, context) {
    try {
        return fn();
    }
    catch (error) {
        // const message = error instanceof Error ? error.message : "Erro desconhecido";
        // logMessage("error", message, {
        //   ...(context ?? {}),
        //   source: "safeExecute",
        // });
        return null;
    }
}
