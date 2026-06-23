/**
 * Minimal, analytics-free error logging.
 *
 * Normalizes any thrown value into a `{ message, stack }` shape and logs it to
 * the console in development only. No third-party services are contacted.
 */

export interface NormalizedError {
  message: string;
  stack?: string;
}

/** Reduce any thrown value (Error, string, object, …) to a message + stack. */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/**
 * Normalize and log an error, tagged with the context it occurred in.
 * Only writes to the console in development (`__DEV__`); a no-op in production.
 * Returns the normalized error so callers can reuse the message.
 */
export function logError(context: string, error: unknown): NormalizedError {
  const normalized = normalizeError(error);

  if (__DEV__) {
    console.error(`[MindVault] ${context}: ${normalized.message}`);
    if (normalized.stack) {
      console.error(normalized.stack);
    }
  }

  return normalized;
}
