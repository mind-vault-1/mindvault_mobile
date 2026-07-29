import { loadApiBaseUrl, saveApiBaseUrl } from "./apiSettings";
import Constants from "expo-constants";
import { Keypair, Transaction } from "@stellar/stellar-sdk";

import { getApiKey, storeApiKey, clearApiKey } from "../services/secureStorage";
import type { CatalogFilters, RegistryStatus, Resource } from "../types";
import { extractApiErrorMessage } from "../utils/errorLogger";
import { validateStellarSecret } from "../utils/validateStellarSecret";

const DEFAULT_API_BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4021";
let apiBaseUrl = DEFAULT_API_BASE_URL;

export const DEFAULT_STELLAR_NETWORK =
  (Constants.expoConfig?.extra?.network as string | undefined)?.trim().toLowerCase() || "testnet";

export const DEFAULT_NETWORK_PASSPHRASE =
  (Constants.expoConfig?.extra?.networkPassphrase as string | undefined) ??
  "Test SDF Network ; September 2015";

const API_KEY_STORAGE_KEY = "mindvault_api_key";

export function buildQuery(filters?: CatalogFilters): string {
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
    throw new Error(await extractApiErrorMessage(res, "Failed to fetch catalog"));
  }
  return res.json();
}

export class ResourceFetchError extends Error {
  constructor(
    message: string,
    public readonly isTransient: boolean
  ) {
    super(message);
    this.name = "ResourceFetchError";
  }
}

export async function fetchResource(id: string): Promise<Resource> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/resources/${encodeURIComponent(id)}`);
  } catch {
    throw new ResourceFetchError("Network error. Please check your connection.", true);
  }

  if (res.status === 404) {
    throw new ResourceFetchError(
      await extractApiErrorMessage(res, "Resource not found."),
      false
    );
  }

  if (res.status >= 500) {
    throw new ResourceFetchError(
      await extractApiErrorMessage(res, "Server error. Please try again."),
      true
    );
  }

  if (!res.ok) {
    throw new ResourceFetchError(
      await extractApiErrorMessage(res, "Failed to load resource."),
      false
    );
  }

  return res.json();
}

export async function fetchRegistryStatus(): Promise<RegistryStatus> {
  const res = await fetch(`${apiBaseUrl}/registry/status`);
  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, "Failed to fetch registry status"));
  }
  return res.json();
}

export async function prepareEditPrice(
  resourceId: string,
  price: string
): Promise<{ xdr: string; networkPassphrase?: string }> {
  const response = await fetch(`${apiBaseUrl}/resources/${encodeURIComponent(resourceId)}/price/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price }),
  });

  if (!response.ok) {
    throw new Error(
      await extractApiErrorMessage(response, "Failed to prepare price edit transaction.")
    );
  }

  return response.json();
}

export async function submitPriceEdit(resourceId: string, signedXdr: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/resources/${encodeURIComponent(resourceId)}/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xdr: signedXdr }),
  });

  if (!response.ok) {
    throw new Error(
      await extractApiErrorMessage(response, "Failed to submit signed price edit transaction.")
    );
  }
}

export function signTransactionXdr(
  xdr: string,
  secretKey: string,
  networkPassphrase: string = DEFAULT_NETWORK_PASSPHRASE
): string {
  const validation = validateStellarSecret(secretKey);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage ?? "Invalid secret key.");
  }

  const transaction = new Transaction(xdr, networkPassphrase);
  const keypair = Keypair.fromSecret(secretKey.trim());
  transaction.sign(keypair);
  return transaction.toEnvelope().toXDR("base64");
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
  const res = await fetch(`${apiBaseUrl}/resources/${resourceId}/ownership/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, "Failed to prepare ownership transfer"));
  }
  return res.json();
}

export async function submitOwnershipTransfer(
  resourceId: string,
  signedXdr: string,
  destinationAddress: string
): Promise<TransferOwnershipResponse> {
  const res = await fetch(`${apiBaseUrl}/resources/${resourceId}/ownership`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr, destinationAddress }),
  });
  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, "Failed to submit ownership transfer"));
  }
  return res.json();
}

/**
 * Fetches the resources owned by the authenticated publisher.
 *
 * The request always targets the API base URL configured for the rest of the
 * API client (see {@link getApiBaseUrl}), so a base URL changed at runtime
 * from Settings is picked up here too.
 *
 * @param apiKey Optional key to authenticate with. When omitted, the key
 *   persisted in secure storage is used.
 * @param search Optional search term forwarded to the API as a query param.
 */
export async function fetchPublisherResources(
  apiKey?: string,
  search?: string
): Promise<Resource[]> {
  const key = apiKey?.trim() || (await getApiKey());
  if (!key) {
    throw new Error("No API key configured");
  }

  const query = buildQuery(search?.trim() ? { search: search.trim() } : undefined);
  const res = await fetch(`${getApiBaseUrl()}/publishers/me/resources${query}`, {
    headers: {
      "x-api-key": key,
    },
  });

  if (res.status === 401) {
    throw new Error("Unauthorized: Invalid API key");
  }

  if (res.status === 403) {
    throw new Error("Forbidden: Access denied");
  }

  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, "Failed to fetch publisher resources"));
  }

  return res.json();
}

export { storeApiKey };
export const getStoredApiKey = getApiKey;
export const deleteStoredApiKey = clearApiKey;
