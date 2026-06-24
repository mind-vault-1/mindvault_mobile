import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import type { CatalogFilters, RegistryStatus, Resource, PublisherResource } from "../types";

const API_BASE =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4021";

const API_KEY_STORAGE_KEY = "mindvault_api_key";

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

function buildPublisherQuery(search?: string): string {
  if (!search) return "";
  return `?search=${encodeURIComponent(search)}`;
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

// API Key Management
export async function storeApiKey(apiKey: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey);
  } catch (error) {
    throw new Error("Failed to store API key");
  }
}

export async function getStoredApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

export async function deleteStoredApiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
  } catch (error) {
    throw new Error("Failed to delete API key");
  }
}

// Authenticated Publisher Resources
export async function fetchPublisherResources(
  apiKey: string,
  search?: string
): Promise<PublisherResource[]> {
  if (!apiKey) {
    throw new Error("API key is required");
  }

  const res = await fetch(`${API_BASE}/publisher/resources${buildPublisherQuery(search)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Invalid API key");
    }
    throw new Error("Failed to fetch publisher resources");
  }

  return res.json();
}

export function getApiBaseUrl(): string {
  return API_BASE;
}

