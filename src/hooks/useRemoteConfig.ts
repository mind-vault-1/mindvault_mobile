import { useEffect, useState } from "react";

import { getRemoteConfig, subscribeRemoteConfig, type RemoteConfig } from "../config/remoteConfig";

export function useRemoteConfig(): RemoteConfig {
  const [config, setConfig] = useState<RemoteConfig>(getRemoteConfig);

  useEffect(() => {
    const update = () => setConfig(getRemoteConfig());
    update();
    return subscribeRemoteConfig(update);
  }, []);

  return config;
}
