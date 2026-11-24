// SHA-256 for verifying downloaded content (issue #414). It is plain
// TypeScript with no dependency, so it runs the same under Hermes, Jest and
// the web build, and needs no `npx expo install`. It is meant for integrity
// checks of text content, not for hashing secrets or large files.

const TWO_POW_32 = 2 ** 32;

/** The first 64 primes, from which SHA-256's round constants and start state are derived. */
const PRIMES: number[] = [];
for (let candidate = 2; PRIMES.length < 64; candidate++) {
  if (PRIMES.every((p) => candidate % p !== 0)) PRIMES.push(candidate);
}

/** Fractional part of the cube roots of the first 64 primes, as 32-bit words. */
const K = PRIMES.map((p) => (Math.pow(p, 1 / 3) * TWO_POW_32) | 0);
/** Fractional part of the square roots of the first 8 primes, as 32-bit words. */
const INITIAL_STATE = PRIMES.slice(0, 8).map((p) => (Math.pow(p, 1 / 2) * TWO_POW_32) | 0);

/** UTF-8 bytes of a string, without relying on TextEncoder being present. */
export function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 of raw bytes, as 64 lowercase hex characters. */
export function sha256HexOfBytes(input: ArrayLike<number>): string {
  const length = input.length;
  const bitLength = length * 8;
  const padded: number[] = Array.from(input);
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  // 64-bit big-endian bit length.
  const high = Math.floor(bitLength / TWO_POW_32);
  const low = bitLength >>> 0;
  for (const word of [high, low]) {
    padded.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }

  const state = INITIAL_STATE.slice();
  const w = new Array<number>(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (padded[j]! << 24) | (padded[j + 1]! << 16) | (padded[j + 2]! << 8) | padded[j + 3]!;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = state as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    state[0] = (state[0]! + a) | 0;
    state[1] = (state[1]! + b) | 0;
    state[2] = (state[2]! + c) | 0;
    state[3] = (state[3]! + d) | 0;
    state[4] = (state[4]! + e) | 0;
    state[5] = (state[5]! + f) | 0;
    state[6] = (state[6]! + g) | 0;
    state[7] = (state[7]! + h) | 0;
  }
  return state.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

/** SHA-256 of a string's UTF-8 bytes, as 64 lowercase hex characters. */
export function sha256Hex(text: string): string {
  return sha256HexOfBytes(utf8Bytes(text));
}

/** Whether `value` looks like a SHA-256 digest: 64 hex characters, any case. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Whether `content` hashes to `expected`. The comparison reads every
 * character, so how long it takes does not depend on where they differ.
 * A malformed `expected` never matches.
 */
export function digestMatches(content: string, expected: unknown): boolean {
  if (!isSha256Hex(expected)) return false;
  const actual = sha256Hex(content);
  const wanted = expected.toLowerCase();
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ wanted.charCodeAt(i);
  return diff === 0;
}
