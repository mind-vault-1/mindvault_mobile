import Constants from "expo-constants";

export const FEATURE_FLAGS = ["newScanner", "wallet", "beta"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FeatureFlagOverrides = Partial<Record<FeatureFlag, boolean>>;

const FEATURE_FLAG_NAMES: ReadonlySet<string> = new Set<string>(FEATURE_FLAGS);

export interface FeatureFlagState {
  name: FeatureFlag;
  enabled: boolean;
}

function parseOverrides(raw: unknown): FeatureFlagOverrides {
  let source: unknown = raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const overrides: FeatureFlagOverrides = {};
  for (const [name, value] of Object.entries(source as Record<string, unknown>)) {
    if (FEATURE_FLAG_NAMES.has(name) && typeof value === "boolean") {
      overrides[name as FeatureFlag] = value;
    }
  }
  return overrides;
}

export function getBuildFeatureFlagOverrides(): FeatureFlagOverrides {
  return parseOverrides(
    Constants.expoConfig?.extra?.featureFlags ?? process.env.EXPO_PUBLIC_FEATURE_FLAGS
  );
}

export function areDeveloperFlagsVisible(isDev: boolean = __DEV__): boolean {
  return isDev;
}

export function listFeatureFlags(
  overrides: FeatureFlagOverrides = getBuildFeatureFlagOverrides()
): FeatureFlagState[] {
  return FEATURE_FLAGS.map((name) => ({ name, enabled: overrides[name] === true }));
}
