import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "./storage";
import { logError } from "../utils/errorLogger";

export const SEARCH_HISTORY_KEY = STORAGE_KEYS.searchHistory;
export const MAX_SEARCH_HISTORY = 10;
/** Longer queries are not worth remembering and would bloat the list. */
export const MAX_QUERY_LENGTH = 100;

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function sameQuery(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function sanitize(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const query = normalizeQuery(value);
    if (!query || query.length > MAX_QUERY_LENGTH) continue;
    if (result.some((existing) => sameQuery(existing, query))) continue;
    result.push(query);
    if (result.length === MAX_SEARCH_HISTORY) break;
  }
  return result;
}

async function read(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch (err) {
    // Corrupt or unreadable storage must not break search.
    logError("searchHistory.read", err);
    return [];
  }
}

async function write(history: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    logError("searchHistory.write", err);
  }
}

// Serialize updates so two quick submissions cannot overwrite each other.
let pending: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}

/** The last queries, newest first. */
export function getSearchHistory(): Promise<string[]> {
  return enqueue(read);
}

/** Moves `query` to the front, keeping at most {@link MAX_SEARCH_HISTORY}. */
export function addSearchQuery(query: string): Promise<string[]> {
  return enqueue(async () => {
    const clean = normalizeQuery(query);
    const history = await read();
    if (!clean || clean.length > MAX_QUERY_LENGTH) return history;
    const next = [clean, ...history.filter((item) => !sameQuery(item, clean))].slice(
      0,
      MAX_SEARCH_HISTORY
    );
    await write(next);
    return next;
  });
}

export function removeSearchQuery(query: string): Promise<string[]> {
  return enqueue(async () => {
    const next = (await read()).filter((item) => !sameQuery(item, normalizeQuery(query)));
    await write(next);
    return next;
  });
}

export function clearSearchHistory(): Promise<void> {
  return enqueue(async () => {
    try {
      await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (err) {
      logError("searchHistory.clear", err);
    }
  });
}

/**
 * Suggestions for the current input: every remembered query when the box is
 * empty, otherwise the ones containing the input, minus an exact match.
 */
export function filterSearchSuggestions(history: string[], input: string): string[] {
  const needle = normalizeQuery(input).toLocaleLowerCase();
  if (!needle) return history;
  return history.filter((item) => {
    const lower = item.toLocaleLowerCase();
    return lower !== needle && lower.includes(needle);
  });
}
