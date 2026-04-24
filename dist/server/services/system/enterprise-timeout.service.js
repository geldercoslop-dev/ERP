/**
 * Timeouts de operações críticas para uso em services (não em controllers).
 */
export async function withExternalRequestTimeout(operation, timeoutMs = 10_000, operationName = "EXTERNAL_REQUEST") {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${operationName}_TIMEOUT_${timeoutMs}ms`)), timeoutMs);
    });
    try {
        return await Promise.race([operation, timeoutPromise]);
    }
    finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
}
export async function withCriticalDbTimeout(operation, timeoutMs = 5_000, operationName = "CRITICAL_DB_QUERY") {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${operationName}_TIMEOUT_${timeoutMs}ms`)), timeoutMs);
    });
    try {
        return await Promise.race([operation, timeoutPromise]);
    }
    finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
}
