export type VerificationStatus = "verified" | "pending" | "rejected";
export type OnchainStatus = "registered" | "pending" | "failed" | "none";

export interface Resource {
  id: string;
  title: string;
  price: string;
  resourceType: string;
  publisherName?: string;
  walletAddress: string;
  verificationStatus: VerificationStatus;
  onchainStatus: OnchainStatus;
  onchainTxHash?: string;
  listed: boolean;
  accessUrl: string;
  publishedAt?: string;
  updatedAt?: string;
}

export type PublisherResource = Resource;

export interface CatalogFilters {
  search?: string;
  verificationStatus?: "all" | VerificationStatus;
  resourceType?: "all" | "file" | "link";
}

export interface RegistryStatus {
  resourceCount: number;
}

/** Headers parsed from an HTTP 402 Payment Required response */
export interface PaymentChallenge {
  price: string;        // e.g. "1.00"
  destination: string;  // Stellar wallet address
  network: string;      // e.g. "testnet" | "mainnet"
  assetCode?: string;   // e.g. "USDC"
  memo?: string;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  file: "File",
  link: "Link",
};

export function getResourceTypeLabel(type: string): string {
  return RESOURCE_TYPE_LABELS[type] ?? type;
}

export type AccessResult =
  | { type: "text"; content: string }
  | { type: "external"; url: string };
