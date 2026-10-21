import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import {
  getApiKey,
  isBiometricAvailable,
  isBiometricLockEnabled,
  SecureStorageError,
  setBiometricLockEnabled,
  storeApiKey,
} from "./secureStorage";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

const store = SecureStore as jest.Mocked<typeof SecureStore>;
const auth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

/** Simulates SecureStore with the given preference flag and API key. */
function mockStore(lockEnabled: boolean, apiKey: string | null = "secret-key") {
  store.getItemAsync.mockImplementation(async (key: string) =>
    key === "biometric-lock-enabled" ? (lockEnabled ? "true" : null) : apiKey
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  auth.hasHardwareAsync.mockResolvedValue(true);
  auth.isEnrolledAsync.mockResolvedValue(true);
  auth.authenticateAsync.mockResolvedValue({ success: true } as any);
});

describe("getApiKey with biometric lock off", () => {
  it("returns the key without prompting", async () => {
    mockStore(false);
    await expect(getApiKey()).resolves.toBe("secret-key");
    expect(auth.authenticateAsync).not.toHaveBeenCalled();
  });
});

describe("getApiKey with biometric lock on", () => {
  beforeEach(() => mockStore(true));

  it("prompts and returns the key on success", async () => {
    await expect(getApiKey()).resolves.toBe("secret-key");
    expect(auth.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it("does not read the key when authentication is cancelled", async () => {
    auth.authenticateAsync.mockResolvedValue({ success: false, error: "user_cancel" } as any);

    await expect(getApiKey()).rejects.toBeInstanceOf(SecureStorageError);
    expect(store.getItemAsync).not.toHaveBeenCalledWith("x-api-key");
  });

  it("surfaces a fixed message when the prompt throws", async () => {
    auth.authenticateAsync.mockRejectedValue(new Error("native detail"));

    await expect(getApiKey()).rejects.toThrow("Biometric authentication failed.");
  });

  it.each([
    ["no hardware", false, true],
    ["nothing enrolled", true, false],
  ])("falls back to returning the key with %s", async (_label, hardware, enrolled) => {
    auth.hasHardwareAsync.mockResolvedValue(hardware);
    auth.isEnrolledAsync.mockResolvedValue(enrolled);

    await expect(getApiKey()).resolves.toBe("secret-key");
    expect(auth.authenticateAsync).not.toHaveBeenCalled();
  });
});

describe("biometric preference", () => {
  it("is off by default", async () => {
    mockStore(false);
    await expect(isBiometricLockEnabled()).resolves.toBe(false);
  });

  it("is saved when enabled on a supported device", async () => {
    await expect(setBiometricLockEnabled(true)).resolves.toBe(true);
    expect(store.setItemAsync).toHaveBeenCalledWith("biometric-lock-enabled", "true");
  });

  it("refuses to enable on an unsupported device", async () => {
    auth.hasHardwareAsync.mockResolvedValue(false);

    await expect(setBiometricLockEnabled(true)).resolves.toBe(false);
    expect(store.setItemAsync).not.toHaveBeenCalled();
  });

  it("is cleared when disabled", async () => {
    await expect(setBiometricLockEnabled(false)).resolves.toBe(false);
    expect(store.deleteItemAsync).toHaveBeenCalledWith("biometric-lock-enabled");
  });

  it("reports availability as false if the module throws", async () => {
    auth.hasHardwareAsync.mockRejectedValue(new Error("boom"));
    await expect(isBiometricAvailable()).resolves.toBe(false);
  });
});

describe("storeApiKey", () => {
  it("saves the key", async () => {
    await storeApiKey("abc");
    expect(store.setItemAsync).toHaveBeenCalledWith("x-api-key", "abc");
  });
});
