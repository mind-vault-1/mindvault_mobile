import { Linking } from "react-native";

import { getNetwork, getNetworkConfig, NETWORKS, type StellarNetworkId } from "../config/network";

function normalizeNetwork(input?: string): string | null {
  const value = input?.trim().toLowerCase();
  return value && value.length > 0 ? value : null;
}

function explorerSegmentFromNetwork(input?: string): string | null {
  const network = normalizeNetwork(input);
  if (!network) return null;
  if (network.includes("future")) return "futurenet";
  if (network.includes("test")) return "testnet";
  if (network.includes("public") || network.includes("main") || network === "pubnet") return "public";
  return null;
}

function explorerSegmentFromPassphrase(passphrase?: string): string {
  const value = normalizeNetwork(passphrase);
  for (const config of Object.values(NETWORKS)) {
    if (value && normalizeNetwork(config.passphrase) === value) return config.explorerSegment;
  }
  return getNetworkConfig().explorerSegment;
}

function resolveExplorerNetworkSegment(opts: {
  network?: string;
  networkPassphrase?: string;
}): string {
  return (
    explorerSegmentFromNetwork(opts.network) ??
    explorerSegmentFromNetwork(getNetwork() as string) ??
    explorerSegmentFromPassphrase(opts.networkPassphrase)
  );
}

export function stellarExpertTxUrl(opts: {
  txHash: string;
  network?: string | StellarNetworkId;
  networkPassphrase?: string;
}): string {
  const segment = resolveExplorerNetworkSegment(opts);
  return `https://stellar.expert/explorer/${segment}/tx/${encodeURIComponent(opts.txHash)}`;
}

export function stellarExpertAccountUrl(opts: {
  accountId: string;
  network?: string | StellarNetworkId;
  networkPassphrase?: string;
}): string {
  const segment = resolveExplorerNetworkSegment(opts);
  return `https://stellar.expert/explorer/${segment}/account/${encodeURIComponent(opts.accountId)}`;
}

export async function openExternalUrl(url: string): Promise<void> {
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error("Cannot open URL");
  await Linking.openURL(url);
}
