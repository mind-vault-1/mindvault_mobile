import { publisherFetch } from "./resources";

/**
 * Payout history for the signed-in publisher (`GET /publishers/me/payouts`).
 * `kind` says where the money came from: resource sales are plain payouts;
 * tips, leases and purchases are reported separately so totals can leave them out.
 */
export type PayoutKind = "payout" | "tip" | "lease" | "purchase";
export const PAYOUT_KINDS: readonly PayoutKind[] = ["payout", "tip", "lease", "purchase"];

export interface Payout {
  id: string;
  paidAt: string;
  /** Display units, e.g. "12.5". */
  amount: string;
  asset: string;
  txHash: string;
  network: string;
  kind: PayoutKind;
}

function toPayout(value: unknown): Payout | null {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return null;
  const { id, paidAt, amount, asset, txHash, network, kind } = row;
  if (
    typeof id !== "string" ||
    typeof paidAt !== "string" ||
    Number.isNaN(Date.parse(paidAt)) ||
    typeof amount !== "string" ||
    !/^\d+(\.\d+)?$/.test(amount) ||
    typeof asset !== "string" ||
    typeof txHash !== "string" ||
    !txHash
  ) {
    return null;
  }
  return {
    id,
    paidAt,
    amount,
    asset,
    txHash,
    network: typeof network === "string" ? network : "",
    kind: PAYOUT_KINDS.includes(kind as PayoutKind) ? (kind as PayoutKind) : "payout",
  };
}

/** Newest first; malformed rows are dropped rather than failing the whole list. */
export async function fetchPayouts(): Promise<Payout[]> {
  const data = await publisherFetch<unknown>("/publishers/me/payouts", { method: "GET" }, "Failed to load payouts");
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map(toPayout)
    .filter((row): row is Payout => row !== null)
    .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt));
}
