/**
 * Timeouts de operações críticas para uso em services (não em controllers).
 */
export async function withExternalRequestTimeout<T>(
  operation: Promise<T>,
  timeoutMs = 10_000,
  operationName = "EXTERNAL_REQUEST"
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operationName}_TIMEOUT_${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

export async function withCriticalDbTimeout<T>(
  operation: Promise<T>,
  timeoutMs = 5_000,
  operationName = "CRITICAL_DB_QUERY"
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operationName}_TIMEOUT_${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}
