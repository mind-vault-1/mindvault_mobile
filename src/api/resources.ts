import Constants from "expo-constants";

import { getApiKey } from "../services/secureStorage";
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

export async function fetchPublisherResources(): Promise<Resource[]> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("No API key configured");
  }

  const res = await fetch(`${API_BASE}/publishers/me/resources`, {
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (res.status === 401) {
    throw new Error("Unauthorized: Invalid API key");
  }

  if (res.status === 403) {
    throw new Error("Forbidden: Access denied");
  }

  if (!res.ok) {
    throw new Error("Failed to fetch publisher resources");
  }

  return res.json();
}
