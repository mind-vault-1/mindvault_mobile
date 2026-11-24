import { extractApiErrorMessage } from "../utils/errorLogger";
import {
  backoffDelayMs,
  breakerFor,
  MAX_RETRY_AFTER_MS,
  originOf,
  parseRetryAfterMs,
} from "../utils/retry";

/** Requests that take longer than this are aborted and reported as timeouts. */
export const DEFAULT_TIMEOUT_MS = 15_000;
/** Extra attempts for GET requests after a network error or 5xx response. */
const GET_RETRY_LIMIT = 2;

const NETWORK_MESSAGE = "Network error. Please check your connection.";
const TIMEOUT_MESSAGE = "The request timed out. Please try again.";
const CANCELLED_MESSAGE = "The request was cancelled.";
const UNAVAILABLE_MESSAGE = "The server is unavailable right now. Please try again shortly.";

export type HttpMethod = "GET" | "POST" | "DELETE";

/**
 * `aborted` means the caller cancelled. Callers should ignore it rather than show an error.
 * `unavailable` means the origin's circuit breaker is open and no request was sent.
 */
export type ApiErrorKind = "network" | "timeout" | "aborted" | "unavailable" | "http";

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

/** True for the typed error a cancelled request rejects with. Ignore it; it is not a failure. */
export function isAbortError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.kind === "aborted";
}

/** A fixed message, or one picked by the HTTP status when the server sends no message. */
export type FallbackMessage = string | ((status: number) => string);

/** Validates and narrows an untrusted JSON/text response body. */
export type ResponseSchema<T> = (value: unknown) => T;

export interface RequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  /** Lets the caller cancel the request, e.g. when a screen unmounts. */
  signal?: AbortSignal;
  timeoutMs?: number;
  fallbackMessage?: FallbackMessage;
  /** Parse the body as text instead of JSON (x402 resources can be plain text). */
  responseType?: "json" | "text";
  /** For text responses, don't buffer opaque/binary bodies; only headers are used. */
  skipBodyForBinary?: boolean;
  /** Use only `fallbackMessage` for HTTP errors, ignoring a server-supplied body. */
  ignoreErrorBody?: boolean;
  /** Runs after parsing, so API modules can validate the shape they expect. */
  schema?: ResponseSchema<unknown>;
  /** Set false for a GET that must not be replayed, e.g. a payment attempt. */
  retry?: boolean;
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

async function readTextBody(
  res: Response,
  options: RequestOptions,
  interruption: () => ApiError | null
): Promise<string> {
  const contentType = res.headers?.get?.("content-type") ?? "";
  const isTextual = !contentType || /text|json|xml|javascript/i.test(contentType);
  if (options.skipBodyForBinary && !isTextual) return "";
  if (typeof res.text !== "function") return "";
  return res.text().catch((error: unknown) => {
    throw interruption() ?? error;
  });
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
      const fallback = resolveFallback(options.fallbackMessage, res.status);
      const message = options.ignoreErrorBody
        ? fallback
        : await extractApiErrorMessage(res, fallback);
      throw new ApiError("http", message, res.status, res.headers);
    }

    // A 204 No Content response has no body to parse.
    const raw = res.status === 204
      ? undefined
      : options.responseType === "text"
        ? await readTextBody(res, options, interruption)
        : await res.json().catch((error: unknown) => {
            throw interruption() ?? error;
          });

    let data: T;
    if (options.schema) {
      try {
        data = options.schema(raw) as T;
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error("The server returned an unexpected response.");
      }
    } else {
      data = raw as T;
    }
    return { data, status: res.status, headers: res.headers };
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
  if (options.signal?.aborted) {
    throw new ApiError("aborted", CANCELLED_MESSAGE);
  }
  const method = options.method ?? "GET";
  // Identical concurrent GETs share one network call. Opt-out requests (retry: false) never share.
  const shareKey = method === "GET" && options.retry !== false ? sharedKeyFor(url, options) : null;
  if (shareKey === null) {
    return retryLoop<T>(url, method, options);
  }

  const existing = inFlight.get(shareKey);
  if (existing) return join<T>(shareKey, existing, options.signal);

  const shared: SharedRequest = {
    controller: new AbortController(),
    subscribers: 0,
    promise: Promise.resolve(undefined as never),
  };
  shared.promise = retryLoop<unknown>(url, method, {
    ...options,
    signal: shared.controller.signal,
  }).finally(() => {
    if (inFlight.get(shareKey) === shared) inFlight.delete(shareKey);
  });
  inFlight.set(shareKey, shared);
  return join<T>(shareKey, shared, options.signal);
}

