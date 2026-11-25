import { useEffect, useState } from "react";

import {
  FEATURE_FLAGS,
  getBuildFeatureFlagOverrides,
  type FeatureFlag,
  type FeatureFlagOverrides,
} from "../config/flags";
import { isFeatureEnabled, subscribeRemoteConfig } from "../config/remoteConfig";

export function useFeatureFlag(name: FeatureFlag): boolean {
  const [enabled, setEnabled] = useState(() =>
    isFeatureEnabled(name, getBuildFeatureFlagOverrides())
  );

  useEffect(() => {
    const update = () => setEnabled(isFeatureEnabled(name, getBuildFeatureFlagOverrides()));
    update();
    return subscribeRemoteConfig(update);
  }, [name]);

  return enabled;
}

export function useFeatureFlags(): Readonly<Record<FeatureFlag, boolean>> {
  const [flags, setFlags] = useState<Record<FeatureFlag, boolean>>(() =>
    resolveFlags(getBuildFeatureFlagOverrides())
  );

  useEffect(() => {
    const update = () => setFlags(resolveFlags(getBuildFeatureFlagOverrides()));
    update();
    return subscribeRemoteConfig(update);
  }, []);

  return flags;
}

function resolveFlags(overrides: FeatureFlagOverrides): Record<FeatureFlag, boolean> {
  const resolved = {} as Record<FeatureFlag, boolean>;
  for (const name of FEATURE_FLAGS) resolved[name] = isFeatureEnabled(name, overrides);
  return resolved;
}
