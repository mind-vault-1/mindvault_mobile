import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "./storage";

export interface SavedSearch {
  id: string;
  name: string;
  search: string;
  verification: "all" | "verified" | "pending" | "rejected";
  resourceType: "all" | "file" | "link";
  minPrice: string;
  maxPrice: string;
  sort: "newest" | "price_asc" | "price_desc" | "title";
  createdAt: string;
}

interface SavedSearchesData {
  searches: SavedSearch[];
}

const SAVED_SEARCHES_KEY = STORAGE_KEYS.savedSearches || "mindvault_saved_searches";

function generateId(): string {
  return `search_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function validateSearch(search: Partial<SavedSearch>): search is SavedSearch {
  if (!search.id || !search.name || typeof search.name !== "string") return false;
  if (!search.search || typeof search.search !== "string") return false;
  if (!["all", "verified", "pending", "rejected"].includes(search.verification ?? "")) return false;
  if (!["all", "file", "link"].includes(search.resourceType ?? "")) return false;
  if (search.minPrice !== undefined && typeof search.minPrice !== "string") return false;
  if (search.maxPrice !== undefined && typeof search.maxPrice !== "string") return false;
  if (!["newest", "price_asc", "price_desc", "title"].includes(search.sort ?? "")) return false;
  if (!search.createdAt || !Number.isInteger(Date.parse(search.createdAt))) return false;
  return true;
}

/** Loads all saved searches from storage. Returns an empty array if none exist. */
export async function getSavedSearches(): Promise<SavedSearch[]> {
  try {
    const stored = await AsyncStorage.getItem(SAVED_SEARCHES_KEY);
    if (!stored) return [];

    const data: unknown = JSON.parse(stored);
    if (!data || typeof data !== "object" || !Array.isArray((data as SavedSearchesData).searches)) {
      return [];
    }

    return (data as SavedSearchesData).searches.filter(validateSearch);
  } catch {
    return [];
  }
}

/** Saves a new search. Returns the saved search with generated ID and timestamp. */
export async function saveSearch(
  filters: Omit<SavedSearch, "id" | "createdAt">
): Promise<SavedSearch> {
  if (!filters.name.trim()) {
    throw new Error("Search name is required.");
  }

  const searches = await getSavedSearches();

  if (searches.some((s) => s.name === filters.name)) {
    throw new Error("A search with this name already exists.");
  }

  const newSearch: SavedSearch = {
    ...filters,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  searches.push(newSearch);
  await AsyncStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify({ searches }));

  return newSearch;
}

/** Updates an existing search by ID. */
export async function updateSearch(id: string, updates: Partial<Omit<SavedSearch, "id" | "createdAt">>): Promise<SavedSearch> {
  const searches = await getSavedSearches();
  const index = searches.findIndex((s) => s.id === id);

  if (index === -1) {
    throw new Error("Search not found.");
  }

  const updated: SavedSearch = {
    ...searches[index],
    ...updates,
  };

  if (!updated.name.trim()) {
    throw new Error("Search name cannot be empty.");
  }

  searches[index] = updated;
  await AsyncStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify({ searches }));

  return updated;
}

/** Deletes a search by ID. Returns true if deleted, false if not found. */
export async function deleteSearch(id: string): Promise<boolean> {
  const searches = await getSavedSearches();
  const filtered = searches.filter((s) => s.id !== id);

  if (filtered.length === searches.length) {
    return false;
  }

  if (filtered.length === 0) {
    await AsyncStorage.removeItem(SAVED_SEARCHES_KEY);
  } else {
    await AsyncStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify({ searches: filtered }));
  }

  return true;
}

/** Deletes all saved searches. */
export async function clearAllSavedSearches(): Promise<void> {
  await AsyncStorage.removeItem(SAVED_SEARCHES_KEY);
}
