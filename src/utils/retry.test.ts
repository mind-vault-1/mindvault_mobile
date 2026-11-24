import { request, ApiError } from '../api/client';
import {
  backoffDelayMs,
  BREAKER_COOLDOWN_MS,
  BREAKER_FAILURE_THRESHOLD,
  CircuitBreaker,
  DEFAULT_BACKOFF,
  MAX_RETRY_AFTER_MS,
  parseRetryAfterMs,
  resetBreakers,
} from './retry';

const URL = 'https://api.retry.test/resources';

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

const networkError = () => new TypeError('Network request failed');

const originalFetch = global.fetch;

function useFetch(mock: jest.Mock): jest.Mock {
  global.fetch = mock as unknown as typeof global.fetch;
  return mock;
}

beforeEach(() => {
  resetBreakers();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

describe('backoffDelayMs', () => {
  it('doubles the ceiling per attempt and stays within the jitter band', () => {
    // random() = 0 gives the floor of the band (half the ceiling); 1 gives the ceiling.
    expect(backoffDelayMs(0, DEFAULT_BACKOFF, () => 0)).toBe(150);
    expect(backoffDelayMs(0, DEFAULT_BACKOFF, () => 0.999)).toBe(299);
    expect(backoffDelayMs(1, DEFAULT_BACKOFF, () => 0)).toBe(300);
    expect(backoffDelayMs(2, DEFAULT_BACKOFF, () => 0)).toBe(600);
  });

  it('never exceeds the cap, however many attempts', () => {
    expect(backoffDelayMs(20, DEFAULT_BACKOFF, () => 1)).toBeLessThanOrEqual(DEFAULT_BACKOFF.capMs);
    expect(backoffDelayMs(20, DEFAULT_BACKOFF, () => 0)).toBe(DEFAULT_BACKOFF.capMs / 2);
  });

  it('is never zero, so a retry always waits', () => {
    expect(backoffDelayMs(0, DEFAULT_BACKOFF, () => 0)).toBeGreaterThan(0);
  });
});

describe('parseRetryAfterMs', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2_000);
    expect(parseRetryAfterMs(' 0 ')).toBe(0);
  });

  it('reads an HTTP date relative to now, never negative', () => {
    const now = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');
    expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:05 GMT', now)).toBe(5_000);
    expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:27:00 GMT', now)).toBe(0);
  });

  it('returns null when absent or unparseable', () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
    expect(parseRetryAfterMs('soon')).toBeNull();
  });
});

describe('CircuitBreaker', () => {
  function makeBreaker(now: { t: number }) {
    return new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1_000, now: () => now.t });
  }

  it('opens after the failure threshold and fails fast while open', () => {
    const now = { t: 0 };
    const breaker = makeBreaker(now);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.currentState).toBe('closed');
    breaker.recordFailure();
    expect(breaker.currentState).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('a success resets the failure count', () => {
    const now = { t: 0 };
    const breaker = makeBreaker(now);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.currentState).toBe('closed');
  });

  it('half-opens after the cooldown and lets exactly one probe through', () => {
    const now = { t: 0 };
    const breaker = makeBreaker(now);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    now.t = 999;
    expect(breaker.tryAcquire()).toBe(false);
    now.t = 1_000;
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.currentState).toBe('half-open');
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('closes when the half-open probe succeeds', () => {
    const now = { t: 0 };
    const breaker = makeBreaker(now);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    now.t = 1_000;
    breaker.tryAcquire();
    breaker.recordSuccess();
    expect(breaker.currentState).toBe('closed');
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('reopens when the half-open probe fails', () => {
    const now = { t: 0 };
    const breaker = makeBreaker(now);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    now.t = 1_000;
    breaker.tryAcquire();
    breaker.recordFailure();
    expect(breaker.currentState).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('release frees a half-open probe without changing the state', () => {
    const now = { t: 0 };
    const breaker = makeBreaker(now);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    now.t = 1_000;
    breaker.tryAcquire();
    breaker.release();
    expect(breaker.currentState).toBe('half-open');
    expect(breaker.tryAcquire()).toBe(true);
  });
});

describe('request retry behaviour', () => {
  it('waits the Retry-After delay before retrying a GET', async () => {
    jest.useFakeTimers();
    const fetchMock = useFetch(
      jest
        .fn()
        .mockResolvedValueOnce(response({ error: 'slow down' }, 503, { 'retry-after': '3' }))
        .mockResolvedValueOnce(response({ ok: true }))
    );

    const pending = request(URL);
    await jest.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when Retry-After asks for longer than the allowed wait', async () => {
    const fetchMock = useFetch(
      jest
        .fn()
        .mockResolvedValue(
          response({ error: 'later' }, 503, { 'retry-after': String(MAX_RETRY_AFTER_MS / 1000 + 1) })
        )
    );

    await expect(request(URL)).rejects.toMatchObject({ kind: 'http', status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a write, even when the origin fails', async () => {
    const fetchMock = useFetch(jest.fn().mockRejectedValue(networkError()));

    await expect(request(URL, { method: 'POST', body: { amount: '5' } })).rejects.toMatchObject({
      kind: 'network',
    });
    await expect(request(URL, { method: 'DELETE' })).rejects.toMatchObject({ kind: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a 5xx on a write is not retried either', async () => {
    const fetchMock = useFetch(jest.fn().mockResolvedValue(response({ error: 'boom' }, 500)));

    await expect(request(URL, { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('circuit breaker in the client', () => {
  it('fails fast with an unavailable error once the origin is down, without sending', async () => {
    const fetchMock = useFetch(jest.fn().mockRejectedValue(networkError()));

    // Each POST is one failed attempt, so this many calls opens the breaker.
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i += 1) {
      await expect(request(URL, { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'network' });
    }
    const callsBeforeOpen = fetchMock.mock.calls.length;

    await expect(request(URL, { method: 'POST', body: {} })).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(fetchMock.mock.calls.length).toBe(callsBeforeOpen);
  });

  it('keeps breakers separate per origin', async () => {
    useFetch(jest.fn().mockRejectedValue(networkError()));
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i += 1) {
      await request(URL, { method: 'POST', body: {} }).catch(() => undefined);
    }

    const other = useFetch(jest.fn().mockResolvedValue(response({ ok: true })));
    await expect(request('https://other.retry.test/x', { method: 'POST', body: {} })).resolves.toMatchObject({
      data: { ok: true },
    });
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('a 4xx still counts as the server answering, so it does not open the breaker', async () => {
    useFetch(jest.fn().mockResolvedValue(response({ error: 'nope' }, 404)));
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD + 2; i += 1) {
      await expect(request(URL)).rejects.toMatchObject({ kind: 'http', status: 404 });
    }
  });

  it('recovers after the cooldown when the probe succeeds', async () => {
    jest.useFakeTimers();
    const fetchMock = useFetch(jest.fn().mockRejectedValue(networkError()));
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i += 1) {
      const pending = request(URL, { method: 'POST', body: {} }).catch((err: unknown) => err);
      await jest.advanceTimersByTimeAsync(0);
      await pending;
    }
    await expect(request(URL, { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'unavailable' });

    await jest.advanceTimersByTimeAsync(BREAKER_COOLDOWN_MS);
    fetchMock.mockResolvedValueOnce(response({ ok: true }));
    await expect(request(URL, { method: 'POST', body: {} })).resolves.toMatchObject({ data: { ok: true } });
    await expect(request(URL, { method: 'POST', body: {} })).resolves.toMatchObject({ data: { ok: true } });
  });
});
