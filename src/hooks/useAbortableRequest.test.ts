import { act, renderHook, waitFor } from "@testing-library/react-native";

import { ApiError, isAbortError, request } from "../api/client";
import { resetBreakers } from "../utils/retry";
import { useAbortableRequest } from "./useAbortableRequest";

const URL = "https://api.abortable.test/feed";

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  };
}

/**
 * A fetch whose calls resolve only when the test says so. Each pending call records the
 * signal it was given, and rejects if that signal is aborted.
 */
function controllableFetch() {
  const pending: { resolve: (value: unknown) => void; signal?: AbortSignal }[] = [];
  const mock = jest.fn((_url: string, init?: RequestInit) => {
    return new Promise((resolve, reject) => {
      const signal = init?.signal ?? undefined;
      pending.push({ resolve, signal });
      signal?.addEventListener("abort", () => reject(new TypeError("aborted")));
    });
  });
  return { mock, pending };
}

/** Resolves with the rejection, failing the test if the promise resolves instead. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected the request to be rejected");
    },
    (error: unknown) => error
  );
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  resetBreakers();
});

describe("useAbortableRequest", () => {
  it("returns the data once the run resolves", async () => {
    const { result } = renderHook(() => useAbortableRequest(async () => ({ count: 2 }), []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ count: 2 });
    expect(result.current.error).toBeUndefined();
  });

  it("aborts the previous run when a dependency changes", () => {
    const signals: AbortSignal[] = [];
    const { rerender } = renderHook(
      ({ id }: { id: string }) =>
        useAbortableRequest(
          (signal) => {
            signals.push(signal);
            return new Promise(() => undefined);
          },
          [id]
        ),
      { initialProps: { id: "a" } }
    );
    expect(signals[0].aborted).toBe(false);

    rerender({ id: "b" });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("aborts the pending run on unmount", () => {
    const signals: AbortSignal[] = [];
    const { unmount } = renderHook(() =>
      useAbortableRequest(
        (signal) => {
          signals.push(signal);
          return new Promise(() => undefined);
        },
        []
      )
    );
    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it("drops a result that arrives after the dependencies changed", async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useAbortableRequest<string>(
          () => {
            if (id === "a") {
              return new Promise<string>((resolve) => {
                resolveFirst = resolve;
              });
            }
            return Promise.resolve(`value-${id}`);
          },
          [id]
        ),
      { initialProps: { id: "a" } }
    );

    rerender({ id: "b" });
    await waitFor(() => expect(result.current.data).toBe("value-b"));

    await act(async () => {
      resolveFirst("stale-a");
    });
    expect(result.current.data).toBe("value-b");
  });

  it("does not show an error when a run rejects with a cancellation", async () => {
    const { result } = renderHook(() =>
      useAbortableRequest<string>(
        () => Promise.reject(new ApiError("aborted", "The request was cancelled.")),
        []
      )
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeUndefined();
  });

  it("reports a real failure as an error", async () => {
    const { result } = renderHook(() =>
      useAbortableRequest(() => Promise.reject(new Error("Server exploded")), [])
    );
    await waitFor(() => expect(result.current.error?.message).toBe("Server exploded"));
    expect(result.current.loading).toBe(false);
  });
});

describe("apiClient request sharing and abort propagation", () => {
  it("shares one network call between identical concurrent GETs", async () => {
    const { mock, pending } = controllableFetch();
    global.fetch = mock as unknown as typeof global.fetch;

    const first = request<{ n: number }>(URL);
    const second = request<{ n: number }>(URL);
    expect(mock).toHaveBeenCalledTimes(1);

    pending[0].resolve(response({ n: 7 }));
    await expect(first).resolves.toMatchObject({ data: { n: 7 } });
    await expect(second).resolves.toMatchObject({ data: { n: 7 } });
  });

  it("does not share a GET that asked not to be replayed", async () => {
    const { mock, pending } = controllableFetch();
    global.fetch = mock as unknown as typeof global.fetch;

    const first = request(URL, { retry: false });
    const second = request(URL, { retry: false });
    expect(mock).toHaveBeenCalledTimes(2);
    pending[0].resolve(response({}));
    pending[1].resolve(response({}));
    await Promise.all([first, second]);
  });

  it("cancelling one caller leaves the shared call running for the others", async () => {
    const { mock, pending } = controllableFetch();
    global.fetch = mock as unknown as typeof global.fetch;

    const controller = new AbortController();
    const cancelled = request(URL, { signal: controller.signal });
    const kept = request(URL);
    controller.abort();

    expect(isAbortError(await rejectionOf(cancelled))).toBe(true);
    expect(pending[0].signal?.aborted).toBe(false);

    pending[0].resolve(response({ ok: true }));
    await expect(kept).resolves.toMatchObject({ data: { ok: true } });
  });

  it("aborts the network call once every caller has cancelled", async () => {
    const { mock, pending } = controllableFetch();
    global.fetch = mock as unknown as typeof global.fetch;

    const a = new AbortController();
    const b = new AbortController();
    const first = request(URL, { signal: a.signal });
    const second = request(URL, { signal: b.signal });
    a.abort();
    b.abort();

    expect(isAbortError(await rejectionOf(first))).toBe(true);
    expect(isAbortError(await rejectionOf(second))).toBe(true);
    expect(pending[0].signal?.aborted).toBe(true);
  });

  it("rejects an already-aborted caller without starting a request", async () => {
    const { mock } = controllableFetch();
    global.fetch = mock as unknown as typeof global.fetch;

    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(await rejectionOf(request(URL, { signal: controller.signal })))).toBe(true);
    expect(mock).not.toHaveBeenCalled();
  });

  it("uses a typed abort error that callers can ignore", async () => {
    const { mock } = controllableFetch();
    global.fetch = mock as unknown as typeof global.fetch;

    const controller = new AbortController();
    const pending = request(URL, { signal: controller.signal });
    controller.abort();
    const error = await rejectionOf(pending);
    expect(isAbortError(error)).toBe(true);
    expect(error).toMatchObject({ kind: "aborted" });
  });
});
