/**
 * Shared secret-redaction helper.
 *
 * Every log message, context, stack and serialized error object must pass
 * through `redact()` before it is persisted, displayed or exported. It strips
 * Stellar secret keys, JWTs, API keys and signed XDR from strings, and applies
 * the same rules recursively to nested objects and arrays.
 */

export const REDACTED = "[redacted]";

const SENSITIVE_KEY_PATTERN =
  /(api[-_ ]?key|authorization|bearer|password|private[-_ ]?key|secret(?:[-_ ]?seed)?|seed|token|xdr|hmac|signature)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/** Redacts credential-shaped tokens from a single string. */
export function redactString(message: string): string {
  const authorizationRedacted = message.replace(
    /\b(authorization\s*[:=]\s*)(?:(?:basic|bearer)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    `$1${REDACTED}`
  );

  return authorizationRedacted
    .replace(/\bS[A-Z2-7]{55}\b/g, REDACTED)
    .replace(/\b(?:pk|sk)_(?:live|test)_[A-Za-z0-9._~-]+\b/gi, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, `Bearer ${REDACTED}`)
    // Bare JWTs and signed XDR envelopes carry credentials with no key name.
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/\bAAAA[A-Za-z0-9+/=]{40,}/g, REDACTED)
    .replace(
      /\b(api[-_ ]?key|authorization|password|private[-_ ]?key|secret(?:[-_ ]?seed)?|seed|token|xdr|hmac(?:[-_ ]?signature)?|(?:x-[\w-]+-)?signature)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      `$1: ${REDACTED}`
    );
}

/**
 * Redacts secrets anywhere in a value: strings are scrubbed token-by-token,
 * arrays and nested objects are walked, and values stored under sensitive key
 * names (`token`, `xdr`, `secret`, …) are replaced wholesale.
 */
export function redact<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" || value === null) return value;

  if (seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactValue(nested, seen);
  }
  return result;
}
