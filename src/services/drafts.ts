import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  deleteServerDraft,
  listServerDrafts,
  saveServerDraft,
  type PublishLinkInput,
  type ServerDraft,
} from "../api/publish";
import { logError } from "../utils/errorLogger";

/**
 * Publish drafts. Every draft is kept on the device and mirrored to the
 * server (best effort) so it can be resumed on another device. Drafts are
 * only ever sent to the `/drafts` endpoints, never to `/resources`.
 */

export const DRAFTS_KEY = "@mindvault_drafts:v1";
const VERSION = 1;

export type Draft = ServerDraft;

async function readLocal(): Promise<Draft[]> {
  try {
    const raw = await AsyncStorage.getItem(DRAFTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: number; drafts?: unknown }) : null;
    if (parsed?.version !== VERSION || !Array.isArray(parsed.drafts)) return [];
    return parsed.drafts.filter(isDraft);
  } catch (err) {
    logError("drafts.read", err);
    return [];
  }
}

function isDraft(value: unknown): value is Draft {
  const row = value as Partial<Draft> | null;
  return (
    !!row &&
    typeof row.id === "string" &&
    typeof row.updatedAt === "string" &&
    !!row.input &&
    typeof row.input.title === "string"
  );
}

function writeLocal(drafts: Draft[]): Promise<void> {
  return AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify({ version: VERSION, drafts }));
}

/** Newest copy of each draft wins, newest first. */
function merge(...sources: Draft[][]): Draft[] {
  const byId = new Map<string, Draft>();
  for (const draft of sources.flat()) {
    const existing = byId.get(draft.id);
    if (!existing || Date.parse(draft.updatedAt) > Date.parse(existing.updatedAt)) byId.set(draft.id, draft);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function newDraftId(): string {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Saves (or updates, when `id` is given) a draft locally, then mirrors it to the server. */
export async function saveDraft(input: PublishLinkInput, id?: string, now: Date = new Date()): Promise<Draft> {
  const draft: Draft = { id: id ?? newDraftId(), input, updatedAt: now.toISOString() };
  await writeLocal(merge([draft], await readLocal()));
  try {
    await saveServerDraft(draft);
  } catch (err) {
    // Still saved on this device; the next save or list retries the sync.
    logError("drafts.saveRemote", err);
  }
  return draft;
}

/** Local and server drafts merged, so drafts started on another device can be resumed. */
export async function listDrafts(): Promise<Draft[]> {
  const local = await readLocal();
  let remote: Draft[] = [];
  try {
    remote = (await listServerDrafts()).filter(isDraft);
  } catch (err) {
    logError("drafts.listRemote", err);
    return local;
  }
  const merged = merge(local, remote);
  await writeLocal(merged);
  return merged;
}

/** Deletes a draft everywhere — used both for discarding and for cancelling a schedule before it is sent. */
export async function deleteDraft(id: string): Promise<void> {
  await writeLocal((await readLocal()).filter((draft) => draft.id !== id));
  try {
    await deleteServerDraft(id);
  } catch (err) {
    logError("drafts.deleteRemote", err);
  }
}

/** "2d 3h", "4h 05m", "12m 30s"; "Live now" once the time has passed. */
export function formatCountdown(publishAt: string, now: Date = new Date()): string {
  const ms = Date.parse(publishAt) - now.getTime();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Live now";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  return `${minutes}m ${pad(seconds)}s`;
}
