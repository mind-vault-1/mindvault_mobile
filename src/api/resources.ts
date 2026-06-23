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

export interface RegisterPrepareResponse {
  xdr: string;
  networkPassphrase: string;
}

export interface RegisterResponse {
  txHash: string;
  success: boolean;
}

export async function prepareRegister(resourceId: string): Promise<RegisterPrepareResponse> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/register/prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error("Failed to prepare registration");
  }
  return res.json();
}

export async function submitRegister(
  resourceId: string,
  signedXdr: string
): Promise<RegisterResponse> {
  const res = await fetch(`${API_BASE}/resources/${resourceId}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ signedXdr }),
  });
  if (!res.ok) {
    throw new Error("Failed to submit registration");
  }
  return res.json();
}
