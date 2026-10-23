import { getApiBaseUrl } from "./resources";

/** Requests slower than this count as the server being down. */
export const HEALTH_TIMEOUT_MS = 5_000;

export type ServerHealth =
  | { status: "up"; latencyMs: number }
  | { status: "down"; latencyMs: number | null; error: string };

/**
 * Pings `GET /health` on the configured API and measures the round trip.
 * Never throws: a failure is reported as `down` so the UI can show it.
 */
export async function checkHealth(
  baseUrl: string = getApiBaseUrl(),
  timeoutMs: number = HEALTH_TIMEOUT_MS
): Promise<ServerHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return { status: "down", latencyMs, error: `Server responded with ${res.status}.` };
    }
    return { status: "up", latencyMs };
  } catch {
    return {
      status: "down",
      latencyMs: null,
      error: controller.signal.aborted
        ? "The server did not respond in time."
        : "The server could not be reached.",
    };
  } finally {
    clearTimeout(timer);
  }
}
