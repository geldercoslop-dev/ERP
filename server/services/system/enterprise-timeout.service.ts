/**
 * Timeouts de operações críticas para uso em services (não em controllers).
 */
export async function withExternalRequestTimeout<T>(
  operation: Promise<T>,
  timeoutMs = 10_000,
  operationName = "EXTERNAL_REQUEST"
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${operationName}_TIMEOUT_${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function withCriticalDbTimeout<T>(
  operation: Promise<T>,
  timeoutMs = 5_000,
  operationName = "CRITICAL_DB_QUERY"
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${operationName}_TIMEOUT_${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
