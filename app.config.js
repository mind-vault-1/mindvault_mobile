const NETWORK_PASSPHRASES = {
  mainnet: "Public Global Stellar Network ; September 2015",
  testnet: "Test SDF Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
};

/**
 * Derives the host from the API URL for universal links.
 * Returns null for localhost, non-HTTPS, or invalid URLs.
 */
function deriveUniversalLinkHost(apiUrl) {
  if (!apiUrl || typeof apiUrl !== "string") return null;
  try {
    // eslint-disable-next-line no-undef
    const url = new URL(apiUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
      return null;
    if (url.protocol !== "https:") return null;
    return url.hostname;
  } catch {
    return null;
  }
}

module.exports = ({ config }) => {
  const network = (
    process.env.EXPO_PUBLIC_NETWORK ??
    config.extra?.network ??
    "testnet"
  )
    .trim()
    .toLowerCase();

  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? config.extra?.apiUrl;
  const linkHost = deriveUniversalLinkHost(apiUrl);
  const remoteConfigUrl = process.env.EXPO_PUBLIC_REMOTE_CONFIG_URL ?? config.extra?.remoteConfigUrl;

  const updatedConfig = {
    ...config,
    extra: {
      ...config.extra,
      apiUrl,
      remoteConfigUrl,
      network,
      networkPassphrase:
        process.env.EXPO_PUBLIC_NETWORK_PASSPHRASE ??
        NETWORK_PASSPHRASES[network] ??
        config.extra?.networkPassphrase,
    },
  };

  // Add universal links configuration only for HTTPS hosts
  if (linkHost) {
    updatedConfig.ios = {
      ...updatedConfig.ios,
      associatedDomains: [`applinks:${linkHost}`],
    };

    updatedConfig.android = {
      ...updatedConfig.android,
      intentFilters: [
        ...(updatedConfig.android?.intentFilters ?? []),
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: linkHost,
              pathPrefix: "/resources",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    };
  }

  return updatedConfig;
};
