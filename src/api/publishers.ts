import { ApiError, request } from "./client";
import { getApiBaseUrl } from "./resources";
import { clearApiKey, getApiKey, storeApiKey } from "../services/secureStorage";
import type { Resource } from "../types";
import { extractApiErrorMessage } from "../utils/errorLogger";

/** Shape returned by `GET /publishers/me`. */
export interface PublisherProfile {
  id: string;
  name: string;
  email: string;
  walletAddress: string;
  createdAt: string;
}

/** Shape returned by `GET /publishers/me/analytics`; amounts have four decimals. */
export interface PublisherAnalytics {
  summary: {
    totalEarned: string;
    currency: string;
    totalSales: number;
    totalResources: number;
    listedResources: number;
    verification: { verified: number; rejected: number; pending: number };
  };
  resources: {
    id: string;
    title: string;
    price: string;
    totalSales: number;
    totalEarned: string;
    recentPayments: { payerAddress: string; amount: string; paidAt: string }[];
  }[];
}

/** Request body for `POST /publishers`. */
export interface RegisterPublisherRequest {
  name: string;
  email: string;
  walletAddress: string;
}

/** Response from `POST /publishers`. */
export interface RegisterPublisherResponse {
  id: string;
  name: string;
  email: string;
  walletAddress: string;
  apiKey: string;
  createdAt: string;
}

/** Response from `POST /publishers/me/api-key/rotate`. */
export interface RotateApiKeyResponse {
  apiKey: string;
}

/** A publisher's public page: `GET /publishers/wallet/:address` plus their listed resources. */
export interface PublicPublisher {
  publisher: PublisherProfile;
  resources: Resource[];
}

/**
 * Loads the public profile and listed resources of the publisher that owns a
 * wallet. Resolves to null when the server has no publisher for it (404).
 */
export async function fetchPublicPublisher(
  address: string,
  signal?: AbortSignal
): Promise<PublicPublisher | null> {
  const baseUrl = getApiBaseUrl();
  const wallet = encodeURIComponent(address);
  try {
    const [{ data: publisher }, { data: listed }] = await Promise.all([
      request<PublisherProfile>(`${baseUrl}/publishers/wallet/${wallet}`, {
        signal,
        fallbackMessage: "Failed to load publisher",
      }),
      // shortcut: first 100 listings only (the server's page limit); paginate if a publisher outgrows it.
      request<Resource[]>(`${baseUrl}/resources?owner=${wallet}&limit=100`, {
        signal,
        fallbackMessage: "Failed to load publisher resources",
      }),
    ]);
    // `owner` also matches publisher names and partial addresses; keep this wallet's rows only.
    const resources = Array.isArray(listed)
      ? listed.filter((resource) => resource.walletAddress === address)
      : [];
    return { publisher, resources };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** One row of `GET /publishers/leaderboard`; amounts have four decimals. */
export interface LeaderboardEntry {
  id: string;
  name: string;
  walletAddress: string;
  joinedAt: string;
  totalResources: number;
  listedResources: number;
  verifiedResources: number;
  totalSales: number;
  totalEarned: string;
}

/** Loads the public publisher leaderboard, already sorted by earnings (highest first). */
export async function fetchLeaderboard(signal?: AbortSignal): Promise<LeaderboardEntry[]> {
  const { data } = await request<LeaderboardEntry[]>(`${getApiBaseUrl()}/publishers/leaderboard`, {
    signal,
    fallbackMessage: "Failed to load leaderboard",
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Shows just enough of a key for a publisher to recognise the active one
 * without exposing the secret on screen or in a screenshot.
 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/**
 * Fetches the publisher that owns an API key. Uses the stored key by default;
 * pass `apiKey` to check a new key against the server before storing it.
 */
export async function fetchMe(apiKey?: string): Promise<PublisherProfile> {
  return fetchPublisherData("/publishers/me", "Failed to load publisher profile", apiKey);
}

export async function fetchAnalytics(apiKey?: string): Promise<PublisherAnalytics> {
  return fetchPublisherData("/publishers/me/analytics", "Failed to load publisher analytics", apiKey);
}

/**
 * Registers a new publisher account.
 * Returns the publisher profile including the API key (only returned once).
 * Throws on 409 (email already registered) or validation errors.
 */
export async function registerPublisher(
  request: RegisterPublisherRequest
): Promise<RegisterPublisherResponse> {
  const res = await fetch(`${getApiBaseUrl()}/publishers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (res.status === 409) {
    const message = await extractApiErrorMessage(res, "Email already registered");
    throw new Error(message);
  }
  if (!res.ok) {
    const message = await extractApiErrorMessage(res, "Failed to register publisher");
    throw new Error(message);
  }

  return res.json();
}

/**
 * Rotates the stored publisher API key. The server invalidates the old key
 * immediately, so the new key is written to secure storage only after the
 * response has been validated; a failed rotation leaves the old key in place
 * for the caller to report.
 */
export async function rotateApiKey(): Promise<string> {
  const currentKey = await getApiKey();
  if (!currentKey) {
    throw new Error("No API key configured");
  }

  const res = await publisherKeyRequest(
    "/publishers/me/api-key/rotate",
    "POST",
    currentKey,
    "Failed to rotate API key"
  );

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("Server did not return a new API key.");
  }

  const apiKey = (body as Partial<RotateApiKeyResponse> | null)?.apiKey;
  const newKey = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!newKey) {
    throw new Error("Server did not return a new API key.");
  }

  await storeApiKey(newKey);
  return newKey;
}

/**
 * Revokes the stored publisher API key on the server and removes it from this
 * device. A key the server already rejects (401) or cannot find (404) is
 * treated as revoked so the publisher can always sign out locally.
 */
export async function revokeApiKey(): Promise<void> {
  const currentKey = await getApiKey();
  if (!currentKey) {
    throw new Error("No API key configured");
  }

  const res = await fetch(`${getApiBaseUrl()}/publishers/me/api-key`, {
    method: "DELETE",
    headers: { "x-api-key": currentKey },
  });

  if (!res.ok && res.status !== 401 && res.status !== 404) {
    const message = await extractApiErrorMessage(res, "Failed to revoke API key");
    throw new Error(message.split(currentKey).join("[redacted]"));
  }

  await clearApiKey();
}

async function publisherKeyRequest(
  path: string,
  method: "POST" | "DELETE",
  key: string,
  fallback: string
): Promise<Response> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: { "x-api-key": key },
  });

  if (res.status === 401) {
    throw new Error("Unauthorized: Invalid API key");
  }
  if (!res.ok) {
    const message = await extractApiErrorMessage(res, fallback);
    // Never let a server that echoes the key leak it into the UI.
    throw new Error(message.split(key).join("[redacted]"));
  }

  return res;
}

async function fetchPublisherData<T>(path: string, fallback: string, apiKey?: string): Promise<T> {
  const key = apiKey ?? (await getApiKey());
  if (!key) {
    throw new Error("No API key configured");
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { "x-api-key": key },
  });

  if (res.status === 401) {
    throw new Error("Unauthorized: Invalid API key");
  }
  if (!res.ok) {
    const message = await extractApiErrorMessage(res, fallback);
    // Never let a server that echoes the key leak it into the UI.
    throw new Error(message.split(key).join("[redacted]"));
  }

  return res.json();
}