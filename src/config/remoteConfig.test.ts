import AsyncStorage from "@react-native-async-storage/async-storage";
import { Keypair } from "@stellar/stellar-sdk";
import { act, renderHook } from "@testing-library/react-native";

import { loadApiBaseUrl, saveApiBaseUrl, getDefaultApiBaseUrl } from "../api/apiSettings";
import { useRemoteConfig } from "../hooks/useRemoteConfig";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_REQUEST_TIMEOUT_MS,
  canonicalizeRemoteConfigValue,
  getRemoteConfig,
  isFeatureEnabled,
  loadRemoteConfig,
  parseRemoteConfig,
  parseSignedRemoteConfig,
  refreshRemoteConfig,
  resetRemoteConfigForTests,
} from "./remoteConfig";

const mockExtra: Record<string, unknown> = {};
jest.mock("@stellar/stellar-sdk", () => ({
  ...jest.requireActual("@stellar/stellar-sdk"),
}));
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

let signer: Keypair;

function respondWith(body: unknown, status = 200) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: status < 400,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
      json: () => Promise.resolve(body),
    })
  ) as unknown as typeof fetch;
}

function signedDocument(config: unknown) {
  return {
    config,
    signature: signer
      .sign(Buffer.from(canonicalizeRemoteConfigValue(config), "utf8"))
      .toString("base64"),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRemoteConfigForTests();
  for (const key of Object.keys(mockExtra)) delete mockExtra[key];
  signer = Keypair.random();
  mockExtra.remoteConfigPublicKey = signer.publicKey();
});

afterEach(() => jest.restoreAllMocks());

describe("parseRemoteConfig", () => {
  it("keeps valid values", () => {
    expect(
      parseRemoteConfig({
        apiBaseUrl: " https://api.new.example ",
        limits: { requestTimeoutMs: 8000, pageSize: 40 },
        flags: { newScanner: true, wallet: 25 },
      })
    ).toEqual({
      apiBaseUrl: "https://api.new.example",
      limits: { requestTimeoutMs: 8000, pageSize: 40 },
      flags: { newScanner: true, wallet: 25 },
    });
  });

  it("falls back to defaults for malformed input", () => {
    expect(parseRemoteConfig(null)).toEqual({
      apiBaseUrl: undefined,
      limits: { requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS, pageSize: DEFAULT_PAGE_SIZE },
      flags: {},
    });
  });

  it("drops out-of-range limits and flags", () => {
    expect(
      parseRemoteConfig({
        limits: { requestTimeoutMs: 999_999, pageSize: 500 },
        flags: { beta: 101, newScanner: -1, wallet: "yes" },
      })
    ).toEqual({
      apiBaseUrl: undefined,
      limits: { requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS, pageSize: DEFAULT_PAGE_SIZE },
      flags: {},
    });
  });
});

describe("parseSignedRemoteConfig", () => {
  it("accepts a correctly signed document", () => {
    const config = { limits: { requestTimeoutMs: 5000, pageSize: 25 }, flags: { wallet: true } };
    expect(parseSignedRemoteConfig(signedDocument(config)).limits.pageSize).toBe(25);
  });

  it("rejects a tampered document", () => {
    const signed = signedDocument({ flags: { wallet: false } });
    expect(() =>
      parseSignedRemoteConfig({ config: { flags: { wallet: true } }, signature: signed.signature })
    ).toThrow(
      "Invalid remote config signature."
    );
  });

  it("rejects an unsigned document", () => {
    expect(() => parseSignedRemoteConfig({ flags: { wallet: true } })).toThrow(
      "Remote config document is not signed."
    );
  });

  it("rejects a document with an unknown signing key", () => {
    const signed = signedDocument({ flags: { wallet: true } });
    expect(() => parseSignedRemoteConfig(signed, Keypair.random().publicKey())).toThrow(
      "Invalid remote config signature."
    );
  });
});

describe("isFeatureEnabled", () => {
  it("defaults typed flags to off", () => {
    expect(isFeatureEnabled("newScanner")).toBe(false);
    expect(isFeatureEnabled("wallet")).toBe(false);
    expect(isFeatureEnabled("beta")).toBe(false);
  });

  it("uses build overrides before remote values", async () => {
    await AsyncStorage.setItem(BUCKET_KEY, "10");
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ flags: { newScanner: 11, wallet: true, beta: true } })
    );
    await loadRemoteConfig();

    expect(isFeatureEnabled("newScanner")).toBe(true);
    expect(isFeatureEnabled("newScanner", { newScanner: false })).toBe(false);
    expect(isFeatureEnabled("beta", { beta: false })).toBe(false);
  });

  it("keeps percentage flags off until the bucket is loaded", () => {
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

  it("caches and applies a valid signed config", async () => {
    mockExtra.remoteConfigUrl = CONFIG_URL;
    respondWith(signedDocument({ limits: { requestTimeoutMs: 5000, pageSize: 30 } }));

    await refreshRemoteConfig();

    expect(getRemoteConfig().limits).toEqual({ requestTimeoutMs: 5000, pageSize: 30 });
    expect(JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? "null")).toMatchObject({
      limits: { requestTimeoutMs: 5000, pageSize: 30 },
    });
  });

  it("keeps the applied config when the endpoint fails", async () => {
    mockExtra.remoteConfigUrl = CONFIG_URL;
    respondWith(signedDocument({ limits: { requestTimeoutMs: 5000 } }));
    await refreshRemoteConfig();

    global.fetch = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    await expect(refreshRemoteConfig()).rejects.toThrow("offline");
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

describe("useRemoteConfig", () => {
  it("re-renders when a signed config is applied", async () => {
    mockExtra.remoteConfigUrl = CONFIG_URL;
    const { result } = renderHook(() => useRemoteConfig());
    expect(result.current.limits.requestTimeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);

    respondWith(signedDocument({ limits: { requestTimeoutMs: 7000 } }));
    await act(async () => {
      await refreshRemoteConfig();
    });

    expect(result.current.limits.requestTimeoutMs).toBe(7000);
  });
});