/**
 * Attempts one request, retrying idempotent GETs on network errors and 5xx responses.
 * Every attempt goes through the origin's circuit breaker.
 */
async function retryLoop<T>(
  url: string,
  method: HttpMethod,
  options: RequestOptions
): Promise<ApiResponse<T>> {
  const retries = method === "GET" && options.retry !== false ? GET_RETRY_LIMIT : 0;
  const breaker = breakerFor(originOf(url));

  for (let attempt = 0; ; attempt += 1) {
    if (!breaker.tryAcquire()) {
      throw new ApiError("unavailable", UNAVAILABLE_MESSAGE);
    }
    try {
      const response = await send<T>(url, method, options);
      breaker.recordSuccess();
      return response;
    } catch (error) {
      if (isAbortError(error)) {
        breaker.release();
      } else if (isOutage(error)) {
        breaker.recordFailure();
      } else {
        // A 4xx or a parse/schema failure still means the server answered.
        breaker.recordSuccess();
      }

      if (attempt >= retries || !isRetryable(error) || options.signal?.aborted) {
        throw error;
      }
      const retryAfter =
        error instanceof ApiError && error.kind === "http"
          ? parseRetryAfterMs(error.headers?.get("retry-after"))
          : null;
      if (retryAfter !== null && retryAfter > MAX_RETRY_AFTER_MS) {
        // The server asked for a longer wait than a user-facing request should block on.
        throw error;
      }
      await sleep(retryAfter ?? backoffDelayMs(attempt));
    }
  }
}

/** Failures that count against the breaker: the server or network did not answer normally. */
function isOutage(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === "http") return (error.status ?? 0) >= 500;
  return error.kind === "network" || error.kind === "timeout";
}

interface SharedRequest {
  controller: AbortController;
  subscribers: number;
  promise: Promise<ApiResponse<unknown>>;
}

/** In-flight shareable GETs keyed by URL and every option that changes the result. */
const inFlight = new Map<string, SharedRequest>();

const identityIds = new WeakMap<object, number>();
let nextIdentityId = 1;

/** Stable small id for a function, so two different schemas never share a result. */
function identityOf(value: unknown): string {
  if (value === undefined) return "-";
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "function") {
    let id = identityIds.get(value);
    if (id === undefined) {
      id = nextIdentityId;
      nextIdentityId += 1;
      identityIds.set(value, id);
    }
    return `f:${id}`;
  }
  return "-";
}

function sharedKeyFor(url: string, options: RequestOptions): string {
  const headers = Object.keys(options.headers ?? {})
    .sort()
    .map((name) => `${name}=${options.headers?.[name]}`)
    .join("&");
  return [
    url,
    headers,
    options.responseType ?? "json",
    identityOf(options.schema),
    identityOf(options.fallbackMessage),
    options.ignoreErrorBody ? "1" : "0",
    options.skipBodyForBinary ? "1" : "0",
  ].join("|");
}

/**
 * Subscribes a caller to a shared request. The caller's own cancellation only detaches that
 * caller. The network call is aborted once no subscriber is left.
 */
function join<T>(key: string, shared: SharedRequest, callerSignal?: AbortSignal): Promise<ApiResponse<T>> {
  return new Promise<ApiResponse<T>>((resolve, reject) => {
    if (callerSignal?.aborted) {
      reject(new ApiError("aborted", CANCELLED_MESSAGE));
      return;
    }
    shared.subscribers += 1;
    const onAbort = () => {
      shared.subscribers -= 1;
      if (shared.subscribers === 0) {
        shared.controller.abort();
        if (inFlight.get(key) === shared) inFlight.delete(key);
      }
      reject(new ApiError("aborted", CANCELLED_MESSAGE));
    };
    callerSignal?.addEventListener("abort", onAbort, { once: true });
    shared.promise.then(
      (value) => {
        callerSignal?.removeEventListener("abort", onAbort);
        resolve(value as ApiResponse<T>);
      },
      (error: unknown) => {
        callerSignal?.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
