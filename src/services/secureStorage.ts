import * as SecureStore from "expo-secure-store";
import { logError } from "../utils/errorLogger";

const API_KEY_KEY = "x-api-key";

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
    await SecureStore.setItemAsync(API_KEY_KEY, apiKey);
  } catch (err) {
    logStorageFailure("storeApiKey", err);
    throw new SecureStorageError("Failed to save API key to secure storage.");
  }
}

export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_KEY_KEY);
  } catch (err) {
    logStorageFailure("getApiKey", err);
    throw new SecureStorageError("Failed to read API key from secure storage.");
  }
}

export async function clearApiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(API_KEY_KEY);
  } catch (err) {
    logStorageFailure("clearApiKey", err);
    throw new SecureStorageError("Failed to clear API key from secure storage.");
  }
}