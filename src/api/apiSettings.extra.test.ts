import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getDefaultApiBaseUrl,
  loadApiBaseUrl,
  saveApiBaseUrl,
} from "./apiSettings";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("apiSettings persistence", () => {
  it("loads the configured default when no URL is saved", async () => {
    await expect(loadApiBaseUrl()).resolves.toBe(getDefaultApiBaseUrl());
  });

  it("saves a trimmed valid URL and loads it back", async () => {
    await saveApiBaseUrl("  https://api.example.com/v1  ");
    await expect(loadApiBaseUrl()).resolves.toBe("https://api.example.com/v1");
  });

  it("resets to the default when given an empty value", async () => {
    await saveApiBaseUrl("https://api.example.com");
    await saveApiBaseUrl("  ");
    await expect(loadApiBaseUrl()).resolves.toBe(getDefaultApiBaseUrl());
  });

  it.each(["not-a-url", "ftp://api.example.com", "http://public.example.com", "https://user:pass@api.example.com"])(
    "rejects invalid URL %s without persisting it",
    async (value) => {
      await expect(saveApiBaseUrl(value)).rejects.toThrow();
      await expect(loadApiBaseUrl()).resolves.toBe(getDefaultApiBaseUrl());
    }
  );

  it("uses the default if storage contains a blank value", async () => {
    await AsyncStorage.setItem("mindvault_api_base_url", "   ");
    await expect(loadApiBaseUrl()).resolves.toBe(getDefaultApiBaseUrl());
  });
});
