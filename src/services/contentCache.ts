import AsyncStorage from "@react-native-async-storage/async-storage";

import { byteLength, CACHE_KEY_PREFIX } from "./storage";

export const CONTENT_CACHE_PREFIX = `${CACHE_KEY_PREFIX}content:`;
export const MAX_CONTENT_CACHE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_CONTENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedContentEntry {
  content: string;
  expiresAt: number;
  cachedAt: number;
}

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

/** Returns unexpired cached text, removing invalid or expired entries. */
export async function getCachedContent(resourceId: string): Promise<string | null> {
  const key = keyFor(resourceId);
  const entry = parseEntry(await AsyncStorage.getItem(key));
  if (!entry || entry.expiresAt <= Date.now()) {
    await AsyncStorage.removeItem(key);
    return null;
  }
  return entry.content;
}

/**
 * Caches unlocked text. A lease expiry always shortens the normal cache TTL,
 * so locally cached access can never outlive the lease that unlocked it.
 */
export async function cacheContent(
  resourceId: string,
  content: string,
  leaseExpiresAt?: string | number | Date | null
): Promise<boolean> {
  const now = Date.now();
  const leaseExpiry = parseExpiry(leaseExpiresAt);
  const expiresAt = Math.min(now + DEFAULT_CONTENT_CACHE_TTL_MS, leaseExpiry ?? Infinity);
  if (!resourceId || expiresAt <= now) return false;

  const key = keyFor(resourceId);
  const value = JSON.stringify({ content, expiresAt, cachedAt: now } satisfies CachedContentEntry);
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
