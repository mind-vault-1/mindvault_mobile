import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

/**
 * Runtime config fetched from `extra.remoteConfigUrl`, so an incident response can
 * change the API host, a request limit or a feature flag without a new release.
 *
 * Every value has a compiled-in fallback: the app works before the first fetch,
 * offline, and when the endpoint is down. The last good response is cached.
 */

const CACHE_KEY = "@mindvault_remote_config";
const BUCKET_KEY = "@mindvault_rollout_bucket";
const FETCH_TIMEOUT_MS = 3_000;

/** Compiled-in request timeout. Also the fallback for an invalid remote value. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/** `true`/`false` switches a feature for everyone. A number 0–100 is a percentage rollout. */
export type FlagValue = boolean | number;

export interface RemoteConfig {
  /** API host for installs that have not saved their own in Settings. Checked before use. */
  apiBaseUrl?: string;
  limits: { requestTimeoutMs: number };
  flags: Record<string, FlagValue>;
}

const DEFAULTS: RemoteConfig = {
  limits: { requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS },
  flags: {},
};

let current: RemoteConfig = DEFAULTS;
/** Stable per install (0–99), so a percentage rollout keeps the same installs in it. */
let rolloutBucket: number | null = null;

/** Keeps only well-formed values. Anything else falls back to the default. */
export function parseRemoteConfig(raw: unknown): RemoteConfig {
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const limits = (record.limits && typeof record.limits === "object" ? record.limits : {}) as Record<string, unknown>;
  const timeout = limits.requestTimeoutMs;

  const flags: Record<string, FlagValue> = {};
  if (record.flags && typeof record.flags === "object") {
    for (const [name, value] of Object.entries(record.flags as Record<string, unknown>)) {
      if (typeof value === "boolean") flags[name] = value;
      else if (typeof value === "number" && value >= 0 && value <= 100) flags[name] = value;
    }
  }

  return {
    apiBaseUrl: typeof record.apiBaseUrl === "string" ? record.apiBaseUrl.trim() || undefined : undefined,
    limits: {
      requestTimeoutMs:
        typeof timeout === "number" && Number.isInteger(timeout) && timeout >= 1_000 && timeout <= 60_000
          ? timeout
          : DEFAULT_REQUEST_TIMEOUT_MS,
    },
    flags,
  };
}

export function getRemoteConfig(): RemoteConfig {
  return current;
}

/** Whether a feature is on for this install. Unknown flags are off. */
export function isFeatureEnabled(name: string): boolean {
  const value = current.flags[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return rolloutBucket !== null && rolloutBucket < value;
  return false;
}

async function readOrCreateRolloutBucket(): Promise<number> {
  const saved = await AsyncStorage.getItem(BUCKET_KEY);
  const parsed = saved === null ? Number.NaN : Number(saved);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed < 100) return parsed;
  const bucket = Math.floor(Math.random() * 100);
  await AsyncStorage.setItem(BUCKET_KEY, String(bucket));
  return bucket;
}

/** Applies the cached config and this install's rollout bucket. Makes no network request. */
export async function loadRemoteConfig(): Promise<void> {
  rolloutBucket = await readOrCreateRolloutBucket();
  const cached = await AsyncStorage.getItem(CACHE_KEY);
  if (!cached) return;
  try {
    current = parseRemoteConfig(JSON.parse(cached));
  } catch {
    current = DEFAULTS;
  }
}

/**
 * Fetches the latest config, caches it and applies it. Throws on failure, and the
 * config applied before the call stays in effect. Does nothing without a URL.
 */
export async function refreshRemoteConfig(): Promise<void> {
  const url = (Constants.expoConfig?.extra?.remoteConfigUrl as string | undefined)?.trim();
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Remote config request failed with ${res.status}`);
    const next = parseRemoteConfig(await res.json());
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
    current = next;
  } finally {
    clearTimeout(timer);
  }
}

export function resetRemoteConfigForTests(): void {
  current = DEFAULTS;
  rolloutBucket = null;
}
