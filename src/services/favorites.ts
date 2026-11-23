import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { logError } from "../utils/errorLogger";

/**
 * Favourites: the ids of resources the user saved on this device.
 *
 * One module-level store backs every card and screen, so a heart toggled in
 * one place updates all the others at once. Toggles apply optimistically and
 * persist in the background; a failed write rolls that toggle back.
 *
 * Storage is versioned (`{ version, ids }` under a `:v1` key). Unreadable or
 * unknown-version data is treated as empty rather than breaking the catalog.
 */

export const FAVORITES_KEY = "@mindvault_favorites:v1";
export const FAVORITES_VERSION = 1;

interface StoredFavorites {
  version: typeof FAVORITES_VERSION;
  ids: string[];
}

let favoriteIds: ReadonlySet<string> = new Set();
let hydrated = false;
let loadPromise: Promise<void> | null = null;
// Toggles made before storage was read; they win over the stored value.
const earlyToggles = new Map<string, boolean>();
let writeChain: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setMembership(id: string, favorite: boolean) {
  if (favoriteIds.has(id) === favorite) return;
  const next = new Set(favoriteIds);
  if (favorite) next.add(id);
  else next.delete(id);
  favoriteIds = next;
  notify();
}

function parseStored(raw: string | null): string[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return [];
  const row = parsed as Partial<StoredFavorites>;
  if (row.version !== FAVORITES_VERSION || !Array.isArray(row.ids)) return [];
  return [...new Set(row.ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

/** Reads storage once; later calls return the same promise. Never rejects. */
export function loadFavorites(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      let stored: string[] = [];
      try {
        stored = parseStored(await AsyncStorage.getItem(FAVORITES_KEY));
      } catch (err) {
        logError("favorites.loadFavorites", err);
      }
      const merged = new Set(stored);
      earlyToggles.forEach((favorite, id) => {
        if (favorite) merged.add(id);
        else merged.delete(id);
      });
      earlyToggles.clear();
      hydrated = true;
      favoriteIds = merged;
      notify();
    })();
  }
  return loadPromise;
}

export function isFavorite(id: string): boolean {
  return favoriteIds.has(id);
}

/** The saved ids, in no particular order. */
export function getFavoriteIds(): string[] {
  return [...favoriteIds];
}

function persist(): Promise<void> {
  writeChain = writeChain.then(async () => {
    // Never write before the stored list has been merged in, or it would be overwritten.
    await loadFavorites();
    const payload: StoredFavorites = { version: FAVORITES_VERSION, ids: [...favoriteIds] };
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(payload));
  });
  // Keep the chain alive after a failure; the caller handles the error.
  const result = writeChain;
  writeChain = writeChain.catch(() => undefined);
  return result;
}

/**
 * Flips a resource's favourite state. The UI sees the new state immediately;
 * the promise resolves to the state that finally holds (the previous one if
 * saving failed).
 */
export async function toggleFavorite(id: string): Promise<boolean> {
  if (!id) return false;
  const previous = favoriteIds.has(id);
  const next = !previous;
  if (!hydrated) earlyToggles.set(id, next);
  setMembership(id, next);

  try {
    await persist();
    return next;
  } catch (err) {
    logError("favorites.toggleFavorite", err);
    // Roll back only if nothing else changed this id in the meantime.
    if (favoriteIds.has(id) === next) {
      if (!hydrated) earlyToggles.set(id, previous);
      setMembership(id, previous);
    }
    return favoriteIds.has(id);
  }
}

/** Favourite state for one resource, shared by every component that uses it. */
export function useFavorite(id: string): { isFavorite: boolean; toggle: () => Promise<boolean> } {
  useEffect(() => {
    void loadFavorites();
  }, []);
  const favorite = useSyncExternalStore(
    subscribe,
    () => favoriteIds.has(id),
    () => false,
  );
  const toggle = useCallback(() => toggleFavorite(id), [id]);
  return { isFavorite: favorite, toggle };
}

/** Test helper: forget all in-memory state so the next load reads storage again. */
export function resetFavoritesForTests(): void {
  favoriteIds = new Set();
  hydrated = false;
  loadPromise = null;
  earlyToggles.clear();
  writeChain = Promise.resolve();
  notify();
}
