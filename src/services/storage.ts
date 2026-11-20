import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearReceipts, RECEIPTS_STORAGE_KEY } from "./receipts";

/**
 * Central registry of the AsyncStorage keys the app writes.
 *
 * Only plain, non-secret local data lives here. Secrets (wallet keys and the
 * publisher API key) are kept in expo-secure-store and are removed by the
 * wallet wipe flow only. Nothing in this module may touch them.
 */
export const STORAGE_KEYS = {
  catalogFilters: "@mindvault_catalog_filters",
  favourites: "@mindvault_favourites",
  recentResources: "@mindvault_recent_resources",
  searchHistory: "@mindvault_search_history",
  receipts: RECEIPTS_STORAGE_KEY,
} as const;

/** Every key under this prefix is disposable cached data. */
export const CACHE_KEY_PREFIX = "@mindvault_cache:";

export type StorageGroupId = "filters" | "favourites" | "history" | "cache" | "receipts";

export interface StorageGroup {
  id: StorageGroupId;
  label: string;
  description: string;
  /** Exact keys owned by the group. */
  keys: readonly string[];
  /** Keys starting with this prefix also belong to the group. */
  prefix?: string;
}

export const STORAGE_GROUPS: readonly StorageGroup[] = [
  {
    id: "filters",
    label: "Filters",
    description: "Saved catalog search, sort and filter choices.",
    keys: [STORAGE_KEYS.catalogFilters],
  },
  {
    id: "favourites",
    label: "Favourites",
    description: "Resources you have marked as favourites.",
    keys: [STORAGE_KEYS.favourites],
  },
  {
    id: "history",
    label: "History",
    description: "Recently viewed resources and recent searches.",
    keys: [STORAGE_KEYS.recentResources, STORAGE_KEYS.searchHistory],
  },
  {
    id: "cache",
    label: "Cache",
    description: "Temporary data kept to speed things up.",
    keys: [],
    prefix: CACHE_KEY_PREFIX,
  },
  {
    id: "receipts",
    label: "Receipts",
    description: "Payment receipts stored on this device. On-chain records are not affected.",
    keys: [STORAGE_KEYS.receipts],
  },
];

/**
 * Keys that must never be cleared from here. They are app settings, not data,
 * and are listed so a test can prove no group overlaps them.
 */
export const PROTECTED_STORAGE_KEYS: readonly string[] = [
  "mindvault_api_base_url",
  "@mindvault_theme_mode",
];

export function getStorageGroup(id: StorageGroupId): StorageGroup {
  const group = STORAGE_GROUPS.find((entry) => entry.id === id);
  if (!group) throw new Error(`Unknown storage group: ${id}`);
  return group;
}

async function keysForGroup(group: StorageGroup): Promise<string[]> {
  const keys = new Set<string>(group.keys);
  if (group.prefix) {
    const all = await AsyncStorage.getAllKeys();
    for (const key of all) {
      if (key.startsWith(group.prefix)) keys.add(key);
    }
  }
  return [...keys].filter((key) => !PROTECTED_STORAGE_KEYS.includes(key));
}

/** UTF-8 byte length, which is what the stored string costs on disk. */
export function byteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Bytes stored for one group. Keys and values both count. */
export async function getStorageGroupSize(id: StorageGroupId): Promise<number> {
  const keys = await keysForGroup(getStorageGroup(id));
  if (keys.length === 0) return 0;
  const entries = await AsyncStorage.multiGet(keys);
  return entries.reduce(
    (total, [key, value]) => (value === null ? total : total + byteLength(key) + byteLength(value)),
    0
  );
}

/** Sizes for every group. A group whose size cannot be read maps to null. */
export async function getStorageGroupSizes(): Promise<Record<StorageGroupId, number | null>> {
  const sizes = await Promise.all(
    STORAGE_GROUPS.map(async (group) => {
      try {
        return [group.id, await getStorageGroupSize(group.id)] as const;
      } catch {
        return [group.id, null] as const;
      }
    })
  );
  return Object.fromEntries(sizes) as Record<StorageGroupId, number | null>;
}

export async function clearStorageGroup(id: StorageGroupId): Promise<void> {
  if (id === "receipts") {
    // Go through the receipts store so the clear is queued behind any save in flight.
    await clearReceipts();
    return;
  }
  const keys = await keysForGroup(getStorageGroup(id));
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

export async function clearAllStorageGroups(): Promise<void> {
  for (const group of STORAGE_GROUPS) {
    await clearStorageGroup(group.id);
  }
}
