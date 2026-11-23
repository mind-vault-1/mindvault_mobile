import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_PER_PAYMENT_LIMIT,
  isValidPaymentLimit,
  loadPreferences,
  savePerPaymentLimit,
} from "./preferences";

const KEY = "@mindvault_preferences:v1";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("preferences", () => {
  it("returns a versioned default when nothing is stored", async () => {
    await expect(loadPreferences()).resolves.toEqual({
      version: 1,
      perPaymentLimit: DEFAULT_PER_PAYMENT_LIMIT,
    });
  });

  it("saves and loads a valid limit", async () => {
    await savePerPaymentLimit("7.25");

    await expect(AsyncStorage.getItem(KEY)).resolves.toBe(
      JSON.stringify({ version: 1, perPaymentLimit: "7.25" })
    );
    await expect(loadPreferences()).resolves.toEqual({
      version: 1,
      perPaymentLimit: "7.25",
    });
  });

  it("rejects invalid limits", async () => {
    for (const value of ["", "0", "-1", "1.12345678", "abc"]) {
      expect(isValidPaymentLimit(value)).toBe(false);
      await expect(savePerPaymentLimit(value)).rejects.toThrow(
        "Enter a positive USDC amount with at most 7 decimals."
      );
    }
  });

  it("falls back to defaults for unknown versions or corrupt data", async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ version: 2, perPaymentLimit: "9.00" }));
    await expect(loadPreferences()).resolves.toEqual({
      version: 1,
      perPaymentLimit: DEFAULT_PER_PAYMENT_LIMIT,
    });

    await AsyncStorage.setItem(KEY, "{not-json");
    await expect(loadPreferences()).resolves.toEqual({
      version: 1,
      perPaymentLimit: DEFAULT_PER_PAYMENT_LIMIT,
    });
  });
});
