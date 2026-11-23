import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./storage";

/**
 * Local favourites store.
 *
 * Only the resource ids are kept. Titles and prices change on the server, so
 * the favourites screen re-reads each resource from the public `/meta`
 * endpoint instead of trusting a snapshot that may have gone stale.
 */

const FAVORITES_KEY = STORAGE_KEYS.favourites;

let favoriteIds = new Set<string>();
let hydrated = false;
let pendingLoad: Promise<void> | null = null;

async function readFromStorage(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    // Missing or unreadable data simply means "no favourites yet".
    return [];
  }
}

/** Loads the saved ids once; later calls reuse the in-memory copy. */
export async function loadFavorites(): Promise<void> {
  if (hydrated) return;
  if (!pendingLoad) {
    pendingLoad = readFromStorage().then((ids) => {
      favoriteIds = new Set(ids);
      hydrated = true;
      pendingLoad = null;
    });
  }
  await pendingLoad;
}

/** The saved resource ids, in the order they were added. */
export function getFavoriteIds(): string[] {
  return [...favoriteIds];
}

/**
 * Adds or removes a favourite and returns whether it is now saved. The change
 * is applied in memory first and rolled back if the write fails.
 */
export async function toggleFavorite(id: string): Promise<boolean> {
  await loadFavorites();

  const added = !favoriteIds.has(id);
  const previous = favoriteIds;
  const next = new Set(favoriteIds);
  if (added) next.add(id);
  else next.delete(id);
  favoriteIds = next;

  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
  } catch {
    favoriteIds = previous;
    return !added;
  }
  return added;
}

/** Drops the cached ids so tests start from a clean slate. */
export function resetFavoritesForTests(): void {
  favoriteIds = new Set();
  hydrated = false;
  pendingLoad = null;
}
