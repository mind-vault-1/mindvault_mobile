import AsyncStorage from "@react-native-async-storage/async-storage";

export const RECEIPTS_STORAGE_KEY = "@mindvault_receipts";
export const MAX_RECEIPTS = 200;
const STORE_VERSION = 1;

/** Public settlement data only. `amount` is in the asset's atomic units. */
export interface PaymentReceipt {
  resourceId: string | null;
  title: string;
  amount: string;
  asset: string;
  network: string;
  txHash: string;
  payer: string;
  paidAt: string;
}

function normalize(value: unknown): PaymentReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    (row.resourceId !== null && typeof row.resourceId !== "string") ||
    !["title", "amount", "asset", "network", "txHash", "payer", "paidAt"].every((key) => typeof row[key] === "string") ||
    !row.txHash || !/^\d+$/.test(row.amount as string) || Number.isNaN(Date.parse(row.paidAt as string))
  ) return null;

  // An explicit allowlist also drops unknown fields from old data and callers.
  return {
    resourceId: row.resourceId as string | null,
    title: row.title as string,
    amount: row.amount as string,
    asset: row.asset as string,
    network: row.network as string,
    txHash: row.txHash as string,
    payer: row.payer as string,
    paidAt: row.paidAt as string,
  };
}

function sortedAndCapped(values: unknown[]): PaymentReceipt[] {
  const rows = values.map(normalize).filter((row): row is PaymentReceipt => row !== null)
    .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt));
  return rows.filter((row, index) => rows.findIndex((other) => other.txHash === row.txHash) === index)
    .slice(0, MAX_RECEIPTS);
}

async function write(receipts: PaymentReceipt[]): Promise<void> {
  await AsyncStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify({ version: STORE_VERSION, receipts }));
}

async function read(): Promise<PaymentReceipt[]> {
  const raw = await AsyncStorage.getItem(RECEIPTS_STORAGE_KEY);
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* Recover corrupt local data as an empty store. */ }
  const envelope = parsed as { version?: number; receipts?: unknown[] } | null;
  if (envelope?.version !== undefined && envelope.version > STORE_VERSION) {
    throw new Error("The receipt store was created by a newer app version.");
  }
  // Version 0 was an array or an unversioned envelope. Version 1 adds metadata.
  const values = Array.isArray(parsed) ? parsed : Array.isArray(envelope?.receipts) ? envelope.receipts : [];
  const receipts = sortedAndCapped(values);
  if (envelope?.version !== STORE_VERSION) await write(receipts);
  return receipts;
}

// Serialize reads and writes, including clear, so simultaneous payments cannot
// overwrite each other's receipts. A failed operation never poisons the queue.
let pending: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}

const savedListeners = new Set<(receipt: PaymentReceipt) => void>();

/**
 * Notified after every successful `saveReceipt` — i.e. after every successful
 * payment — so background services can react without touching call sites.
 */
export function subscribeReceiptSaved(listener: (receipt: PaymentReceipt) => void): () => void {
  savedListeners.add(listener);
  return () => savedListeners.delete(listener);
}

export function saveReceipt(receipt: PaymentReceipt): Promise<void> {
  return enqueue(async () => {
    const clean = normalize(receipt);
    if (!clean) throw new Error("Invalid payment receipt.");
    const receipts = await read();
    await write(sortedAndCapped([clean, ...receipts.filter((row) => row.txHash !== clean.txHash)]));
    for (const listener of savedListeners) listener(clean);
  });
}

export function listReceipts(): Promise<PaymentReceipt[]> {
  return enqueue(read);
}

export async function getReceipt(txHash: string): Promise<PaymentReceipt | null> {
  return (await listReceipts()).find((receipt) => receipt.txHash === txHash) ?? null;
}

export function clearReceipts(): Promise<void> {
  return enqueue(() => write([]));
}
