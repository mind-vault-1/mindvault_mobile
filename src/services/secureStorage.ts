import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { logError } from "../utils/errorLogger";
import { getWebStorage, isWeb } from "../utils/platform";

const API_KEY_KEY = "x-api-key";
const BIOMETRIC_LOCK_KEY = "biometric-lock-enabled";

/**
 * Thrown by this module on any secure storage failure. The message is
 * always a fixed, human-readable string safe to show directly in the UI —
 * never the underlying native error, and never the API key value itself.
 */
export class SecureStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecureStorageError";
  }
}

/** Routes storage failures through the centralized redacting logger. */
function logStorageFailure(operation: string, err: unknown): void {
  logError(`secureStorage.${operation}`, err);
}

export async function storeApiKey(apiKey: string): Promise<void> {
  try {
    if (isWeb()) {
      const storage = getWebStorage();
      if (!storage) throw new Error("Browser storage is unavailable.");
      storage.setItem(API_KEY_KEY, apiKey);
    } else {
      await SecureStore.setItemAsync(API_KEY_KEY, apiKey);
    }
  } catch (err) {
    logStorageFailure("storeApiKey", err);
    throw new SecureStorageError("Failed to save API key to secure storage.");
  }
}

/** True when the device has biometric hardware with at least one enrolment. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (isWeb()) return false;
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch (err) {
    logStorageFailure("isBiometricAvailable", err);
    return false;
  }
}

/** Whether the user opted in to "Require Face ID / fingerprint". Off by default. */
export async function isBiometricLockEnabled(): Promise<boolean> {
  if (isWeb()) return false;
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_LOCK_KEY)) === "true";
  } catch (err) {
    logStorageFailure("isBiometricLockEnabled", err);
    throw new SecureStorageError("Failed to read biometric preference.");
  }
}

/**
 * Turns the biometric requirement on or off. Enabling is refused (returns
 * false) on devices without enrolled biometrics, so the preference can never
 * lock the user out of a key they cannot unlock.
 */
export async function setBiometricLockEnabled(enabled: boolean): Promise<boolean> {
  if (isWeb()) {
    if (!enabled) getWebStorage()?.removeItem(BIOMETRIC_LOCK_KEY);
    return false;
  }
  if (enabled && !(await isBiometricAvailable())) return false;
  try {
    if (enabled) {
      await SecureStore.setItemAsync(BIOMETRIC_LOCK_KEY, "true");
    } else {
      await SecureStore.deleteItemAsync(BIOMETRIC_LOCK_KEY);
    }
    return enabled;
  } catch (err) {
    logStorageFailure("setBiometricLockEnabled", err);
    throw new SecureStorageError("Failed to save biometric preference.");
  }
}

async function requireBiometrics(): Promise<void> {
  // Graceful fallback: if the device no longer supports biometrics (hardware
  // removed, enrolment deleted), don't block access to the key.
  if (!(await isBiometricAvailable())) return;

  let result: LocalAuthentication.LocalAuthenticationResult;
  try {
    result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock your publisher API key",
    });
  } catch (err) {
    logStorageFailure("requireBiometrics", err);
    throw new SecureStorageError("Biometric authentication failed.");
  }
  if (!result.success) {
    throw new SecureStorageError("Biometric authentication was not completed.");
  }
}

export async function getApiKey(): Promise<string | null> {
  if (isWeb()) {
    try {
      const storage = getWebStorage();
      if (!storage) throw new Error("Browser storage is unavailable.");
      return storage.getItem(API_KEY_KEY);
    } catch (err) {
      logStorageFailure("getApiKey", err);
      throw new SecureStorageError("Failed to read API key from browser storage.");
    }
  }
  if (await isBiometricLockEnabled()) {
    await requireBiometrics();
  }
  try {
    return await SecureStore.getItemAsync(API_KEY_KEY);
  } catch (err) {
    logStorageFailure("getApiKey", err);
    throw new SecureStorageError("Failed to read API key from secure storage.");
  }
}

export async function clearApiKey(): Promise<void> {
  try {
    if (isWeb()) {
      const storage = getWebStorage();
      if (!storage) throw new Error("Browser storage is unavailable.");
      storage.removeItem(API_KEY_KEY);
    } else {
      await SecureStore.deleteItemAsync(API_KEY_KEY);
    }
  } catch (err) {
    logStorageFailure("clearApiKey", err);
    throw new SecureStorageError("Failed to clear API key from secure storage.");
  }
}
