import Constants from "expo-constants";
import { Linking } from "react-native";

type StellarExpertNetworkSegment = "testnet" | "public";

const DEFAULT_NETWORK_PASSPHRASE =
  (Constants.expoConfig?.extra?.networkPassphrase as string | undefined) ??
  "Test SDF Network ; September 2015";

function normalizeNetwork(input?: string): string | null {
  const value = input?.trim().toLowerCase();
  return value && value.length > 0 ? value : null;
}

function networkSegmentFromNetworkName(network?: string): StellarExpertNetworkSegment | null {
  const n = normalizeNetwork(network);
  if (!n) return null;

  if (n.includes("test")) return "testnet";
  if (n.includes("public") || n.includes("mainnet") || n.includes("main")) return "public";

  return null;
}

function networkSegmentFromPassphrase(passphrase?: string): StellarExpertNetworkSegment {
  const p = normalizeNetwork(passphrase) ?? normalizeNetwork(DEFAULT_NETWORK_PASSPHRASE) ?? "";

  if (p.includes("test sdf network")) return "testnet";
  if (p.includes("public global stellar network")) return "public";

  // Default to testnet to match current app defaults.
  return "testnet";
}

export function stellarExpertTxUrl(opts: {
  txHash: string;
  network?: string;
  networkPassphrase?: string;
}): string {
  const segment =
    networkSegmentFromNetworkName(opts.network) ??
    networkSegmentFromPassphrase(opts.networkPassphrase);
  return `https://stellar.expert/explorer/${segment}/tx/${encodeURIComponent(opts.txHash)}`;
}

export function stellarExpertAccountUrl(opts: {
  accountId: string;
  network?: string;
  networkPassphrase?: string;
}): string {
  const segment =
    networkSegmentFromNetworkName(opts.network) ??
    networkSegmentFromPassphrase(opts.networkPassphrase);
  return `https://stellar.expert/explorer/${segment}/account/${encodeURIComponent(opts.accountId)}`;
}

export async function openExternalUrl(url: string): Promise<void> {
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error("Cannot open URL");
  await Linking.openURL(url);
}

