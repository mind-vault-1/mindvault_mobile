/**
 * Minimal, analytics-free error logging.
 *
 * Normalizes any thrown value into a `{ message, stack }` shape and logs it to
 * the console in development only. No third-party services are contacted.
 * Every message, stack, context and object passes through the shared
 * `redact()` helper before it is persisted or displayed.
 */

import { isSensitiveKey, redact } from "./redact";

export interface NormalizedError {
  message: string;
  stack?: string;
}

const MESSAGE_KEYS = new Set(["message", "error", "detail", "title", "description"]);

function cleanMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  return redact(trimmed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectMessages(value: unknown, parentKey?: string): string[] {
  if (typeof value === "string") {
    const cleaned = cleanMessage(value);
    return cleaned ? [cleaned] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectMessages(item, parentKey));
  }

  if (!isRecord(value)) return [];

  const directMessages: string[] = [];
  const nestedMessages: string[] = [];

  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      continue;
    }

    if (MESSAGE_KEYS.has(key.toLowerCase())) {
      directMessages.push(...collectMessages(nestedValue, key));
      continue;
    }

    if (key.toLowerCase() === "errors") {
      nestedMessages.push(...collectMessages(nestedValue, key));
      continue;
    }

    if (parentKey?.toLowerCase() === "errors") {
      const messages = collectMessages(nestedValue, key);
      nestedMessages.push(...messages.map((message) => `${key}: ${message}`));
    }
  }

  return directMessages.length > 0 ? directMessages : nestedMessages;
}

export function extractApiErrorMessageFromBody(
  body: string,
  fallbackMessage: string,
  contentType?: string | null
): string {
  const trimmed = body.trim();
  if (!trimmed) return fallbackMessage;

  const shouldParseJson =
    contentType?.toLowerCase().includes("json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (shouldParseJson) {
    try {
      const messages = collectMessages(JSON.parse(trimmed));
      if (messages.length > 0) {
        return messages.join(" ");
      }
    } catch {
      if (contentType?.toLowerCase().includes("json")) {
        return fallbackMessage;
      }
    }
  }

  return cleanMessage(trimmed) ?? fallbackMessage;
}

export async function extractApiErrorMessage(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  try {
    const body = await response.text();
    return extractApiErrorMessageFromBody(
      body,
      fallbackMessage,
      response.headers.get("content-type")
    );
  } catch {
    return fallbackMessage;
  }
}

/** Reduce any thrown value (Error, string, object, …) to a message + stack. */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      message: redact(error.message),
      stack: error.stack ? redact(error.stack) : undefined,
    };
  }

  if (typeof error === "string") {
    return { message: redact(error) };
  }

  try {
    const serialized = JSON.stringify(redact(error));
    return { message: redact(serialized ?? String(error)) };
  } catch {
    return { message: redact(String(error)) };
  }
}

interface ErrorLogEntry {
  context: string;
  error: NormalizedError;
  timestamp: string;
}

// Ring buffer of the last MAX_LOG_ENTRIES redacted errors, kept in memory only
// so a user can attach them to a diagnostics report.
let errorLog: ErrorLogEntry[] = [];

const MAX_LOG_ENTRIES = 100;

function addToErrorLog(context: string, error: NormalizedError): void {
  errorLog.push({
    context: redact(context),
    error,
    timestamp: new Date().toISOString(),
  });

  if (errorLog.length > MAX_LOG_ENTRIES) {
    errorLog.shift();
  }
}

/**
 * Normalize and log an error, tagged with the context it occurred in.
 * Only writes to the console in development (`__DEV__`); a no-op in production.
 * Returns the normalized error so callers can reuse the message.
 */
export function logError(context: string, error: unknown): NormalizedError {
  const normalized = normalizeError(error);
  const safeContext = redact(context);

  addToErrorLog(safeContext, normalized);

  if (__DEV__) {
    console.error(`[MindVault] ${safeContext}: ${normalized.message}`);
    if (normalized.stack) {
      console.error(normalized.stack);
    }
  }

  return normalized;
}

export function getErrorLog(): string {
  return errorLog
    .map(
      (entry) =>
        `[${entry.timestamp}] ${entry.context}: ${entry.error.message}\n${entry.error.stack || ""}`
    )
    .join("\n\n");
}

export function clearErrorLog(): void {
  errorLog = [];
}
