import { ApiError, request } from "./client";
import { getApiBaseUrl } from "./resources";
import { clearApiKey, getApiKey, storeApiKey } from "../services/secureStorage";
import { signedRequestHeaders } from "../utils/requestSignature";
import type { Resource } from "../types";

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

const UNEXPECTED = "The server returned an unexpected response.";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error(UNEXPECTED);
  return value as Record<string, unknown>;
}

function requireString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(UNEXPECTED);
  return value;
}

function requireNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number") throw new Error(UNEXPECTED);
  return value;
}

export const publisherProfileSchema = (value: unknown): PublisherProfile => {
  const row = asRecord(value);
  requireString(row, "id");
  requireString(row, "name");
  requireString(row, "email");
  requireString(row, "walletAddress");
  requireString(row, "createdAt");
  return value as PublisherProfile;
};

export const publisherAnalyticsSchema = (value: unknown): PublisherAnalytics => {
  const row = asRecord(value);
  const summary = asRecord(row.summary);
  requireString(summary, "totalEarned");
  requireString(summary, "currency");
  requireNumber(summary, "totalSales");
  requireNumber(summary, "totalResources");
  requireNumber(summary, "listedResources");
  const verification = asRecord(summary.verification);
  requireNumber(verification, "verified");
  requireNumber(verification, "rejected");
  requireNumber(verification, "pending");

  if (!Array.isArray(row.resources)) throw new Error(UNEXPECTED);
  for (const entry of row.resources) {
    const resource = asRecord(entry);
    requireString(resource, "id");
    requireString(resource, "title");
    requireString(resource, "price");
    requireNumber(resource, "totalSales");
    requireString(resource, "totalEarned");
    if (!Array.isArray(resource.recentPayments)) throw new Error(UNEXPECTED);
    for (const payment of resource.recentPayments) {
      const item = asRecord(payment);
      requireString(item, "payerAddress");
      requireString(item, "amount");
      requireString(item, "paidAt");
    }
  }
  return value as PublisherAnalytics;
};

export const registerPublisherSchema = (value: unknown): RegisterPublisherResponse => {
  publisherProfileSchema(value);
  requireString(asRecord(value), "apiKey");
  return value as RegisterPublisherResponse;
};

export const rotateApiKeySchema = (value: unknown): string => {
  const apiKey = asRecord(value).apiKey;
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) throw new Error("Server did not return a new API key.");
  return key;
};

export const resourceListSchema = (value: unknown): Resource[] => {
  // The previous client tolerated an unexpected envelope by showing no rows.
  return Array.isArray(value) ? value as Resource[] : [];
};

export const leaderboardSchema = (value: unknown): LeaderboardEntry[] => {
  if (!Array.isArray(value)) return [];
  for (const entry of value) {
    const row = asRecord(entry);
    requireString(row, "id");
    requireString(row, "name");
    requireString(row, "walletAddress");
    requireString(row, "joinedAt");
    requireNumber(row, "totalResources");
    requireNumber(row, "listedResources");
    requireNumber(row, "verifiedResources");
    requireNumber(row, "totalSales");
    requireString(row, "totalEarned");
  }
  return value as LeaderboardEntry[];
};

function redact(message: string, key: string): string {
  return message.split(key).join("[redacted]");
}

type PublisherRequestError = Error & { status?: number };

function taggedError(message: string, status?: number): PublisherRequestError {
  const error = new Error(message) as PublisherRequestError;
  if (status !== undefined) error.status = status;
  return error;
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
        // The plain-fetch original made a single attempt.
        retry: false,
        schema: publisherProfileSchema,
      }),
      // shortcut: first 100 listings only (the server's page limit); paginate if a publisher outgrows it.
      request<Resource[]>(`${baseUrl}/resources?owner=${wallet}&limit=100`, {
        signal,
        fallbackMessage: "Failed to load publisher resources",
        retry: false,
        schema: resourceListSchema,
      }),
    ]);
    // `owner` also matches publisher names and partial addresses; keep this wallet's rows only.
    const resources = listed.filter((resource) => resource.walletAddress === address);
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
    retry: false,
    schema: leaderboardSchema,
  });
  return data;
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
  return fetchPublisherData("/publishers/me", "Failed to load publisher profile", apiKey, publisherProfileSchema);
}

export async function fetchAnalytics(apiKey?: string): Promise<PublisherAnalytics> {
  return fetchPublisherData(
    "/publishers/me/analytics",
    "Failed to load publisher analytics",
    apiKey,
    publisherAnalyticsSchema
  );
}

/**
 * Registers a new publisher account.
 * Returns the publisher profile including the API key (only returned once).
 * Throws on 409 (email already registered) or validation errors.
 */
export async function registerPublisher(
  requestBody: RegisterPublisherRequest
): Promise<RegisterPublisherResponse> {
  const { data } = await request<RegisterPublisherResponse>(`${getApiBaseUrl()}/publishers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
    fallbackMessage: (status) => status === 409
      ? "Email already registered"
      : "Failed to register publisher",
    schema: registerPublisherSchema,
  });
  return data;
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

  let newKey: string;
  try {
    newKey = await publisherKeyRequest<string>(
      "/publishers/me/api-key/rotate",
      "POST",
      currentKey,
      "Failed to rotate API key",
      rotateApiKeySchema
    );
  } catch (error) {
    // Only a malformed/unparseable response should be rewritten. Network,
    // timeout and HTTP errors from the central client must keep their message.
    if (error instanceof ApiError) throw error;
    const status = (error as PublisherRequestError | null)?.status;
    if (status !== undefined) throw error;
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

  try {
    await request<void>(`${getApiBaseUrl()}/publishers/me/api-key`, {
      method: "DELETE",
      headers: {
        "x-api-key": currentKey,
        ...signedRequestHeaders({
          secret: currentKey,
          method: "DELETE",
          path: "/publishers/me/api-key",
        }),
      },
      fallbackMessage: "Failed to revoke API key",
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
      // Already unusable: finish the local sign-out.
    } else if (error instanceof Error) {
      throw new Error(redact(error.message, currentKey));
    } else {
      throw error;
    }
  }

  await clearApiKey();
}

async function publisherKeyRequest<T>(
  path: string,
  method: "POST" | "DELETE",
  key: string,
  fallback: string,
  schema?: (value: unknown) => T
): Promise<T> {
  try {
    const { data } = await request<T>(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        "x-api-key": key,
        ...signedRequestHeaders({ secret: key, method, path }),
      },
      fallbackMessage: fallback,
      ...(schema ? { schema } : {}),
    });
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw taggedError("Unauthorized: Invalid API key", error.status);
    }
    if (error instanceof ApiError) {
      throw taggedError(redact(error.message, key), error.status);
    }
    throw error;
  }
}

async function fetchPublisherData<T>(
  path: string,
  fallback: string,
  apiKey: string | undefined,
  schema: (value: unknown) => T
): Promise<T> {
  const key = apiKey ?? (await getApiKey());
  if (!key) {
    throw new Error("No API key configured");
  }

  try {
    const { data } = await request<T>(`${getApiBaseUrl()}${path}`, {
      headers: { "x-api-key": key },
      fallbackMessage: fallback,
      retry: false,
      schema,
    });
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new Error("Unauthorized: Invalid API key");
    }
    if (error instanceof ApiError) {
      throw new Error(redact(error.message, key));
    }
    throw error;
  }
}
