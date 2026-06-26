import * as SecureStore from "expo-secure-store";

const API_KEY_KEY = "x-api-key";

export async function storeApiKey(apiKey: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_KEY, apiKey);
}

export async function getApiKey(): Promise<string | null> {
  return await SecureStore.getItemAsync(API_KEY_KEY);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_KEY);
}
