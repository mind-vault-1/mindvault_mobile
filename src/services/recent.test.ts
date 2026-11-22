import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  MAX_RECENT_RESOURCES,
  clearRecentResources,
  getRecentResources,
  recordRecentResource,
} from "./recent";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockedGetItem = AsyncStorage.getItem as jest.Mock;
const mockedSetItem = AsyncStorage.setItem as jest.Mock;
const mockedRemoveItem = AsyncStorage.removeItem as jest.Mock;

const RECENT_KEY = "@mindvault_recent_resources";

function entry(id: string) {
  return { id, title: `Resource ${id}`, price: "1.00" };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
  mockedRemoveItem.mockResolvedValue(undefined);
});

describe("recent resources", () => {
  it("returns an empty list when nothing has been viewed yet", async () => {
    await expect(getRecentResources()).resolves.toEqual([]);
    expect(mockedGetItem).toHaveBeenCalledWith(RECENT_KEY);
  });

  it("puts the newly opened resource first and drops its older entry", async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([entry("a"), entry("b")]));

    const result = await recordRecentResource(entry("b"));

    expect(result.map((item) => item.id)).toEqual(["b", "a"]);
    expect(JSON.parse(mockedSetItem.mock.calls[0][1])).toEqual([entry("b"), entry("a")]);
  });

  it(`keeps at most ${MAX_RECENT_RESOURCES} resources`, async () => {
    const stored = Array.from({ length: MAX_RECENT_RESOURCES }, (_, i) =>
      entry(`old-${i}`),
    );
    mockedGetItem.mockResolvedValue(JSON.stringify(stored));

    const result = await recordRecentResource(entry("newest"));

    expect(result).toHaveLength(MAX_RECENT_RESOURCES);
    expect(result[0].id).toBe("newest");
    expect(result.some((item) => item.id === "old-19")).toBe(false);
  });

  it("clears the stored list", async () => {
    await clearRecentResources();

    expect(mockedRemoveItem).toHaveBeenCalledWith(RECENT_KEY);
  });

  it("ignores corrupt or unrecognised storage", async () => {
    mockedGetItem.mockResolvedValue("{not json");
    await expect(getRecentResources()).resolves.toEqual([]);

    mockedGetItem.mockResolvedValue(JSON.stringify({ id: "a" }));
    await expect(getRecentResources()).resolves.toEqual([]);

    mockedGetItem.mockResolvedValue(JSON.stringify([entry("a"), { id: 1 }, null]));
    await expect(getRecentResources()).resolves.toEqual([entry("a")]);
  });

  it("returns an empty list when storage cannot be read", async () => {
    mockedGetItem.mockRejectedValue(new Error("storage unavailable"));

    await expect(getRecentResources()).resolves.toEqual([]);
  });
});
