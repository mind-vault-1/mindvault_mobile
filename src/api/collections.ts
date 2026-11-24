import { request } from "./client";
import { getApiBaseUrl } from "./resources";
import type { Resource } from "../types";

export interface Collection {
  id: string;
  title: string;
  description?: string;
  resourceIds?: string[];
  resources?: Resource[];
}

export type CollectionsResponse = Collection[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const collectionSchema = (value: unknown): Collection => {
  if (!isRecord(value)) throw new Error("The server returned an unexpected response.");
  if (typeof value.id !== "string" || typeof value.title !== "string") {
    throw new Error("The server returned an unexpected response.");
  }
  return value as Collection;
};

export async function fetchCollections(signal?: AbortSignal): Promise<Collection[]> {
  const { data } = await request<CollectionsResponse>(
    `${getApiBaseUrl()}/collections`,
    { signal, fallbackMessage: "Failed to fetch collections", schema: (value) => {
      if (Array.isArray(value)) return value.map((item) => collectionSchema(item));
      if (isRecord(value) && Array.isArray(value.items)) {
        return value.items.map((item) => collectionSchema(item));
      }
      return [];
    } }
  );
  return data;
}

export async function fetchCollection(
  id: string,
  signal?: AbortSignal
): Promise<Collection> {
  if (!id.trim()) throw new Error("A collection id is required.");
  const { data } = await request<Collection>(
    `${getApiBaseUrl()}/collections/${encodeURIComponent(id)}`,
    { signal, fallbackMessage: "Collection not found.", schema: collectionSchema }
  );
  return data;
}
