const NETWORK_PASSPHRASES = {
  mainnet: "Public Global Stellar Network ; September 2015",
  testnet: "Test SDF Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
};

module.exports = ({ config }) => {
  const network = (process.env.EXPO_PUBLIC_NETWORK ?? config.extra?.network ?? "testnet")
    .trim()
    .toLowerCase();

  return {
    ...config,
    extra: {
      ...config.extra,
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? config.extra?.apiUrl,
      network,
      networkPassphrase:
        process.env.EXPO_PUBLIC_NETWORK_PASSPHRASE ??
        NETWORK_PASSPHRASES[network] ??
        config.extra?.networkPassphrase,
    },
  };
};
