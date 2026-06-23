import Constants from "expo-constants";

import type { CatalogFilters, RegistryStatus, Resource } from "../types";
import { logError } from "../utils/logger";

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
  try {
    const res = await fetch(`${API_BASE}/resources${buildQuery(filters)}`);
    if (!res.ok) {
      throw new Error("Failed to fetch catalog");
    }
    return res.json();
  } catch (err) {
    logError("fetchCatalog", err);
    throw err;
  }
}

export async function fetchRegistryStatus(): Promise<RegistryStatus> {
  try {
    const res = await fetch(`${API_BASE}/registry/status`);
    if (!res.ok) {
      throw new Error("Failed to fetch registry status");
    }
    return res.json();
  } catch (err) {
    logError("fetchRegistryStatus", err);
    throw err;
  }
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
