import { apiClient, type ApiError as EnterpriseApiError } from "@/lib/api/apiClient";

export interface FetchWithHandlingOptions {
  timeout?: number;
  retryCount?: number;
  showRetryButton?: boolean;
}

export interface ApiError {
  status: number;
  message: string;
  code?: string;
  requestId?: string;
  isNetworkError?: boolean;
  isTimeout?: boolean;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  ok: boolean;
  status: number;
  retry?: () => Promise<ApiResponse<T>>;
}

export async function fetchWithHandling<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number },
  options: FetchWithHandlingOptions = {}
): Promise<ApiResponse<T>> {
  const timeout = options.timeout ?? init?.timeout ?? 5000;
  const retryCount = options.retryCount ?? 2;
  const showRetryButton = options.showRetryButton ?? true;
  const endpoint = typeof input === "string" ? input : input.toString();
  const method = toApiMethod(init?.method);
  const payload = parseBody(init?.body);

  const result = await apiClient<T, Record<string, unknown> | undefined>(endpoint, {
    method,
    payload,
    headers: parseHeaders(init?.headers),
    timeoutMs: timeout,
    retries: retryCount,
    signal: init?.signal ?? undefined,
  });

  if (result.ok) {
    return { ok: true, status: result.status, data: result.data };
  }

  const mappedError: ApiError = mapEnterpriseError(result.error);
  const response: ApiResponse<T> = {
    ok: false,
    status: result.status,
    error: mappedError,
  };
  if (showRetryButton) {
    response.retry = () => fetchWithHandling<T>(input, init, options);
  }
  return response;
}

export function createApiHook<T = unknown>(
  url: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchWithHandlingOptions
) {
  return {
    async execute(): Promise<ApiResponse<T>> {
      return fetchWithHandling<T>(url, init, options);
    }
  };
}

function parseHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> | undefined {
  if (!body || typeof body !== "string") return undefined;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function mapEnterpriseError(error: EnterpriseApiError): ApiError {
  return {
    status: error.status,
    message: error.message,
    code: error.code,
    requestId: error.requestId,
    isNetworkError: error.isNetworkError,
    isTimeout: error.isTimeout,
  };
}

function toApiMethod(method?: string): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" {
  const normalized = (method ?? "GET").toUpperCase();
  if (normalized === "POST") return "POST";
  if (normalized === "PUT") return "PUT";
  if (normalized === "PATCH") return "PATCH";
  if (normalized === "DELETE") return "DELETE";
  return "GET";
}
