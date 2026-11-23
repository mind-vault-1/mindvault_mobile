import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";

import {
  FAVORITES_KEY,
  getFavoriteIds,
  isFavorite,
  loadFavorites,
  resetFavoritesForTests,
  toggleFavorite,
  useFavorite,
} from "./favorites";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock("../utils/errorLogger", () => ({ logError: jest.fn() }));

const mockedGetItem = AsyncStorage.getItem as jest.Mock;
const mockedSetItem = AsyncStorage.setItem as jest.Mock;

function stored(value: unknown) {
  mockedGetItem.mockResolvedValue(JSON.stringify(value));
}

function lastWrite(): { version: number; ids: string[] } {
  const calls = mockedSetItem.mock.calls;
  return JSON.parse(calls[calls.length - 1][1]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFavoritesForTests();
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
});

describe("loading", () => {
  it("starts empty when nothing is stored", async () => {
    await loadFavorites();

    expect(getFavoriteIds()).toEqual([]);
    expect(isFavorite("a")).toBe(false);
  });

  it("restores saved ids and reads storage only once", async () => {
    stored({ version: 1, ids: ["a", "b"] });

    await loadFavorites();
    await loadFavorites();

    expect(getFavoriteIds().sort()).toEqual(["a", "b"]);
    expect(mockedGetItem).toHaveBeenCalledTimes(1);
    expect(mockedGetItem).toHaveBeenCalledWith(FAVORITES_KEY);
  });

  it("drops duplicates, blanks and non-string ids", async () => {
    stored({ version: 1, ids: ["a", "a", "", 7, null, "b"] });

    await loadFavorites();

    expect(getFavoriteIds().sort()).toEqual(["a", "b"]);
  });

  it.each([
    ["an unknown version", { version: 2, ids: ["a"] }],
    ["a missing id list", { version: 1 }],
    ["a bare array", ["a"]],
  ])("ignores stored data with %s", async (_label, value) => {
    stored(value);

    await loadFavorites();

    expect(getFavoriteIds()).toEqual([]);
  });

  it("recovers from corrupt JSON and from a failing read", async () => {
    mockedGetItem.mockResolvedValueOnce("{not json");
    await loadFavorites();
    expect(getFavoriteIds()).toEqual([]);

    resetFavoritesForTests();
    mockedGetItem.mockRejectedValueOnce(new Error("storage down"));
    await expect(loadFavorites()).resolves.toBeUndefined();
    expect(getFavoriteIds()).toEqual([]);
  });
});

describe("toggleFavorite", () => {
  it("adds, persists in the versioned format, then removes", async () => {
    await expect(toggleFavorite("a")).resolves.toBe(true);
    expect(isFavorite("a")).toBe(true);
    expect(lastWrite()).toEqual({ version: 1, ids: ["a"] });
    expect(mockedSetItem.mock.calls[0][0]).toBe(FAVORITES_KEY);

    await expect(toggleFavorite("a")).resolves.toBe(false);
    expect(isFavorite("a")).toBe(false);
    expect(lastWrite()).toEqual({ version: 1, ids: [] });
  });

  it("ignores an empty id", async () => {
    await expect(toggleFavorite("")).resolves.toBe(false);
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it("updates immediately, before the write finishes", async () => {
    const write = deferred<void>();
    mockedSetItem.mockReturnValue(write.promise);

    const pending = toggleFavorite("a");

    expect(isFavorite("a")).toBe(true);
    write.resolve();
    await expect(pending).resolves.toBe(true);
  });

  it("rolls back and reports the previous state when saving fails", async () => {
    mockedSetItem.mockRejectedValueOnce(new Error("disk full"));

    await expect(toggleFavorite("a")).resolves.toBe(false);

    expect(isFavorite("a")).toBe(false);
  });

  it("keeps working after a failed write", async () => {
    mockedSetItem.mockRejectedValueOnce(new Error("disk full"));
    await toggleFavorite("a");

    await expect(toggleFavorite("b")).resolves.toBe(true);

    expect(lastWrite().ids).toEqual(["b"]);
  });

  it("does not undo a newer toggle when an older write fails", async () => {
    const first = deferred<void>();
    mockedSetItem.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);

    const adding = toggleFavorite("a");
    const removing = toggleFavorite("a");
    first.reject(new Error("disk full"));
    await adding;
    await removing;

    expect(isFavorite("a")).toBe(false);
  });

  it("merges a toggle made before storage was read with the stored ids", async () => {
    const read = deferred<string | null>();
    mockedGetItem.mockReturnValue(read.promise);

    const toggled = toggleFavorite("new");
    read.resolve(JSON.stringify({ version: 1, ids: ["old"] }));
    await toggled;

    expect(getFavoriteIds().sort()).toEqual(["new", "old"]);
    expect(lastWrite().ids.sort()).toEqual(["new", "old"]);
  });

  it("lets an early un-favourite win over the stored value", async () => {
    const read = deferred<string | null>();
    mockedGetItem.mockReturnValue(read.promise);
    // Looks like an add before storage is read; toggled twice it ends up off.
    const first = toggleFavorite("old");
    const second = toggleFavorite("old");
    read.resolve(JSON.stringify({ version: 1, ids: ["old"] }));
    await Promise.all([first, second]);

    expect(isFavorite("old")).toBe(false);
  });

  it("writes every toggle in order so the last write holds the full list", async () => {
    await Promise.all([toggleFavorite("a"), toggleFavorite("b"), toggleFavorite("c")]);

    expect(lastWrite().ids.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("useFavorite", () => {
  it("loads the stored state and re-renders when it is toggled", async () => {
    stored({ version: 1, ids: ["a"] });
    const { result } = renderHook(() => useFavorite("a"));

    await act(async () => {
      await loadFavorites();
    });
    expect(result.current.isFavorite).toBe(true);

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isFavorite).toBe(false);
  });

  it("keeps separate hooks for the same id in sync, and others independent", async () => {
    const one = renderHook(() => useFavorite("a"));
    const two = renderHook(() => useFavorite("a"));
    const other = renderHook(() => useFavorite("b"));

    await act(async () => {
      await one.result.current.toggle();
    });

    expect(one.result.current.isFavorite).toBe(true);
    expect(two.result.current.isFavorite).toBe(true);
    expect(other.result.current.isFavorite).toBe(false);
  });
});
