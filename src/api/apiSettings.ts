import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const STORAGE_KEY = "mindvault_api_base_url";
const DEFAULT_API_BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4021";

export interface ApiBaseUrlValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

export function getDefaultApiBaseUrl(): string {
  return DEFAULT_API_BASE_URL;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]"
  );
}

function isPrivateLanIp(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function validateApiBaseUrl(value: string): ApiBaseUrlValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: false, errorMessage: "API base URL cannot be empty." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      errorMessage: "Enter a complete URL, including http:// or https://.",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      isValid: false,
      errorMessage: "API base URL must use http:// or https://.",
    };
  }

  if (url.username || url.password) {
    return {
      isValid: false,
      errorMessage: "API base URL cannot include a username or password.",
    };
  }

  if (url.search || url.hash) {
    return {
      isValid: false,
      errorMessage: "API base URL cannot include query parameters or fragments.",
    };
  }

  const allowsInsecureHttp =
    isLoopbackHost(url.hostname) || isPrivateLanIp(url.hostname);
  if (url.protocol === "http:" && !allowsInsecureHttp) {
    return {
      isValid: false,
      errorMessage:
        "Use https:// unless connecting to localhost or a private LAN IP.",
    };
  }

  return { isValid: true };
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

  const validation = validateApiBaseUrl(trimmed);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage ?? "Invalid API base URL.");
  }

  await AsyncStorage.setItem(STORAGE_KEY, trimmed);
}
