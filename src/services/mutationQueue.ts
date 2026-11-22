import AsyncStorage from "@react-native-async-storage/async-storage";

import { delistResource } from "../api/resources";
import type { LeaseTier } from "../api/leases";
import { publishLink, type PublishLinkInput } from "../api/publish";
import type { PaymentChallenge } from "../api/payment";
import { ApiError } from "../api/client";
import { logError } from "../utils/errorLogger";

export type MutationKind = "publish" | "lease" | "delist";

export interface PublishActionPayload {
  input: PublishLinkInput;
  payment?: { challenge: PaymentChallenge; transaction: string };
  title?: string;
}

export interface LeaseActionPayload {
  resourceId: string;
  tier: LeaseTier;
  title?: string;
}

export interface DelistActionPayload {
  resourceId: string;
  title?: string;
}

export type MutationPayload = PublishActionPayload | LeaseActionPayload | DelistActionPayload;

export type QueuedMutationStatus = "pending" | "failed";

/** A pending offline action, persisted until it has been replayed successfully. */
export interface QueuedMutation {
  /** Stable identifier, assigned once and never reused. */
  id: string;
  kind: MutationKind;
  payload: MutationPayload;
  /** Same key ⇒ same action: enqueueing it twice keeps a single entry. */
  idempotencyKey: string;
  enqueuedAt: number;
  attempts: number;
  status: QueuedMutationStatus;
  lastError?: string;
}

export type MutationRunner = (mutation: QueuedMutation) => Promise<void>;

const STORAGE_KEY = "@mindvault_mutation_queue";
const STORE_VERSION = 1;

// --- runners -----------------------------------------------------------------

const defaultRunners: Record<MutationKind, MutationRunner> = {
  publish: async (mutation) => {
    const payload = mutation.payload as PublishActionPayload;
    await publishLink(payload.input, payload.payment, mutation.idempotencyKey);
  },
  delist: async (mutation) => {
    const payload = mutation.payload as DelistActionPayload;
    await delistResource(payload.resourceId);
  },
  // A lease purchase signs on-chain transactions with a secret that is entered
  // per purchase and never persisted (see SIGNING_STRATEGY.md), so a queued
  // lease cannot be completed headlessly. It stays queued as a permanent
  // failure with a retry action until the user confirms it again.
  lease: async () => {
    throw new Error("Lease purchase needs your confirmation — open the resource and lease again.");
  },
};

const runners: Record<MutationKind, MutationRunner> = { ...defaultRunners };

/** Replaces how a kind replays. Tests use this to exercise the queue core. */
export function setMutationRunner(kind: MutationKind, runner: MutationRunner): void {
  runners[kind] = runner;
}

export function resetMutationRunners(): void {
  Object.assign(runners, defaultRunners);
}

// --- store -------------------------------------------------------------------

async function readStore(): Promise<QueuedMutation[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: number; mutations?: unknown[] };
    if (parsed.version !== undefined && parsed.version > STORE_VERSION) return [];
    return Array.isArray(parsed.mutations) ? (parsed.mutations as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

async function writeStore(mutations: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORE_VERSION, mutations }));
}

const listeners = new Set<(mutations: QueuedMutation[]) => void>();

/** Notifies subscribers (e.g. the Queued UI) after every store change. */
export function subscribeMutations(listener: (mutations: QueuedMutation[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(mutations: QueuedMutation[]): void {
  for (const listener of listeners) listener(mutations);
}

// --- public API --------------------------------------------------------------

export interface EnqueueMutationInput {
  kind: MutationKind;
  payload: MutationPayload;
  idempotencyKey: string;
}

/**
 * Persists an offline action with a stable id, its payload and an idempotency
 * key. Enqueueing the same idempotency key again returns the existing entry.
 */
export async function enqueueMutation(input: EnqueueMutationInput): Promise<QueuedMutation> {
  const mutations = await readStore();
  const existing = mutations.find((entry) => entry.idempotencyKey === input.idempotencyKey);
  if (existing) return existing;

  const entry: QueuedMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    kind: input.kind,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    enqueuedAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  const next = [...mutations, entry];
  await writeStore(next);
  notify(next);
  return entry;
}

/** Returns the queued actions in FIFO (enqueue) order. */
export async function listMutations(): Promise<QueuedMutation[]> {
  const mutations = await readStore();
  return [...mutations].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.kind === "network" || error.kind === "timeout" || (error.status ?? 0) >= 500;
  }
  return false;
}

export interface FlushResult {
  completed: QueuedMutation[];
  failed: QueuedMutation[];
}

export interface FlushOptions {
  onCompleted?: (mutation: QueuedMutation) => void;
  onFailed?: (mutation: QueuedMutation) => void;
}

/**
 * Replays queued actions in FIFO order. Successful entries are removed (and
 * reported through `onCompleted`); failures stay in the queue — permanent ones
 * marked `failed` with a retry action, transient ones left `pending` for the
 * next drain. Later entries still run after a partial failure.
 */
export async function flushMutations(options: FlushOptions = {}): Promise<FlushResult> {
  const completed: QueuedMutation[] = [];
  const failed: QueuedMutation[] = [];
  let mutations = await listMutations();

  for (const mutation of mutations) {
    if (mutation.status === "failed") continue;
    try {
      await runners[mutation.kind](mutation);
      mutations = mutations.filter((entry) => entry.id !== mutation.id);
      await writeStore(mutations);
      completed.push(mutation);
      options.onCompleted?.(mutation);
    } catch (error) {
      const transient = isTransient(error);
      mutations = mutations.map((entry) =>
        entry.id === mutation.id
          ? {
              ...entry,
              attempts: entry.attempts + 1,
              status: transient ? ("pending" as const) : ("failed" as const),
              lastError: error instanceof Error ? error.message : String(error),
            }
          : entry
      );
      await writeStore(mutations);
      failed.push(mutation);
      options.onFailed?.(mutation);
      logError(`mutationQueue.flush:${mutation.kind}`, error);
    }
  }

  notify(mutations);
  return { completed, failed };
}

/** Re-queues a failed action (the queue's retry action) and runs it immediately. */
export async function retryMutation(id: string, options: FlushOptions = {}): Promise<void> {
  const mutations = await readStore();
  const next = mutations.map((entry) =>
    entry.id === id ? { ...entry, status: "pending" as const } : entry
  );
  await writeStore(next);
  notify(next);
  await flushMutations(options);
}

/** Human-readable label for per-action toasts. */
export function describeMutation(mutation: QueuedMutation): string {
  const title =
    "title" in mutation.payload && mutation.payload.title
      ? ` "${mutation.payload.title}"`
      : "";
  if (mutation.kind === "publish") return `Publish${title}`;
  if (mutation.kind === "lease") return `Lease${title}`;
  return `Delist${title}`;
}
