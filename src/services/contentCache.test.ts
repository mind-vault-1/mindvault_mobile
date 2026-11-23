import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  cacheContent,
  clearContentCache,
  CONTENT_CACHE_PREFIX,
  getCachedContent,
  MAX_CONTENT_CACHE_BYTES,
  removeCachedContent,
} from "./contentCache";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

it("stores unlocked text and reads it back", async () => {
  expect(await cacheContent("res-1", "Unlocked content")).toBe(true);
  expect(await getCachedContent("res-1")).toBe("Unlocked content");
  expect(await AsyncStorage.getItem(`${CONTENT_CACHE_PREFIX}res-1`)).not.toBeNull();
});

it("shortens the cache lifetime to an already-expired lease", async () => {
  expect(await cacheContent("res-1", "Leased content", Date.now() - 1000)).toBe(false);
  expect(await getCachedContent("res-1")).toBeNull();
});

it("keeps content until its lease expires", async () => {
  expect(await cacheContent("res-1", "Leased content", Date.now() + 60000)).toBe(true);
  expect(await getCachedContent("res-1")).toBe("Leased content");
});

it("drops expired and corrupt entries", async () => {
  await AsyncStorage.setItem(
    `${CONTENT_CACHE_PREFIX}expired`,
    JSON.stringify({ content: "Old", expiresAt: Date.now() - 1, cachedAt: Date.now() - 1000 })
  );
  await AsyncStorage.setItem(`${CONTENT_CACHE_PREFIX}broken`, "{not json");

  expect(await getCachedContent("expired")).toBeNull();
  expect(await getCachedContent("broken")).toBeNull();
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

it("refuses content beyond the size cap", async () => {
  const oversized = "x".repeat(MAX_CONTENT_CACHE_BYTES);
  expect(await cacheContent("res-1", oversized)).toBe(false);
  expect(await getCachedContent("res-1")).toBeNull();
});

it("removes one entry or all entries", async () => {
  await cacheContent("res-1", "One");
  await cacheContent("res-2", "Two");

  await removeCachedContent("res-1");
  expect(await getCachedContent("res-1")).toBeNull();
  expect(await getCachedContent("res-2")).toBe("Two");

  await clearContentCache();
  expect(await getCachedContent("res-2")).toBeNull();
});
