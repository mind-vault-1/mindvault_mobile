import { getDefaultApiBaseUrl, loadApiBaseUrl, saveApiBaseUrl } from "./apiSettings";
import Constants from "expo-constants";
import { Keypair, Transaction } from "@stellar/stellar-sdk";

import { getApiKey, storeApiKey, clearApiKey } from "../services/secureStorage";
import type { CatalogFilters, RegistryStatus, Resource } from "../types";
import { extractApiErrorMessage } from "../utils/errorLogger";
import { validateStellarSecret } from "../utils/validateStellarSecret";

let apiBaseUrl = getDefaultApiBaseUrl();

export const DEFAULT_STELLAR_NETWORK =
  (Constants.expoConfig?.extra?.network as string | undefined)?.trim().toLowerCase() || "testnet";

export const DEFAULT_NETWORK_PASSPHRASE =
  (Constants.expoConfig?.extra?.networkPassphrase as string | undefined) ??
  "Test SDF Network ; September 2015";

export { getDefaultApiBaseUrl };

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
    // Public metadata endpoint — GET /resources/:id is x402-paywalled.
    res = await fetch(`${apiBaseUrl}/resources/${encodeURIComponent(id)}/meta`);
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

/**
 * Sends an authenticated request to a publisher-only endpoint.
 *
 * Reads the publisher API key from secure storage, sends it as `x-api-key`,
 * and turns a non-OK response into an `Error` with a user-safe message. The
 * key itself never appears in the thrown message.
 */
async function publisherFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  fallbackMessage: string
): Promise<T> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("No API key configured");
  }

  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  if (res.status === 401) {
    throw new Error("Unauthorized: Invalid API key");
  }
  if (!res.ok) {
    const message = await extractApiErrorMessage(
      res,
      res.status === 403 ? "Forbidden: Access denied" : fallbackMessage
    );
    // Never let a server that echoes the key leak it into the UI.
    throw new Error(message.split(apiKey).join("[redacted]"));
  }

  return res.json();
}

function resourcePath(resourceId: string, suffix: string): string {
  return `/resources/${encodeURIComponent(resourceId)}/${suffix}`;
}

/** Unsigned transaction returned by every publisher `prepare` endpoint. */
export interface PreparedTransaction {
  unsignedXdr: string;
  networkPassphrase?: string;
}

export function prepareEditPrice(resourceId: string, price: string): Promise<PreparedTransaction> {
  return publisherFetch(
    resourcePath(resourceId, "price/prepare"),
    { method: "POST", body: { price } },
    "Failed to prepare price edit transaction."
  );
}

export interface SubmitPriceEditResponse {
  id: string;
  price: string;
  status: string;
}

export function submitPriceEdit(
  resourceId: string,
  signedXdr: string,
  price: string
): Promise<SubmitPriceEditResponse> {
  return publisherFetch(
    resourcePath(resourceId, "price"),
    { method: "POST", body: { signedXdr, price } },
    "Failed to submit signed price edit transaction."
  );
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

export type PrepareRegisterResponse = PreparedTransaction;

export interface SubmitRegisterResponse {
  txHash: string;
}

export function prepareRegister(resourceId: string): Promise<PrepareRegisterResponse> {
  return publisherFetch(
    resourcePath(resourceId, "register/prepare"),
    { method: "GET" },
    "Failed to prepare registration"
  );
}

export function submitRegister(
  resourceId: string,
  signedXdr: string
): Promise<SubmitRegisterResponse> {
  return publisherFetch(
    resourcePath(resourceId, "register"),
    { method: "POST", body: { signedXdr } },
    "Failed to submit registration"
  );
}

export type PrepareOwnershipResponse = PreparedTransaction;

export interface TransferOwnershipResponse {
  id: string;
  newCreator: string;
  status: string;
  txHash?: string;
}

export function prepareOwnershipTransfer(
  resourceId: string,
  newCreator: string
): Promise<PrepareOwnershipResponse> {
  return publisherFetch(
    resourcePath(resourceId, "ownership/prepare"),
    { method: "POST", body: { newCreator } },
    "Failed to prepare ownership transfer"
  );
}

export function submitOwnershipTransfer(
  resourceId: string,
  signedXdr: string,
  newCreator: string
): Promise<TransferOwnershipResponse> {
  return publisherFetch(
    resourcePath(resourceId, "ownership"),
    { method: "POST", body: { signedXdr, newCreator } },
    "Failed to submit ownership transfer"
  );
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
