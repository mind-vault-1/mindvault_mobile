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
}

export interface CatalogFilters {
  search?: string;
  verificationStatus?: "all" | VerificationStatus;
  resourceType?: "all" | "file" | "link";
}

export interface RegistryStatus {
  resourceCount: number;
}

export interface PublisherResource extends Resource {
  // Authenticated publisher-specific fields could be added here
}

