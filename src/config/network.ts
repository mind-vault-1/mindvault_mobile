import Constants from "expo-constants";

export type StellarNetworkId = "testnet" | "futurenet" | "mainnet";

export interface StellarNetworkConfig {
  id: StellarNetworkId;
  label: string;
  horizonUrl: string;
  passphrase: string;
  explorerSegment: string;
  friendbotUrl?: string;
  usdcIssuer?: string;
}

export const NETWORKS: Record<StellarNetworkId, StellarNetworkConfig> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
    explorerSegment: "testnet",
    friendbotUrl: "https://friendbot.stellar.org",
    usdcIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
  futurenet: {
    id: "futurenet",
    label: "Futurenet",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    passphrase: "Test SDF Future Network ; October 2022",
    explorerSegment: "futurenet",
    friendbotUrl: "https://friendbot-futurenet.stellar.org",
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    horizonUrl: "https://horizon.stellar.org",
    passphrase: "Public Global Stellar Network ; September 2015",
    explorerSegment: "public",
  },
};

export const NETWORK_IDS: StellarNetworkId[] = ["testnet", "futurenet", "mainnet"];

function normalizeNetwork(value?: string): StellarNetworkId {
  const network = value?.trim().toLowerCase();
  if (!network) return "testnet";
  if (network === "future" || network.includes("future")) return "futurenet";
  if (network === "test" || network.includes("test")) return "testnet";
  if (
    network === "main" ||
    network === "pubnet" ||
    network.includes("public") ||
    network.includes("main")
  ) {
    return "mainnet";
  }
  return "testnet";
}

const initialNetwork = normalizeNetwork(Constants.expoConfig?.extra?.network as string | undefined);
let currentNetwork: StellarNetworkId = initialNetwork;
const listeners = new Set<(network: StellarNetworkId) => void>();

export function getDefaultNetworkId(): StellarNetworkId {
  return initialNetwork;
}

export function getNetwork(): StellarNetworkId {
  return currentNetwork;
}

export function getNetworkConfig(network: StellarNetworkId = currentNetwork): StellarNetworkConfig {
  return NETWORKS[network];
}

export function setNetwork(network: StellarNetworkId): void {
  if (network === currentNetwork) return;
  currentNetwork = network;
  for (const listener of listeners) listener(network);
}

export function subscribeNetwork(listener: (network: StellarNetworkId) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isTestnet(network: StellarNetworkId = currentNetwork): boolean {
  return network === "testnet";
}

export function resetNetworkForTests(): void {
  currentNetwork = initialNetwork;
  listeners.clear();
}
