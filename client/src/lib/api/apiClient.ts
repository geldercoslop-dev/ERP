import { authenticatedFetch } from "../security/apiClient";
import { stripForbiddenIdentityKeys } from "../security/sanitizePayload";
import { logger } from "../logger/frontendLogger";

type Primitive = string | number | boolean | null;
type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };

export type BackendErrorShape = {
  error: {
    code: string;
    message: string;
    details?: {
      requestId?: string;
      [key: string]: unknown;
    };
  };
};

export type ApiError = {
  code: string;
  message: string;
  status: number;
  requestId?: string;
  isNetworkError: boolean;
  isTimeout: boolean;
};

export type ApiResult<T> =
  | { ok: true; status: number; data: T; requestId?: string }
  | { ok: false; status: number; error: ApiError };

export type ApiRequestOptions<TPayload = undefined> = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  payload?: TPayload;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

export function isBackendErrorShape(value: unknown): value is BackendErrorShape {
  if (!value || typeof value !== "object") return false;
  const root = value as Record<string, unknown>;
  if (!root.error || typeof root.error !== "object") return false;
  const error = root.error as Record<string, unknown>;
  return typeof error.code === "string" && typeof error.message === "string";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeSignals(signalA?: AbortSignal, signalB?: AbortSignal): AbortSignal | undefined {
  if (!signalA) return signalB;
  if (!signalB) return signalA;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signalA.addEventListener("abort", abort);
  signalB.addEventListener("abort", abort);
  return controller.signal;
}

function safeJsonParse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function shouldRetry(status: number, error: ApiError): boolean {
  if (error.isNetworkError || error.isTimeout) return true;
  if (status >= 500) return true;
  return false;
}

function toApiError(status: number, body: unknown, requestId?: string): ApiError {
  if (isBackendErrorShape(body)) {
    return {
      code: body.error.code,
      message: body.error.message,
      status,
      requestId: body.error.details?.requestId ?? requestId,
      isNetworkError: false,
      isTimeout: false,
    };
  }

  const fallbackMessage =
    typeof body === "string" && body.trim().length > 0
      ? body
      : `Falha na requisição (${status})`;
  const fallbackCode =
    status === 404
      ? "NOT_FOUND"
      : status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "FORBIDDEN"
          : status >= 500
            ? "SERVER_ERROR"
            : "HTTP_ERROR";

  return {
    code: fallbackCode,
    message: fallbackMessage,
    status,
    requestId,
    isNetworkError: false,
    isTimeout: false,
  };
}

export async function apiClient<TResponse, TPayload = undefined>(
  endpoint: string,
  options: ApiRequestOptions<TPayload> = {}
): Promise<ApiResult<TResponse>> {
  const {
    method = "GET",
    payload,
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    signal,
  } = options;

  const sanitizedPayload = payload === undefined ? undefined : stripForbiddenIdentityKeys(payload);
  let attempt = 0;

  while (attempt <= retries) {
    attempt += 1;
    const startedAt = performance.now();
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);

    try {
      const response = await authenticatedFetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
        body: sanitizedPayload === undefined ? undefined : JSON.stringify(sanitizedPayload),
        signal: mergeSignals(signal, timeoutController.signal),
      });

      clearTimeout(timeoutHandle);
      const requestId = response.headers.get("x-request-id") ?? undefined;
      const bodyText = await response.text();
      const parsedBody = safeJsonParse(bodyText);
      const durationMs = Math.round(performance.now() - startedAt);

      if (response.ok) {
        logger.apiSuccess({
          endpoint,
          method,
          status: response.status,
          requestId,
          durationMs,
        });

        return {
          ok: true,
          status: response.status,
          data: parsedBody as TResponse,
          requestId,
        };
      }

      const apiError = toApiError(response.status, parsedBody, requestId);
      logger.apiError({
        endpoint,
        method,
        status: response.status,
        message: apiError.message,
        requestId: apiError.requestId,
        durationMs,
      });

      if (attempt <= retries && shouldRetry(response.status, apiError)) {
        await sleep(200 * attempt);
        continue;
      }

      return { ok: false, status: response.status, error: apiError };
    } catch (cause) {
      clearTimeout(timeoutHandle);

      const error = cause instanceof Error ? cause : new Error(String(cause));
      const isTimeout = error.name === "AbortError";
      const apiError: ApiError = {
        code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        message: isTimeout ? "A requisição excedeu o tempo limite." : "Falha de rede ao chamar a API.",
        status: 0,
        isNetworkError: !isTimeout,
        isTimeout,
      };

      logger.apiError({
        endpoint,
        method,
        status: 0,
        message: apiError.message,
      });

      if (attempt <= retries && shouldRetry(0, apiError)) {
        await sleep(200 * attempt);
        continue;
      }

      return { ok: false, status: 0, error: apiError };
    }
  }

  return {
    ok: false,
    status: 0,
    error: {
      code: "UNKNOWN",
      message: "Falha inesperada na chamada de API.",
      status: 0,
      isNetworkError: true,
      isTimeout: false,
    },
  };
}
