import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook } from "@testing-library/react-native";

import { areDeveloperFlagsVisible } from "../config/flags";
import { loadRemoteConfig, resetRemoteConfigForTests } from "../config/remoteConfig";
import { useFeatureFlag, useFeatureFlags } from "./useFeatureFlag";

const mockExtra: Record<string, unknown> = {};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRemoteConfigForTests();
  for (const key of Object.keys(mockExtra)) delete mockExtra[key];
});

afterEach(() => jest.restoreAllMocks());

describe("useFeatureFlag", () => {
  it("defaults flags to off", () => {
    const { result } = renderHook(() => useFeatureFlag("newScanner"));
    expect(result.current).toBe(false);
  });

  it("reads build environment overrides", () => {
    mockExtra.featureFlags = { newScanner: true };
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.newScanner).toBe(true);
    expect(result.current.wallet).toBe(false);
  });

  it("reads validated remote values", async () => {
    await AsyncStorage.setItem(
      "@mindvault_remote_config",
      JSON.stringify({ flags: { wallet: 100, beta: false } })
    );
    await loadRemoteConfig();
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.wallet).toBe(true);
    expect(result.current.beta).toBe(false);
  });

  it("hides the developer flag list in production", () => {
    expect(areDeveloperFlagsVisible(true)).toBe(true);
    expect(areDeveloperFlagsVisible(false)).toBe(false);
  });
});
