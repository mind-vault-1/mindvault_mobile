import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { saveReceipt, listReceipts, RECEIPTS_STORAGE_KEY } from "./receipts";
import { getRecentResources, recordRecentResource } from "./recent";
import {
  byteLength,
  CACHE_KEY_PREFIX,
  clearAllStorageGroups,
  clearStorageGroup,
  formatBytes,
  getStorageGroupSize,
  getStorageGroupSizes,
  PROTECTED_STORAGE_KEYS,
  STORAGE_GROUPS,
  STORAGE_KEYS,
} from "./storage";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

it("has one group per data kind, with no key in two groups", () => {
  expect(STORAGE_GROUPS.map((group) => group.id)).toEqual(["filters", "favourites", "history", "cache", "receipts", "auditLog"]);
  const keys = STORAGE_GROUPS.flatMap((group) => group.keys);
  expect(new Set(keys).size).toBe(keys.length);
  expect(STORAGE_KEYS.receipts).toBe(RECEIPTS_STORAGE_KEY);
});

it("never includes the settings keys", () => {
  const keys = STORAGE_GROUPS.flatMap((group) => group.keys);
  for (const key of PROTECTED_STORAGE_KEYS) expect(keys).not.toContain(key);
});

it("clears only the chosen group and leaves settings alone", async () => {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.catalogFilters, "{}"],
    [STORAGE_KEYS.searchHistory, '["a"]'],
    ["@mindvault_theme_mode", "dark"],
    ["mindvault_api_base_url", "https://api.example"],
  ]);
  await clearStorageGroup("filters");
  expect(await AsyncStorage.getItem(STORAGE_KEYS.catalogFilters)).toBeNull();
  expect(await AsyncStorage.getItem(STORAGE_KEYS.searchHistory)).toBe('["a"]');
  expect(await AsyncStorage.getItem("@mindvault_theme_mode")).toBe("dark");
  expect(await AsyncStorage.getItem("mindvault_api_base_url")).toBe("https://api.example");
});

it("clears recently viewed and search history as one history group", async () => {
  await recordRecentResource({ id: "r1", title: "T", price: "1" });
  await AsyncStorage.setItem(STORAGE_KEYS.searchHistory, '["q"]');
  await clearStorageGroup("history");
  expect(await getRecentResources()).toEqual([]);
  expect(await AsyncStorage.getItem(STORAGE_KEYS.searchHistory)).toBeNull();
});

it("clears every cache key by prefix", async () => {
  await AsyncStorage.multiSet([[`${CACHE_KEY_PREFIX}a`, "1"], [`${CACHE_KEY_PREFIX}b`, "2"], ["other", "3"]]);
  expect(await getStorageGroupSize("cache")).toBeGreaterThan(0);
  await clearStorageGroup("cache");
  expect(await AsyncStorage.getAllKeys()).toEqual(["other"]);
});

it("clears receipts through the receipts store", async () => {
  await saveReceipt({
    resourceId: "r", title: "T", amount: "1", asset: "A", network: "n",
    txHash: "tx", payer: "p", paidAt: "2026-01-01T00:00:00.000Z",
  });
  await clearStorageGroup("receipts");
  expect(await listReceipts()).toEqual([]);
});

it("never touches secure storage, even when clearing everything", async () => {
  await clearAllStorageGroups();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

it("reports sizes in UTF-8 bytes, including keys", async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.favourites, "é");
  expect(await getStorageGroupSize("favourites")).toBe(byteLength(STORAGE_KEYS.favourites) + 2);
  const sizes = await getStorageGroupSizes();
  expect(sizes.filters).toBe(0);
  expect(sizes.favourites).toBeGreaterThan(0);
});

it("maps a size that cannot be read to null", async () => {
  jest.spyOn(AsyncStorage, "multiGet").mockRejectedValue(new Error("boom"));
  const sizes = await getStorageGroupSizes();
  expect(sizes.filters).toBeNull();
  jest.restoreAllMocks();
});

it("measures and formats bytes", () => {
  expect(byteLength("a")).toBe(1);
  expect(byteLength("é")).toBe(2);
  expect(byteLength("指")).toBe(3);
  expect(byteLength("📚")).toBe(4);
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(2048)).toBe("2.0 KB");
  expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
});
