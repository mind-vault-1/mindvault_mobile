import * as SecureStore from "expo-secure-store";

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

/**
 * Logs a storage failure safely. Only ever logs the operation name and the
 * underlying error's message/name — never the API key value, which is not
 * in scope here and must never be passed into this function.
 */
function logStorageFailure(operation: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : "unknown error";
  console.error(`[secureStorage] ${operation} failed: ${detail}`);
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