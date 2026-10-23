import { getDefaultApiBaseUrl, loadApiBaseUrl, saveApiBaseUrl } from "./apiSettings";
import Constants from "expo-constants";
import { Keypair, Transaction } from "@stellar/stellar-sdk";

import { ApiError, request } from "./client";
import { getApiKey, storeApiKey, clearApiKey } from "../services/secureStorage";
import type { CatalogFilters, RegistryStatus, Resource } from "../types";
import { validateStellarSecret } from "../utils/validateStellarSecret";
import { parsePriceRange } from "../utils/priceRange";

let apiBaseUrl = getDefaultApiBaseUrl();

export const DEFAULT_STELLAR_NETWORK =
  (Constants.expoConfig?.extra?.network as string | undefined)?.trim().toLowerCase() || "testnet";

export const DEFAULT_NETWORK_PASSPHRASE =
  (Constants.expoConfig?.extra?.networkPassphrase as string | undefined) ??
  "Test SDF Network ; September 2015";

export { getDefaultApiBaseUrl };

export interface CatalogResponse {
  items: Resource[];
  total: number;
  nextOffset: number | null;
}

export type FetchCatalogParams = CatalogFilters & {
  limit?: number;
  offset?: number;
};

export function buildQuery(filters?: FetchCatalogParams): string {
  if (!filters) return "";

  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.verificationStatus && filters.verificationStatus !== "all") {
    params.set("verificationStatus", filters.verificationStatus);
  }
  if (filters.resourceType && filters.resourceType !== "all") {
    params.set("resourceType", filters.resourceType);
  }
  if (["newest", "price_asc", "price_desc", "title"].includes(filters.sort ?? "")) {
    params.set("sort", filters.sort!);
  }

  const range = parsePriceRange(filters.minPrice ?? "", filters.maxPrice ?? "");
  if (!range.isInvalid) {
    if (range.min !== null) params.set("minPrice", String(range.min));
    if (range.max !== null) params.set("maxPrice", String(range.max));
  }

  if (filters.limit !== undefined && filters.limit !== null && !isNaN(filters.limit)) {
    params.set("limit", String(filters.limit));
  }
  if (filters.offset !== undefined && filters.offset !== null && !isNaN(filters.offset)) {
    params.set("offset", String(filters.offset));
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

/** Body shape of `GET /resources`: a bare array, or an envelope with pagination fields. */
type CatalogPayload =
  | Resource[]
  | { items?: Resource[]; total?: number; nextOffset?: number | null };

export async function fetchCatalog(
  params?: FetchCatalogParams,
  signal?: AbortSignal
): Promise<CatalogResponse> {
  const { data: rawData, headers } = await request<CatalogPayload>(
    `${apiBaseUrl}/resources${buildQuery(params)}`,
    { signal, fallbackMessage: "Failed to fetch catalog" }
  );
  const payload = Array.isArray(rawData) ? null : rawData;
  const items: Resource[] = Array.isArray(rawData) ? rawData : (rawData?.items ?? []);

  const totalHeader = headers?.get
    ? (headers.get("x-total-count") ?? headers.get("X-Total-Count"))
    : null;
  const nextOffsetHeader = headers?.get
    ? (headers.get("x-next-offset") ?? headers.get("X-Next-Offset"))
    : null;

  let total: number;
  if (
    totalHeader !== null &&
    totalHeader !== undefined &&
    totalHeader !== "" &&
    !isNaN(Number(totalHeader))
  ) {
    total = Number(totalHeader);
  } else if (payload && typeof payload.total === "number") {
    total = payload.total;
  } else {
    total = items.length;
  }

  let nextOffset: number | null = null;
  if (
    nextOffsetHeader !== null &&
    nextOffsetHeader !== undefined &&
    nextOffsetHeader !== "" &&
    nextOffsetHeader !== "null" &&
    !isNaN(Number(nextOffsetHeader))
  ) {
    nextOffset = Number(nextOffsetHeader);
  } else if (
    payload &&
    (typeof payload.nextOffset === "number" || payload.nextOffset === null)
  ) {
    nextOffset = payload.nextOffset;
  }

  return {
    items,
    total,
    nextOffset,
  };
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

function resourceFallbackMessage(status: number): string {
  if (status === 404) return "Resource not found.";
  if (status >= 500) return "Server error. Please try again.";
  return "Failed to load resource.";
}

export async function fetchResource(id: string): Promise<Resource> {
  try {
    // Public metadata endpoint — GET /resources/:id is x402-paywalled.
    const { data } = await request<Resource>(
      `${apiBaseUrl}/resources/${encodeURIComponent(id)}/meta`,
      { fallbackMessage: resourceFallbackMessage }
    );
    return data;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.kind === "network" || error.kind === "timeout") {
      throw new ResourceFetchError("Network error. Please check your connection.", true);
    }
    // 5xx is worth retrying later; a 404 or other client error is not.
    throw new ResourceFetchError(error.message, (error.status ?? 0) >= 500);
  }
}

export async function fetchRegistryStatus(): Promise<RegistryStatus> {
  const { data } = await request<RegistryStatus>(`${apiBaseUrl}/registry/status`, {
    fallbackMessage: "Failed to fetch registry status",
  });
  return data;
}

/**
 * Sends an authenticated request to a publisher-only endpoint.
 *
 * Reads the publisher API key from secure storage, sends it as `x-api-key`,
 * and turns a non-OK response into an `Error` with a user-safe message. The
 * key itself never appears in the thrown message. A 402 is rethrown as the
 * original `ApiError` so the caller can read the x402 challenge headers.
 */
export async function publisherFetch<T>(
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown; headers?: Record<string, string> },
  fallbackMessage: string
): Promise<T> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("No API key configured");
  }

  try {
    const { data } = await request<T>(`${apiBaseUrl}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...init.headers,
      },
      body: init.body,
      fallbackMessage: (status) =>
        status === 403 ? "Forbidden: Access denied" : fallbackMessage,
    });
    return data;
  } catch (error) {
    if (!(error instanceof ApiError) || error.kind !== "http") throw error;
    if (error.status === 401) {
      throw new Error("Unauthorized: Invalid API key");
    }
    // A 402 is a payment challenge the caller handles, so keep its headers.
    if (error.status === 402) throw error;
    // Never let a server that echoes the key leak it into the UI.
    throw new Error(error.message.split(apiKey).join("[redacted]"));
  }
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
 * Delists a resource so it stops showing up in the public catalog.
 * `DELETE /resources/:id` — the server only allows the resource owner.
 */
export function delistResource(resourceId: string): Promise<void> {
  return publisherFetch<void>(
    `/resources/${encodeURIComponent(resourceId)}`,
    { method: "DELETE" },
    "Failed to delist resource"
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
  try {
    const { data } = await request<Resource[]>(
      `${getApiBaseUrl()}/publishers/me/resources${query}`,
      {
        headers: {
          "x-api-key": key,
        },
        fallbackMessage: "Failed to fetch publisher resources",
      }
    );
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new Error("Unauthorized: Invalid API key");
    }
    if (error instanceof ApiError && error.status === 403) {
      throw new Error("Forbidden: Access denied");
    }
    throw error;
  }
}

export { storeApiKey };
export const getStoredApiKey = getApiKey;
export const deleteStoredApiKey = clearApiKey;
