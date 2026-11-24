import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  cacheContent,
  clearContentCache,
  CONTENT_CACHE_PREFIX,
  getCachedContent,
  MAX_CONTENT_CACHE_BYTES,
  readCachedContent,
  removeCachedContent,
} from "./contentCache";
import { sha256Hex } from "../utils/hash";

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

describe("content integrity", () => {
  const keyOf = (id: string) => `${CONTENT_CACHE_PREFIX}${id}`;
  const readEntry = async (id: string) => JSON.parse((await AsyncStorage.getItem(keyOf(id))) as string);

  it("records the SHA-256 digest of the content when it is cached", async () => {
    await cacheContent("res-1", "Unlocked content");
    expect((await readEntry("res-1")).sha256).toBe(sha256Hex("Unlocked content"));
  });

  it("serves content whose digest matches", async () => {
    await cacheContent("res-1", "Unlocked content");
    expect(await readCachedContent("res-1")).toEqual({ status: "hit", content: "Unlocked content" });
  });

  it("caches a download that matches the publisher's digest", async () => {
    const digest = sha256Hex("Original text");
    expect(await cacheContent("res-1", "Original text", null, digest)).toBe(true);
    expect(await getCachedContent("res-1")).toBe("Original text");
  });

  it("refuses to cache a download that does not match the publisher's digest", async () => {
    expect(await cacheContent("res-1", "Altered text", null, sha256Hex("Original text"))).toBe(false);
    expect(await AsyncStorage.getItem(keyOf("res-1"))).toBeNull();
  });

  it("refuses to cache a truncated download", async () => {
    const full = "A long document that did not finish downloading.";
    expect(await cacheContent("res-1", full.slice(0, 20), null, sha256Hex(full))).toBe(false);
    expect(await readCachedContent("res-1")).toEqual({ status: "miss" });
  });

  it("refuses a malformed publisher digest", async () => {
    expect(await cacheContent("res-1", "Text", null, "not-a-digest")).toBe(false);
  });

  it("discards a tampered entry, reports the failure and leaves nothing to re-read", async () => {
    await cacheContent("res-1", "Original text");
    const entry = await readEntry("res-1");
    await AsyncStorage.setItem(keyOf("res-1"), JSON.stringify({ ...entry, content: "Edited on the device" }));

    expect(await readCachedContent("res-1")).toEqual({ status: "integrity-failed" });
    expect(await AsyncStorage.getItem(keyOf("res-1"))).toBeNull();
    expect(await readCachedContent("res-1")).toEqual({ status: "miss" });
  });

  it("discards an entry whose stored content was cut short", async () => {
    await cacheContent("res-1", "A complete document");
    const entry = await readEntry("res-1");
    await AsyncStorage.setItem(keyOf("res-1"), JSON.stringify({ ...entry, content: "A complete" }));
    expect(await readCachedContent("res-1")).toEqual({ status: "integrity-failed" });
  });

  it("discards an entry with no digest, since it cannot be verified", async () => {
    await AsyncStorage.setItem(
      keyOf("legacy"),
      JSON.stringify({ content: "Old", expiresAt: Date.now() + 60000, cachedAt: Date.now() })
    );
    expect(await readCachedContent("legacy")).toEqual({ status: "integrity-failed" });
    expect(await AsyncStorage.getItem(keyOf("legacy"))).toBeNull();
  });

  it("getCachedContent returns null for a failed check", async () => {
    await cacheContent("res-1", "Original text");
    const entry = await readEntry("res-1");
    await AsyncStorage.setItem(keyOf("res-1"), JSON.stringify({ ...entry, content: "Tampered" }));
    expect(await getCachedContent("res-1")).toBeNull();
  });
});
