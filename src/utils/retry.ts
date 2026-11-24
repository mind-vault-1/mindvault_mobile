/**
 * Retry timing and a per-origin circuit breaker for the API client.
 *
 * Nothing here sends a request. `src/api/client.ts` decides what is safe to retry
 * (idempotent GETs only) and reports each outcome to the breaker for its origin.
 */

export interface BackoffOptions {
  /** Delay before the first retry, before jitter. */
  baseMs: number;
  /** Upper bound on any single delay, before and after jitter. */
  capMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 300, capMs: 5_000 };

/** A `Retry-After` longer than this is not waited for; the request fails instead. */
export const MAX_RETRY_AFTER_MS = 10_000;

/**
 * Exponential backoff with "equal" jitter. The ceiling doubles per attempt up to `capMs`.
 * The delay is then drawn from the upper half of that ceiling, so it is never zero and
 * clients that failed together do not all retry at the same moment.
 *
 * @param attempt zero for the first retry
 * @param random injectable source in [0, 1) so tests can fix the jitter
 */
export function backoffDelayMs(
  attempt: number,
  options: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random
): number {
  const exponent = Math.min(Math.max(attempt, 0), 30);
  const ceiling = Math.min(options.capMs, options.baseMs * 2 ** exponent);
  const half = ceiling / 2;
  return Math.min(options.capMs, Math.floor(half + random() * half));
}

/**
 * Reads a `Retry-After` header, given as delta-seconds or an HTTP date.
 * Returns null when the header is absent or unparseable.
 */
export function parseRetryAfterMs(value: string | null | undefined, now: number = Date.now()): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now);
}

export type BreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Consecutive outage failures that open the breaker. */
  failureThreshold: number;
  /** How long the breaker stays open before letting one probe request through. */
  cooldownMs: number;
  now?: () => number;
}

/**
 * Fails fast after repeated outage failures.
 *
 * - closed: every call may proceed. A success clears the failure count.
 * - open: calls are refused until `cooldownMs` has passed.
 * - half-open: one probe call may proceed. Its success closes the breaker and its
 *   failure reopens it. Other calls are refused while the probe is in flight.
 *
 * Callers must report every admitted call with exactly one of `recordSuccess`,
 * `recordFailure` or `release` (release is for calls that tell us nothing about the server,
 * such as a cancelled request).
 */
export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  get currentState(): BreakerState {
    return this.state;
  }

  /** Returns true when the call may proceed. */
  tryAcquire(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (this.now() - this.openedAt < this.options.cooldownMs) return false;
      this.state = "half-open";
      this.probeInFlight = true;
      return true;
    }
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.state = "closed";
    this.failures = 0;
    this.probeInFlight = false;
  }

  recordFailure(): void {
    this.probeInFlight = false;
    if (this.state === "half-open") {
      this.open();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) this.open();
  }

  /** The admitted call ended without telling us about the server; free a half-open probe. */
  release(): void {
    if (this.state === "half-open") this.probeInFlight = false;
  }

  private open(): void {
    this.state = "open";
    this.openedAt = this.now();
    this.failures = 0;
    this.probeInFlight = false;
  }
}

export const BREAKER_FAILURE_THRESHOLD = 5;
export const BREAKER_COOLDOWN_MS = 30_000;

const breakers = new Map<string, CircuitBreaker>();

/** The breaker shared by every request to one origin, e.g. `https://api.example.com`. */
export function breakerFor(origin: string): CircuitBreaker {
  let breaker = breakers.get(origin);
  if (!breaker) {
    breaker = new CircuitBreaker({
      failureThreshold: BREAKER_FAILURE_THRESHOLD,
      cooldownMs: BREAKER_COOLDOWN_MS,
    });
    breakers.set(origin, breaker);
  }
  return breaker;
}

/** Origin (scheme, host and port) of a URL, or the whole string if it does not parse. */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/** Test helper: forget every origin's breaker state. */
export function resetBreakers(): void {
  breakers.clear();
}
