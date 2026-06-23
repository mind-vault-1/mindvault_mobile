import Constants from "expo-constants";

import type { CatalogFilters, RegistryStatus, Resource } from "../types";

const API_BASE =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4021";

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

export function getApiBaseUrl(): string {
  return API_BASE;
}

export interface PrepareOwnershipResponse {
  xdr: string;
  resourceId: string;
}

export interface TransferOwnershipResponse {
  success: boolean;
  txHash?: string;
}

export async function prepareOwnershipTransfer(
  resourceId: string
): Promise<PrepareOwnershipResponse> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/ownership/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error("Failed to prepare ownership transfer");
  }
  return res.json();
}

export async function submitOwnershipTransfer(
  resourceId: string,
  signedXdr: string,
  destinationAddress: string
): Promise<TransferOwnershipResponse> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/ownership`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr, destinationAddress }),
  });
  if (!res.ok) {
    throw new Error("Failed to submit ownership transfer");
  }
  return res.json();
}
