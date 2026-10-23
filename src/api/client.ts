import { extractApiErrorMessage } from "../utils/errorLogger";

/** Requests that take longer than this are aborted and reported as timeouts. */
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Extra attempts for GET requests after a network error or 5xx response. */
const GET_RETRY_LIMIT = 2;
const RETRY_BASE_DELAY_MS = 300;

const NETWORK_MESSAGE = "Network error. Please check your connection.";
const TIMEOUT_MESSAGE = "The request timed out. Please try again.";
const CANCELLED_MESSAGE = "The request was cancelled.";

export type HttpMethod = "GET" | "POST" | "DELETE";

export type ApiErrorKind = "network" | "timeout" | "aborted" | "http";

/** Every failed request throws this. `status` is only set for `http` errors. */
export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    /** Response headers for `http` errors, e.g. a 402's payment challenge. */
    public readonly headers?: Response["headers"]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A fixed message, or one picked by the HTTP status when the server sends no message. */
export type FallbackMessage = string | ((status: number) => string);

export interface RequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  /** Lets the caller cancel the request, e.g. when a screen unmounts. */
  signal?: AbortSignal;
  timeoutMs?: number;
  fallbackMessage?: FallbackMessage;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Response["headers"];
}

function resolveFallback(fallback: FallbackMessage | undefined, status: number): string {
  if (typeof fallback === "function") return fallback(status);
  return fallback ?? "Request failed.";
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.kind === "network" || (error.kind === "http" && (error.status ?? 0) >= 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function send<T>(url: string, method: HttpMethod, options: RequestOptions): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const callerSignal = options.signal;
  let timedOut = false;
  const cancelFromCaller = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  callerSignal?.addEventListener("abort", cancelFromCaller);
  if (callerSignal?.aborted) controller.abort();

  // Work out why a call stopped early: our timer, the caller, or neither (a network failure).
  const interruption = (): ApiError | null => {
    if (timedOut) return new ApiError("timeout", TIMEOUT_MESSAGE);
    if (callerSignal?.aborted) return new ApiError("aborted", CANCELLED_MESSAGE);
    return null;
  };

  try {
    const res = await fetch(url, {
      method,
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    }).catch(() => {
      throw interruption() ?? new ApiError("network", NETWORK_MESSAGE);
    });

    if (!res.ok) {
      const message = await extractApiErrorMessage(
        res,
        resolveFallback(options.fallbackMessage, res.status)
      );
      throw new ApiError("http", message, res.status, res.headers);
    }

    // A 204 No Content response has no body to parse.
    const data = res.status === 204
      ? undefined
      : await res.json().catch((error: unknown) => {
          throw interruption() ?? error;
        });
    return { data: data as T, status: res.status, headers: res.headers };
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancelFromCaller);
  }
}

/**
 * Sends a request to the MindVault API.
 *
 * Throws an {@link ApiError} for network failures, timeouts, cancellation and
 * non-2xx responses, so callers can branch on `kind` and `status`. GET requests
 * retry network errors and 5xx responses with exponential backoff. Mutations
 * (POST, DELETE) are never retried automatically, because a retry could repeat
 * a side effect such as a payment.
 */
export async function request<T>(url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const method = options.method ?? "GET";
  const retries = method === "GET" ? GET_RETRY_LIMIT : 0;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send<T>(url, method, options);
    } catch (error) {
      if (attempt >= retries || !isRetryable(error) || options.signal?.aborted) {
        throw error;
      }
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
}
