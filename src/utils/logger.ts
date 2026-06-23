const isDev = process.env.NODE_ENV === "development" || __DEV__;

export interface NormalizedError {
  message: string;
  stack?: string;
}

export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export function logError(context: string, err: unknown): void {
  if (!isDev) return;
  const { message, stack } = normalizeError(err);
  console.error(`[MindVault] ${context}:`, message);
  if (stack) console.error(stack);
}
