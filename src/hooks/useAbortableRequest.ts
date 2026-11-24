import { useEffect, useState, type DependencyList } from "react";

import { isAbortError } from "../api/client";

export interface AbortableRequestState<T> {
  /** The latest successful result. Kept while a reload is in flight. */
  data: T | undefined;
  /** A real failure. Cancellations never appear here, so no error UI is shown for them. */
  error: Error | undefined;
  loading: boolean;
}

/**
 * Runs `run` with an AbortSignal and re-runs it when `deps` change.
 *
 * The signal is aborted when the dependencies change (before the next run starts), and when
 * the component unmounts. A result that arrives after that is dropped, so a stale response
 * cannot overwrite newer state.
 */
export function useAbortableRequest<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList
): AbortableRequestState<T> {
  const [state, setState] = useState<AbortableRequestState<T>>({
    data: undefined,
    error: undefined,
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: undefined }));

    run(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setState({ data, error: undefined, loading: false });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        const failure = error instanceof Error ? error : new Error(String(error));
        setState((previous) => ({ ...previous, error: failure, loading: false }));
      }
    );

    return () => controller.abort();
    // `run` is intentionally not a dependency: callers list what the request depends on in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
