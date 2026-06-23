import Constants from "expo-constants";
import { Keypair, Transaction } from "stellar-sdk";

import type { CatalogFilters, RegistryStatus, Resource } from "../types";

const API_BASE =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4021";

const DEFAULT_NETWORK_PASSPHRASE =
  (Constants.expoConfig?.extra?.networkPassphrase as string | undefined) ??
  "Test SDF Network ; September 2015";

function buildQuery(filters?: CatalogFilters): string {
  if (!filters) return "";

  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.verificationStatus && filters.verificationStatus !== "all") {
    params.set("verificationStatus", filters.verificationStatus);
  }
  if (filters.resourceType && filters.resourceType !== "all") {
    params.set("resourceType", filters.resourceType);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchCatalog(filters?: CatalogFilters): Promise<Resource[]> {
  const res = await fetch(`${API_BASE}/resources${buildQuery(filters)}`);
  if (!res.ok) {
    throw new Error("Failed to fetch catalog");
  }
  return res.json();
}

export async function fetchRegistryStatus(): Promise<RegistryStatus> {
  const res = await fetch(`${API_BASE}/registry/status`);
  if (!res.ok) {
    throw new Error("Failed to fetch registry status");
  }
  return res.json();
}

export async function prepareEditPrice(
  resourceId: string,
  price: string
): Promise<{ xdr: string; networkPassphrase?: string }> {
  const response = await fetch(`${API_BASE}/resources/${encodeURIComponent(resourceId)}/price/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Failed to prepare price edit transaction.");
  }

  return response.json();
}

export async function submitPriceEdit(resourceId: string, signedXdr: string): Promise<void> {
  const response = await fetch(`${API_BASE}/resources/${encodeURIComponent(resourceId)}/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xdr: signedXdr }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Failed to submit signed price edit transaction.");
  }
}

export function signTransactionXdr(
  xdr: string,
  secretKey: string,
  networkPassphrase: string = DEFAULT_NETWORK_PASSPHRASE
): string {
  const transaction = new Transaction(xdr, networkPassphrase);
  const keypair = Keypair.fromSecret(secretKey.trim());
  transaction.sign(keypair);
  return transaction.toEnvelope().toXDR("base64");
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
