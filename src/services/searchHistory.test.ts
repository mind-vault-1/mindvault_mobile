import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  addSearchQuery,
  clearSearchHistory,
  filterSearchSuggestions,
  getSearchHistory,
  MAX_QUERY_LENGTH,
  MAX_SEARCH_HISTORY,
  removeSearchQuery,
  SEARCH_HISTORY_KEY,
} from "./searchHistory";

jest.mock("../utils/errorLogger", () => ({ logError: jest.fn() }));

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

it("starts empty", async () => {
  expect(await getSearchHistory()).toEqual([]);
});

it("stores queries newest first, trimmed, without case-insensitive duplicates", async () => {
  await addSearchQuery("stellar");
  await addSearchQuery("  soroban   guide ");
  await addSearchQuery("STELLAR");
  expect(await getSearchHistory()).toEqual(["STELLAR", "soroban guide"]);
});

it("keeps only the last 10 queries, even when added at once", async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => addSearchQuery(`q${i}`)));
  const history = await getSearchHistory();
  expect(history).toHaveLength(MAX_SEARCH_HISTORY);
  expect(history[0]).toBe("q11");
  expect(history).not.toContain("q1");
});

it("ignores blank and overlong queries", async () => {
  await addSearchQuery("   ");
  await addSearchQuery("x".repeat(MAX_QUERY_LENGTH + 1));
  expect(await getSearchHistory()).toEqual([]);
});

it("removes one item and clears all", async () => {
  await addSearchQuery("a");
  await addSearchQuery("b");
  expect(await removeSearchQuery("A")).toEqual(["b"]);
  await clearSearchHistory();
  expect(await AsyncStorage.getItem(SEARCH_HISTORY_KEY)).toBeNull();
  expect(await getSearchHistory()).toEqual([]);
});

it.each(["bad json", JSON.stringify({ not: "an array" }), JSON.stringify([1, null, "ok", "OK"])])(
  "recovers from corrupt storage (%s)",
  async (raw) => {
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, raw);
    const history = await getSearchHistory();
    expect(history.every((item) => typeof item === "string")).toBe(true);
    expect(history.length).toBeLessThanOrEqual(1);
  }
);

it("does not throw when storage fails", async () => {
  jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("boom"));
  expect(await getSearchHistory()).toEqual([]);
});

describe("filterSearchSuggestions", () => {
  const history = ["stellar", "soroban", "Stellar wallets"];
  it("returns everything for an empty input", () => {
    expect(filterSearchSuggestions(history, " ")).toEqual(history);
  });
  it("matches case-insensitively and hides the exact current query", () => {
    expect(filterSearchSuggestions(history, "STELLAR")).toEqual(["Stellar wallets"]);
    expect(filterSearchSuggestions(history, "rob")).toEqual(["soroban"]);
  });
});
