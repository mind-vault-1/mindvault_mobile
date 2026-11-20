import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "react-native";

/**
 * Thumbnail cache index.
 *
 * The image bytes live in the platform's native image disk cache (filled by
 * `Image.prefetch` and by rendering). This module keeps a bounded,
 * least-recently-used index of which URIs are cached, persisted across launches,
 * so a card can render a cached thumbnail straight away (including offline)
 * instead of showing the loading placeholder on every list render.
 */
export const MAX_CACHED_IMAGES = 200;
const STORAGE_KEY = "mindvault_image_cache_v1";

export class LruIndex {
  private readonly entries = new Map<string, true>();

  constructor(private readonly max: number) {}

  has(uri: string): boolean {
    return this.entries.has(uri);
  }

  /** Marks `uri` as most recently used and returns any URIs evicted to stay in bounds. */
  touch(uri: string): string[] {
    this.entries.delete(uri);
    this.entries.set(uri, true);
    const evicted: string[] = [];
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
      evicted.push(oldest);
    }
    return evicted;
  }

  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  clear(): void {
    this.entries.clear();
  }
}

const index = new LruIndex(MAX_CACHED_IMAGES);

function persist(): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(index.keys())).catch(() => undefined);
}

/** Loads the persisted index; call once at startup. Safe to call more than once. */
export async function hydrateImageCache(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    const uris: unknown = saved ? JSON.parse(saved) : [];
    if (Array.isArray(uris)) {
      for (const uri of uris) if (typeof uri === "string") index.touch(uri);
    }
  } catch {
    // A corrupt index only costs a re-download.
  }
}

export function isImageCached(uri: string): boolean {
  return index.has(uri);
}

/** Records a successfully loaded image as most recently used. */
export function rememberImage(uri: string): void {
  index.touch(uri);
  persist();
}

/** Warms the native disk cache for `uri` and records it on success. */
export async function prefetchImage(uri: string): Promise<boolean> {
  if (index.has(uri)) {
    rememberImage(uri);
    return true;
  }
  try {
    const ok = await Image.prefetch(uri);
    if (ok) rememberImage(uri);
    return ok;
  } catch {
    return false;
  }
}

export function resetImageCache(): void {
  index.clear();
}

// Load the persisted index as soon as the module is first imported.
void hydrateImageCache();
