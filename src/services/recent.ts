import AsyncStorage from "@react-native-async-storage/async-storage";

import { logError } from "../utils/errorLogger";

const RECENT_RESOURCES_KEY = "@mindvault_recent_resources";
export const MAX_RECENT_RESOURCES = 20;

/** The minimum a row needs to render and to open the resource again. */
export interface RecentResource {
  id: string;
  title: string;
  price: string;
}

function isRecentResource(value: unknown): value is RecentResource {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.price === "string"
  );
}

async function saveRecent(resources: RecentResource[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_RESOURCES_KEY, JSON.stringify(resources));
  } catch (err) {
    logError("recent.saveRecent", err);
  }
}

/**
 * The most recently opened resources, newest first. Storage holds ids,
 * titles and prices only, so a deleted or unlisted resource still shows a
 * row the detail screen can try to open.
 */
export async function getRecentResources(): Promise<RecentResource[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_RESOURCES_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isRecentResource).slice(0, MAX_RECENT_RESOURCES);
  } catch (err) {
    // Unreadable or corrupt storage must not break the catalog.
    logError("recent.getRecentResources", err);
    return [];
  }
}

/** Moves `resource` to the front, drops an older entry for the same id. */
export async function recordRecentResource(
  resource: RecentResource,
): Promise<RecentResource[]> {
  const stored = await getRecentResources();
  const next = [
    resource,
    ...stored.filter((item) => item.id !== resource.id),
  ].slice(0, MAX_RECENT_RESOURCES);

  await saveRecent(next);
  return next;
}

export async function clearRecentResources(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_RESOURCES_KEY);
  } catch (err) {
    logError("recent.clearRecentResources", err);
  }
}
