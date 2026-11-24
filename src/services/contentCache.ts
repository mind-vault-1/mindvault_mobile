import AsyncStorage from "@react-native-async-storage/async-storage";

import { digestMatches, isSha256Hex, sha256Hex } from "../utils/hash";
import { byteLength, CACHE_KEY_PREFIX } from "./storage";

export const CONTENT_CACHE_PREFIX = `${CACHE_KEY_PREFIX}content:`;
export const MAX_CONTENT_CACHE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_CONTENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedContentEntry {
  content: string;
  expiresAt: number;
  cachedAt: number;
  /** SHA-256 of `content` (hex), recorded when it was downloaded and checked before every read. */
  sha256: string;
}

/** What reading the cache found. `integrity-failed` means the entry was removed and should be downloaded again. */
export type CachedContentResult =
  | { status: "hit"; content: string }
  | { status: "miss" }
  | { status: "integrity-failed" };

function keyFor(resourceId: string): string {
  return `${CONTENT_CACHE_PREFIX}${encodeURIComponent(resourceId)}`;
}

function parseExpiry(expiresAt?: string | number | Date | null): number | null {
  if (expiresAt == null) return null;
  const value = expiresAt instanceof Date ? expiresAt.getTime() :
    typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);
  return Number.isFinite(value) ? value : null;
}

function parseEntry(value: string | null): CachedContentEntry | null {
  if (!value) return null;
  try {
    const entry = JSON.parse(value) as Partial<CachedContentEntry>;
    return typeof entry.content === "string" &&
      typeof entry.expiresAt === "number" &&
      typeof entry.cachedAt === "number"
      ? entry as CachedContentEntry
      : null;
  } catch {
    return null;
  }
}

/**
 * Reads cached text and checks it against the digest recorded when it was
 * cached before returning it. An entry that does not match (a partial
 * download, or a file changed on the device) or has no digest to check is
 * removed and reported as `integrity-failed`, so the viewer can show a clear
 * error and offer to download it again. Expired or unreadable entries are
 * removed and reported as a plain miss.
 */
export async function readCachedContent(resourceId: string): Promise<CachedContentResult> {
  const key = keyFor(resourceId);
  const entry = parseEntry(await AsyncStorage.getItem(key));
  if (!entry || entry.expiresAt <= Date.now()) {
    await AsyncStorage.removeItem(key);
    return { status: "miss" };
  }
  if (!digestMatches(entry.content, entry.sha256)) {
    await AsyncStorage.removeItem(key);
    return { status: "integrity-failed" };
  }
  return { status: "hit", content: entry.content };
}

/** Returns unexpired, verified cached text, or null (see {@link readCachedContent} to tell a failed check from a miss). */
export async function getCachedContent(resourceId: string): Promise<string | null> {
  const result = await readCachedContent(resourceId);
  return result.status === "hit" ? result.content : null;
}

/**
 * Caches unlocked text and records its SHA-256 digest. A lease expiry always
 * shortens the normal cache TTL, so locally cached access can never outlive
 * the lease that unlocked it.
 *
 * When the publisher's digest is passed as `expectedSha256`, the text must
 * match it or nothing is cached (returns false): a truncated or altered
 * download is never stored as if it were the original.
 */
export async function cacheContent(
  resourceId: string,
  content: string,
  leaseExpiresAt?: string | number | Date | null,
  expectedSha256?: string | null
): Promise<boolean> {
  if (expectedSha256 != null && (!isSha256Hex(expectedSha256) || !digestMatches(content, expectedSha256))) {
    return false;
  }
  const now = Date.now();
  const leaseExpiry = parseExpiry(leaseExpiresAt);
  const expiresAt = Math.min(now + DEFAULT_CONTENT_CACHE_TTL_MS, leaseExpiry ?? Infinity);
  if (!resourceId || expiresAt <= now) return false;

  const key = keyFor(resourceId);
  const value = JSON.stringify(
    { content, expiresAt, cachedAt: now, sha256: sha256Hex(content) } satisfies CachedContentEntry
  );
  if (byteLength(key) + byteLength(value) > MAX_CONTENT_CACHE_BYTES) {
    await AsyncStorage.removeItem(key);
    return false;
  }

  const keys = (await AsyncStorage.getAllKeys()).filter((candidate) =>
    candidate.startsWith(CONTENT_CACHE_PREFIX) && candidate !== key
  );
  const entries = await AsyncStorage.multiGet(keys);
  const valid = entries
    .map(([entryKey, raw]) => ({ key: entryKey, raw, entry: parseEntry(raw) }))
    .filter((item) => item.entry && item.entry.expiresAt > now)
    .sort((a, b) => (a.entry?.cachedAt ?? 0) - (b.entry?.cachedAt ?? 0));
  const staleKeys = entries
    .filter(([, raw]) => {
      const entry = parseEntry(raw);
      return !entry || entry.expiresAt <= now;
    })
    .map(([entryKey]) => entryKey);

  let totalBytes = byteLength(key) + byteLength(value) + valid.reduce(
    (total, item) => total + byteLength(item.key) + byteLength(item.raw ?? ""),
    0
  );
  const evicted = [...staleKeys];
  for (const item of valid) {
    if (totalBytes <= MAX_CONTENT_CACHE_BYTES) break;
    totalBytes -= byteLength(item.key) + byteLength(item.raw ?? "");
    evicted.push(item.key);
  }
  if (evicted.length > 0) await AsyncStorage.multiRemove(evicted);
  await AsyncStorage.setItem(key, value);
  return true;
}

export async function removeCachedContent(resourceId: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(resourceId));
}

export async function clearContentCache(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(CONTENT_CACHE_PREFIX)
  );
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}
