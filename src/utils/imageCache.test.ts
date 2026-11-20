import AsyncStorage from "@react-native-async-storage/async-storage";
import { createElement } from "react";
import { ActivityIndicator, Image } from "react-native";
import { fireEvent } from "@testing-library/react-native";

import { ResourceThumbnail } from "../components/ResourceCard";
import { renderWithProviders } from "../test-utils";
import {
  hydrateImageCache,
  isImageCached,
  LruIndex,
  prefetchImage,
  rememberImage,
  resetImageCache,
} from "./imageCache";

beforeEach(async () => {
  resetImageCache();
  await AsyncStorage.clear();
});

describe("LruIndex", () => {
  it("evicts the least recently used entry once over the bound", () => {
    const lru = new LruIndex(2);
    lru.touch("a");
    lru.touch("b");
    lru.touch("a"); // a is now newest

    expect(lru.touch("c")).toEqual(["b"]);
    expect(lru.keys()).toEqual(["a", "c"]);
  });
});

describe("image cache", () => {
  it("reports a hit for a remembered image and persists the index", async () => {
    rememberImage("https://cdn.example.test/a.png");

    expect(isImageCached("https://cdn.example.test/a.png")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    resetImageCache();
    await hydrateImageCache();
    expect(isImageCached("https://cdn.example.test/a.png")).toBe(true);
  });

  it("skips the network for a cache hit", async () => {
    const prefetch = jest.spyOn(Image, "prefetch").mockResolvedValue(true);
    rememberImage("https://cdn.example.test/b.png");

    await expect(prefetchImage("https://cdn.example.test/b.png")).resolves.toBe(true);
    expect(prefetch).not.toHaveBeenCalled();
    prefetch.mockRestore();
  });

  it("swaps the placeholder for the image, and shows a cached image straight away", () => {
    const uri = "https://cdn.example.test/c.png";
    const props = { uri, title: "Doc", resourceType: "file" };

    const first = renderWithProviders(createElement(ResourceThumbnail, props));
    expect(first.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();
    fireEvent(first.getByLabelText("Thumbnail of Doc"), "load");
    expect(first.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    first.unmount();

    const again = renderWithProviders(createElement(ResourceThumbnail, props));
    expect(again.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(again.getByLabelText("Thumbnail of Doc")).toBeTruthy();
  });
});
