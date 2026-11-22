/**
 * Pure-JS SHA-256/HMAC-SHA256 used to sign publisher mutations.
 *
 * Hermes has no `node:crypto` and no reliable WebCrypto, so this mirrors
 * `server/src/utils/requestSignature.ts` without relying on native modules.
 * Only UTF-8 encoding, SHA-256 and HMAC are implemented here — no buffer or
 * crypto polyfills are needed at runtime.
 */

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    let codePoint = value.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < value.length) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    // Match Buffer.from(string, "utf8") for lone surrogates.
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) codePoint = 0xfffd;

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function toHex(bytes: number[]): string {
  return bytes.map((byte) => `0${byte.toString(16)}`.slice(-2)).join("");
}

/** SHA-256 of raw bytes, returned as 32 bytes. */
function sha256Bytes(message: number[]): number[] {
  const padded = message.slice();
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);

  const bitLength = message.length * 8;
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  padded.push(
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff
  );

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const words = new Array<number>(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      words[i] = ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) | 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const x = words[i - 15];
      const y = words[i - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + SHA256_K[i] + words[i]) | 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const digest: number[] = [];
  for (const word of [h0, h1, h2, h3, h4, h5, h6, h7]) {
    digest.push(
      (word >>> 24) & 0xff,
      (word >>> 16) & 0xff,
      (word >>> 8) & 0xff,
      word & 0xff
    );
  }
  return digest;
}

/** SHA-256 hex digest of raw bytes (used for multipart file payloads). */
export function hashBytes(body: ArrayLike<number>): string {
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i += 1) bytes.push(body[i] & 0xff);
  return toHex(sha256Bytes(bytes));
}

/** SHA-256 hex digest of a UTF-8 string or raw body bytes. */
export function hashRequestBody(body: string | ArrayLike<number>): string {
  return typeof body === "string" ? hashBytes(utf8Bytes(body)) : hashBytes(body);
}

/** SHA-256 of an empty body (DELETE and bodyless POST). */
export const EMPTY_BODY_HASH = hashRequestBody("");

/** Path and query from a request target, with any fragment and host removed. */
export function getRequestPath(target: string): string {
  const withoutHash = target.split("#", 1)[0];
  if (/^https?:\/\//i.test(withoutHash)) {
    const hostEnd = withoutHash.indexOf("/", withoutHash.indexOf("://") + 3);
    return hostEnd === -1 ? "/" : withoutHash.slice(hostEnd);
  }
  return withoutHash || "/";
}

export function buildCanonicalString(params: {
  method: string;
  path: string;
  timestamp: string;
  bodyHash: string;
  idempotencyKey?: string;
}): string {
  const parts = [params.method.toUpperCase(), params.path, params.timestamp, params.bodyHash];
  if (params.idempotencyKey) parts.push(params.idempotencyKey);
  return parts.join("\n");
}

/** HMAC-SHA256 hex digest, byte-for-byte compatible with the server helper. */
export function computeRequestSignature(secret: string, canonical: string): string {
  let key = utf8Bytes(secret);
  if (key.length > 64) key = sha256Bytes(key);
  while (key.length < 64) key.push(0);

  const message = utf8Bytes(canonical);
  const inner = key.map((byte) => byte ^ 0x36).concat(message);
  const outer = key.map((byte) => byte ^ 0x5c).concat(sha256Bytes(inner));
  return toHex(sha256Bytes(outer));
}

export function signPublisherRequest(params: {
  secret: string;
  method: string;
  path: string;
  timestamp: string;
  bodyHash: string;
  idempotencyKey?: string;
}): string {
  return computeRequestSignature(params.secret, buildCanonicalString(params));
}

/** Builds the signature header pair for a mutation at the current time. */
export function signedRequestHeaders(params: {
  secret: string;
  method: string;
  path: string;
  /** The exact serialized body sent on the wire. */
  body?: string;
  idempotencyKey?: string;
}): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    "X-Timestamp": timestamp,
    "X-Signature": signPublisherRequest({
      secret: params.secret,
      method: params.method,
      path: getRequestPath(params.path),
      timestamp,
      bodyHash: params.body === undefined ? EMPTY_BODY_HASH : hashRequestBody(params.body),
      ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    }),
  };
}

/** Mirrors the server's canonical SHA-256 of sorted multipart fields. */
export function hashMultipartBody(
  fields: Record<string, unknown>,
  file?: { buffer: ArrayLike<number> } | { bytes: ArrayLike<number> }
): string {
  const lines = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${String(fields[key] ?? "")}`);
  if (file) {
    const bytes = "buffer" in file ? file.buffer : file.bytes;
    lines.push(`file=${hashBytes(bytes)}`);
  }
  return hashRequestBody(lines.join("\n"));
}

/** Constant-time comparison of two lowercase hex digests. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== 64 || b.length !== 64 || !/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) {
    return false;
  }
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function verifyRequestSignature(params: {
  secret: string;
  method: string;
  path: string;
  timestamp: string;
  bodyHash: string;
  idempotencyKey?: string;
  signature: string;
}): boolean {
  return timingSafeEqualHex(signPublisherRequest(params), params.signature);
}

/** True when a unix-seconds timestamp is within `maxSkewMs` of `nowMs`. */
export function isTimestampWithinSkew(
  timestampSeconds: number,
  nowMs: number,
  maxSkewMs: number
): boolean {
  if (!Number.isFinite(timestampSeconds)) return false;
  return Math.abs(timestampSeconds * 1000 - nowMs) <= maxSkewMs;
}
