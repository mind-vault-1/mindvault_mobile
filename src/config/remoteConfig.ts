import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Keypair } from "@stellar/stellar-sdk";

import { FEATURE_FLAGS, getBuildFeatureFlagOverrides, type FeatureFlag } from "./flags";

const CACHE_KEY = "@mindvault_remote_config";
const BUCKET_KEY = "@mindvault_rollout_bucket";
const FETCH_TIMEOUT_MS = 3_000;

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_PAGE_SIZE = 20;

export type FlagValue = boolean | number;

export interface RemoteConfig {
  apiBaseUrl?: string;
  limits: {
    requestTimeoutMs: number;
    pageSize: number;
  };
  flags: Partial<Record<FeatureFlag, FlagValue>>;
}

const DEFAULTS: RemoteConfig = {
  limits: { requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS, pageSize: DEFAULT_PAGE_SIZE },
  flags: {},
};

type ConfigListener = () => void;
const listeners = new Set<ConfigListener>();

let current: RemoteConfig = DEFAULTS;
let rolloutBucket: number | null = null;

export function canonicalizeRemoteConfigValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeRemoteConfigValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalizeRemoteConfigValue(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function getRemoteConfigPublicKey(): string | undefined {
  const fromExpo = Constants.expoConfig?.extra?.remoteConfigPublicKey as string | undefined;
  return (fromExpo ?? process.env.EXPO_PUBLIC_REMOTE_CONFIG_PUBLIC_KEY)?.trim() || undefined;
}

export function parseRemoteConfig(raw: unknown): RemoteConfig {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const limits = record.limits && typeof record.limits === "object"
    ? (record.limits as Record<string, unknown>)
    : {};
  const timeout = limits.requestTimeoutMs;
  const pageSize = limits.pageSize;

  const flags: Partial<Record<FeatureFlag, FlagValue>> = {};
  if (record.flags && typeof record.flags === "object") {
    for (const [name, value] of Object.entries(record.flags as Record<string, unknown>)) {
      if (!(FEATURE_FLAGS as readonly string[]).includes(name)) continue;
      if (typeof value === "boolean") flags[name as FeatureFlag] = value;
      else if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100) {
        flags[name as FeatureFlag] = value;
      }
    }
  }

  return {
    apiBaseUrl: typeof record.apiBaseUrl === "string" ? record.apiBaseUrl.trim() || undefined : undefined,
    limits: {
      requestTimeoutMs:
        typeof timeout === "number" && Number.isInteger(timeout) && timeout >= 1_000 && timeout <= 60_000
          ? timeout
          : DEFAULT_REQUEST_TIMEOUT_MS,
      pageSize:
        typeof pageSize === "number" && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100
          ? pageSize
          : DEFAULT_PAGE_SIZE,
    },
    flags,
  };
}

export function parseSignedRemoteConfig(
  raw: unknown,
  publicKey: string | undefined = getRemoteConfigPublicKey()
): RemoteConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Remote config document is missing.");
  }
  const envelope = raw as Record<string, unknown>;
  if (typeof envelope.signature !== "string") {
    throw new Error("Remote config document is not signed.");
  }
  if (!publicKey) {
    throw new Error("Remote config signing key is not configured.");
  }

  let verified = false;
  try {
    verified = Keypair.fromPublicKey(publicKey).verify(
      Buffer.from(canonicalizeRemoteConfigValue(envelope.config), "utf8"),
      Buffer.from(envelope.signature, "base64")
    );
  } catch {
    throw new Error("Invalid remote config signature.");
  }
  if (!verified) throw new Error("Invalid remote config signature.");

  return parseRemoteConfig(envelope.config);
}

export function getRemoteConfig(): RemoteConfig {
  return current;
}

export function subscribeRemoteConfig(listener: ConfigListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

export function isFeatureEnabled(
  name: FeatureFlag,
  overrides: Partial<Record<FeatureFlag, boolean>> = getBuildFeatureFlagOverrides()
): boolean {
  if (typeof overrides[name] === "boolean") return overrides[name] === true;
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

export async function loadRemoteConfig(): Promise<void> {
  rolloutBucket = await readOrCreateRolloutBucket();
  const cached = await AsyncStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      current = parseRemoteConfig(JSON.parse(cached));
    } catch {
      current = DEFAULTS;
    }
  }
  notifyListeners();
}

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
    const next = parseSignedRemoteConfig(JSON.parse(await res.text()));
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
    current = next;
    notifyListeners();
  } finally {
    clearTimeout(timer);
  }
}

export function resetRemoteConfigForTests(): void {
  current = DEFAULTS;
  rolloutBucket = null;
  notifyListeners();
}
