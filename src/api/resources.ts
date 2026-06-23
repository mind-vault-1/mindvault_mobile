import Constants from "expo-constants";

import type { CatalogFilters, RegistryStatus, Resource } from "../types";
import { logError } from "../utils/errorLogger";

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

async function request<T>(path: string, errorMessage: string): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
      throw new Error(errorMessage);
    }
    return (await res.json()) as T;
  } catch (error) {
    logError(errorMessage, error);
    throw error;
  }
}

export async function fetchCatalog(filters?: CatalogFilters): Promise<Resource[]> {
  return request<Resource[]>(`/resources${buildQuery(filters)}`, "Failed to fetch catalog");
}

export async function fetchRegistryStatus(): Promise<RegistryStatus> {
  return request<RegistryStatus>("/registry/status", "Failed to fetch registry status");
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
