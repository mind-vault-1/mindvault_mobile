import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadApiBaseUrl, saveApiBaseUrl, getDefaultApiBaseUrl } from "../api/apiSettings";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  getRemoteConfig,
  isFeatureEnabled,
  loadRemoteConfig,
  parseRemoteConfig,
  refreshRemoteConfig,
  resetRemoteConfigForTests,
} from "./remoteConfig";

const mockExtra: Record<string, unknown> = {};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

const CONFIG_URL = "https://config.example.com/mindvault.json";
const CACHE_KEY = "@mindvault_remote_config";
const BUCKET_KEY = "@mindvault_rollout_bucket";

function respondWith(body: unknown, status = 200) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
  ) as unknown as typeof fetch;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRemoteConfigForTests();
  for (const key of Object.keys(mockExtra)) delete mockExtra[key];
});

afterEach(() => jest.restoreAllMocks());

describe("parseRemoteConfig", () => {
  it("keeps valid values", () => {
    expect(
      parseRemoteConfig({
        apiBaseUrl: " https://api.new.example ",
        limits: { requestTimeoutMs: 8000 },
        flags: { newScanner: true, wallet: 25 },
      })
    ).toEqual({
      apiBaseUrl: "https://api.new.example",
      limits: { requestTimeoutMs: 8000 },
      flags: { newScanner: true, wallet: 25 },
    });
  });

  it("falls back to defaults for malformed input", () => {
    expect(parseRemoteConfig(null)).toEqual({
      apiBaseUrl: undefined,
      limits: { requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS },
      flags: {},
    });
  });

  it("drops out-of-range limits and flags", () => {
    const parsed = parseRemoteConfig({
      limits: { requestTimeoutMs: 999_999 },
      flags: { tooHigh: 101, negative: -1, text: "yes", ok: 100 },
    });
    expect(parsed.limits.requestTimeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    expect(parsed.flags).toEqual({ ok: 100 });
  });
});

describe("isFeatureEnabled", () => {
  it("treats unknown flags, including prototype names, as off", () => {
    expect(isFeatureEnabled("missing")).toBe(false);
    expect(isFeatureEnabled("constructor")).toBe(false);
  });

  it("uses a stable per-install bucket for percentage rollouts", async () => {
    await AsyncStorage.setItem(BUCKET_KEY, "10");
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ flags: { newScanner: 11, oldScanner: 10, on: true, off: false } })
    );
    await loadRemoteConfig();

    expect(isFeatureEnabled("newScanner")).toBe(true);
    expect(isFeatureEnabled("oldScanner")).toBe(false);
    expect(isFeatureEnabled("on")).toBe(true);
    expect(isFeatureEnabled("off")).toBe(false);
  });

  it("creates and keeps a rollout bucket when none is saved", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.42);
    await loadRemoteConfig();
    expect(await AsyncStorage.getItem(BUCKET_KEY)).toBe("42");
  });

  it("keeps percentage flags off until the bucket is loaded", () => {
    respondWith({ flags: { wallet: 100 } });
    expect(isFeatureEnabled("wallet")).toBe(false);
  });
});

describe("refreshRemoteConfig", () => {
  it("does nothing without a configured URL", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await refreshRemoteConfig();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caches and applies the fetched config", async () => {
    mockExtra.remoteConfigUrl = CONFIG_URL;
    respondWith({ limits: { requestTimeoutMs: 5000 } });

    await refreshRemoteConfig();

    expect(getRemoteConfig().limits.requestTimeoutMs).toBe(5000);
    expect(JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? "null")).toMatchObject({
      limits: { requestTimeoutMs: 5000 },
    });
  });

  it("keeps the applied config when the endpoint fails", async () => {
    mockExtra.remoteConfigUrl = CONFIG_URL;
    respondWith({ limits: { requestTimeoutMs: 5000 } });
    await refreshRemoteConfig();

    respondWith({}, 503);
    await expect(refreshRemoteConfig()).rejects.toThrow("503");
    expect(getRemoteConfig().limits.requestTimeoutMs).toBe(5000);
  });
});

describe("API host from remote config", () => {
  it("is used when the user has not saved one", async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ apiBaseUrl: "https://api.new.example" }));
    await loadRemoteConfig();
    await expect(loadApiBaseUrl()).resolves.toBe("https://api.new.example");
  });

  it("is ignored when it fails validation", async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ apiBaseUrl: "http://evil.example" }));
    await loadRemoteConfig();
    await expect(loadApiBaseUrl()).resolves.toBe(getDefaultApiBaseUrl());
  });

  it("never overrides a host the user saved", async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ apiBaseUrl: "https://api.new.example" }));
    await loadRemoteConfig();
    await saveApiBaseUrl("https://api.mine.example");
    await expect(loadApiBaseUrl()).resolves.toBe("https://api.mine.example");
  });
});
