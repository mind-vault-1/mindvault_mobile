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

const SENSITIVE_KEY_PATTERN =
  /(api[-_ ]?key|authorization|bearer|password|private[-_ ]?key|secret(?:[-_ ]?seed)?|seed|token|xdr|hmac|signature)/i;

const MESSAGE_KEYS = new Set(["message", "error", "detail", "title", "description"]);

function redactSensitiveValues(message: string): string {
  const authorizationRedacted = message.replace(
    /\b(authorization\s*[:=]\s*)(?:(?:basic|bearer)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    "$1[redacted]"
  );

  return authorizationRedacted
    .replace(/\bS[A-Z2-7]{55}\b/g, "[redacted]")
    .replace(/\b(?:pk|sk)_(?:live|test)_[A-Za-z0-9._~-]+\b/gi, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [redacted]")
    .replace(
      /\b(api[-_ ]?key|authorization|password|private[-_ ]?key|secret(?:[-_ ]?seed)?|seed|token|xdr|hmac(?:[-_ ]?signature)?|(?:x-[\w-]+-)?signature)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1: [redacted]"
    );
}

function cleanMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  return redactSensitiveValues(trimmed);
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
    if (SENSITIVE_KEY_PATTERN.test(key)) {
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
      message: redactSensitiveValues(error.message),
      stack: error.stack ? redactSensitiveValues(error.stack) : undefined,
    };
  }

  if (typeof error === "string") {
    return { message: redactSensitiveValues(error) };
  }

  try {
    const serialized = JSON.stringify(error, (key, value: unknown) =>
      SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : value
    );
    return { message: redactSensitiveValues(serialized ?? String(error)) };
  } catch {
    return { message: redactSensitiveValues(String(error)) };
  }
}

/**
 * Normalize and log an error, tagged with the context it occurred in.
 * Only writes to the console in development (`__DEV__`); a no-op in production.
 * Returns the normalized error so callers can reuse the message.
 */
export function logError(context: string, error: unknown): NormalizedError {
  const normalized = normalizeError(error);
  const safeContext = redactSensitiveValues(context);

  if (__DEV__) {
    console.error(`[MindVault] ${safeContext}: ${normalized.message}`);
    if (normalized.stack) {
      console.error(normalized.stack);
    }
  }

  return normalized;
}
