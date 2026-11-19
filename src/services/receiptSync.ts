import AsyncStorage from "@react-native-async-storage/async-storage";

import { getApiBaseUrl } from "../api/resources";
import { listReceipts, saveReceipt, type PaymentReceipt } from "./receipts";
import { logError } from "../utils/errorLogger";

/**
 * Background reconciliation of locally saved receipts against `GET /receipts`.
 *
 * Matching is by tx hash: server-only receipts are added locally, local-only
 * ones are re-checked on later runs for a limited number of attempts. The sync
 * is fully asynchronous — callers never block the UI on it.
 */

export const MIN_SYNC_INTERVAL_MS = 30_000;
export const MAX_LOCAL_ONLY_ATTEMPTS = 5;

const STATE_KEY = "@mindvault_receipt_sync";
const PAGE_LIMIT = 50;

interface SyncState {
  /** Re-check attempts per tx hash for receipts the server has not seen yet. */
  attempts: Record<string, number>;
}

interface ReceiptsPage {
  receipts: PaymentReceipt[];
  nextCursor: string | null;
}

async function readState(): Promise<SyncState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SyncState>) : {};
    return { attempts: parsed.attempts && typeof parsed.attempts === "object" ? parsed.attempts : {} };
  } catch {
    return { attempts: {} };
  }
}

async function writeState(state: SyncState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function toPaymentReceipt(row: unknown): PaymentReceipt | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.txHash !== "string" || !record.txHash) return null;
  return {
    resourceId: typeof record.resourceId === "string" ? record.resourceId : null,
    title: typeof record.title === "string" ? record.title : "",
    amount: String(record.amount ?? "0"),
    asset: typeof record.asset === "string" ? record.asset : "",
    network: typeof record.network === "string" ? record.network : "",
    txHash: record.txHash,
    payer: typeof record.payer === "string" ? record.payer : "",
    paidAt: typeof record.paidAt === "string" ? record.paidAt : new Date().toISOString(),
  };
}

async function fetchReceiptsPage(cursor: string | null): Promise<ReceiptsPage> {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`${getApiBaseUrl()}/receipts?${params.toString()}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (res.status >= 500) {
    throw new Error(`Receipt sync failed with status ${res.status}.`);
  }
  if (!res.ok) {
    throw new Error("Unable to sync receipts.");
  }
  const body = (await res.json()) as { receipts?: unknown; nextCursor?: unknown };
  const receipts = (Array.isArray(body.receipts) ? body.receipts : [])
    .map(toPaymentReceipt)
    .filter((row): row is PaymentReceipt => row !== null);
  const nextCursor =
    typeof body.nextCursor === "string" && body.nextCursor.length > 0 ? body.nextCursor : null;
  return { receipts, nextCursor };
}

export interface ReceiptSyncResult {
  /** Server-only receipts that were added to the local store. */
  added: number;
  /** Local-only receipts still waiting to appear on the server. */
  pendingLocal: number;
}

/**
 * One reconciliation run: pages through `GET /receipts` with a cursor, then
 * matches both sides by tx hash. A failed run (e.g. a 5xx mid-sync) leaves the
 * local store untouched so a re-run converges without duplicates.
 */
export async function syncReceipts(): Promise<ReceiptSyncResult> {
  const serverByHash = new Map<string, PaymentReceipt>();
  let cursor: string | null = null;
  do {
    const page = await fetchReceiptsPage(cursor);
    for (const receipt of page.receipts) serverByHash.set(receipt.txHash, receipt);
    cursor = page.nextCursor;
  } while (cursor);

  const local = await listReceipts();
  const localHashes = new Set(local.map((receipt) => receipt.txHash));

  let added = 0;
  for (const receipt of serverByHash.values()) {
    if (localHashes.has(receipt.txHash)) continue;
    try {
      await saveReceipt(receipt);
      added += 1;
    } catch {
      // A malformed server row is skipped; everything else still converges.
    }
  }

  const state = await readState();
  let pendingLocal = 0;
  for (const receipt of local) {
    if (serverByHash.has(receipt.txHash)) {
      delete state.attempts[receipt.txHash];
      continue;
    }
    pendingLocal += 1;
    const attempts = (state.attempts[receipt.txHash] ?? 0) + 1;
    if (attempts <= MAX_LOCAL_ONLY_ATTEMPTS) {
      state.attempts[receipt.txHash] = attempts;
    }
  }
  await writeState(state);

  return { added, pendingLocal };
}

let scheduled: ReturnType<typeof setTimeout> | null = null;
let lastRunAt = 0;

/**
 * Requests a sync run in the background. Runs are coalesced and limited to one
 * per `MIN_SYNC_INTERVAL_MS`, so foreground events and successful payments can
 * call this freely without hammering the server.
 */
export function requestReceiptSync(): void {
  if (scheduled) return;
  const wait = Math.max(0, lastRunAt + MIN_SYNC_INTERVAL_MS - Date.now());
  scheduled = setTimeout(() => {
    scheduled = null;
    lastRunAt = Date.now();
    syncReceipts().catch((err) => logError("receiptSync.sync", err));
  }, wait);
}
