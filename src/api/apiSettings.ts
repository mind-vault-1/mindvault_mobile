import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const STORAGE_KEY = "mindvault_api_base_url";
const DEFAULT_API_BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4021";

export function getDefaultApiBaseUrl(): string {
  return DEFAULT_API_BASE_URL;
}

export async function loadApiBaseUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  return saved && saved.trim().length > 0 ? saved : DEFAULT_API_BASE_URL;
}

export async function saveApiBaseUrl(value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(STORAGE_KEY, trimmed);
}
