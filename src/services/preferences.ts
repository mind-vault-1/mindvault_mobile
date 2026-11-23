import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Preferences {
  version: 1;
  perPaymentLimit: string;
}

export const DEFAULT_PER_PAYMENT_LIMIT = "5.00";

const PREFERENCES_KEY = "@mindvault_preferences:v1";

const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  perPaymentLimit: DEFAULT_PER_PAYMENT_LIMIT,
};

export class InvalidPreferenceError extends Error {}

export function isValidPaymentLimit(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,7})?$/.test(trimmed)) return false;
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(`${whole}${fraction.padEnd(7, "0")}`) > BigInt(0);
}

function normalize(value: unknown): Preferences {
  if (!value || typeof value !== "object") return DEFAULT_PREFERENCES;
  const row = value as Partial<Preferences>;
  if (
    row.version !== 1 ||
    typeof row.perPaymentLimit !== "string" ||
    !isValidPaymentLimit(row.perPaymentLimit)
  ) {
    return DEFAULT_PREFERENCES;
  }
  return { version: 1, perPaymentLimit: row.perPaymentLimit.trim() };
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
    return stored ? normalize(JSON.parse(stored) as unknown) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePerPaymentLimit(value: string): Promise<Preferences> {
  if (!isValidPaymentLimit(value)) {
    throw new InvalidPreferenceError(
      "Enter a positive USDC amount with at most 7 decimals."
    );
  }
  const next: Preferences = { version: 1, perPaymentLimit: value.trim() };
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  return next;
}
