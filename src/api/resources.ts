import { loadApiBaseUrl, saveApiBaseUrl } from "./apiSettings";
import Constants from "expo-constants";

import type { CatalogFilters, RegistryStatus, Resource } from "../types";
import { logError } from "../utils/errorLogger";

const DEFAULT_API_BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4021";
let apiBaseUrl = DEFAULT_API_BASE_URL;

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

export async function initializeApiBaseUrl(): Promise<string> {
  const saved = await loadApiBaseUrl();
  apiBaseUrl = saved;
  return apiBaseUrl;
}

export async function setApiBaseUrl(value: string): Promise<string> {
  await saveApiBaseUrl(value);
  const saved = await loadApiBaseUrl();
  apiBaseUrl = saved;
  return apiBaseUrl;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function getDefaultApiBaseUrl(): string {
  return DEFAULT_API_BASE_URL;
}

export async function fetchCatalog(filters?: CatalogFilters): Promise<Resource[]> {
  const res = await fetch(`${apiBaseUrl}/resources${buildQuery(filters)}`);
  if (!res.ok) {
    throw new Error("Failed to fetch catalog");
  }
}

export async function fetchCatalog(filters?: CatalogFilters): Promise<Resource[]> {
  return request<Resource[]>(`/resources${buildQuery(filters)}`, "Failed to fetch catalog");
}

export async function fetchResource(id: string): Promise<Resource> {
  const res = await fetch(`${API_BASE}/resources/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Resource not found");
  return res.json();
}

export async function fetchRegistryStatus(): Promise<RegistryStatus> {
  const res = await fetch(`${apiBaseUrl}/registry/status`);
  if (!res.ok) {
    throw new Error("Failed to fetch registry status");
  }
  return res.json();
}
