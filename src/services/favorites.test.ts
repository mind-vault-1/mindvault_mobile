import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getFavoriteIds,
  loadFavorites,
  resetFavoritesForTests,
  toggleFavorite,
} from "./favorites";
import { STORAGE_KEYS } from "./storage";

const mockedGetItem = AsyncStorage.getItem as jest.Mock;
const mockedSetItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetFavoritesForTests();
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
});

it("starts empty when nothing has been saved", async () => {
  await loadFavorites();
  expect(getFavoriteIds()).toEqual([]);
});

it("loads the saved ids from storage", async () => {
  mockedGetItem.mockResolvedValue(JSON.stringify(["a", "b"]));
  await loadFavorites();
  expect(getFavoriteIds()).toEqual(["a", "b"]);
});

it("treats unreadable stored data as no favourites", async () => {
  mockedGetItem.mockResolvedValue("{ not json");
  await loadFavorites();
  expect(getFavoriteIds()).toEqual([]);
});

it("adds a favourite and persists it", async () => {
  await loadFavorites();
  await expect(toggleFavorite("a")).resolves.toBe(true);
  expect(getFavoriteIds()).toEqual(["a"]);
  expect(mockedSetItem).toHaveBeenCalledWith(STORAGE_KEYS.favourites, JSON.stringify(["a"]));
});

it("removes a favourite again", async () => {
  mockedGetItem.mockResolvedValue(JSON.stringify(["a"]));
  await loadFavorites();
  await expect(toggleFavorite("a")).resolves.toBe(false);
  expect(getFavoriteIds()).toEqual([]);
});

it("keeps the previous list when the write fails", async () => {
  mockedGetItem.mockResolvedValue(JSON.stringify(["a"]));
  await loadFavorites();
  mockedSetItem.mockRejectedValue(new Error("storage is full"));

  await expect(toggleFavorite("b")).resolves.toBe(false);
  expect(getFavoriteIds()).toEqual(["a"]);
});
