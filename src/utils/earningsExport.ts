import type { Payout, PayoutKind } from "../api/payouts";
import { escapeCsvCell, type ReceiptExportFormat, type ReceiptExportRange } from "./receiptExport";

export const EARNINGS_EXPORT_SCHEMA_VERSION = 1;

/** Kinds left out of totals and exports unless the publisher opts in. */
export type OptionalKind = Exclude<PayoutKind, "payout">;
export type IncludedKinds = Partial<Record<OptionalKind, boolean>>;

const CSV_COLUMNS = ["paidAt", "kind", "amount", "asset", "network", "txHash"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCALE = BigInt(10_000_000);
const ZERO = BigInt(0);

/** Same periods as receipt exports, so both read the same way. */
export function filterPayoutsByRange(payouts: Payout[], range: ReceiptExportRange, now: Date): Payout[] {
  if (range === "all") return payouts;
  return payouts.filter((payout) => {
    const paidAt = new Date(payout.paidAt);
    if (range === "thisYear") return paidAt.getFullYear() === now.getFullYear();
    const age = now.getTime() - paidAt.getTime();
    return age >= 0 && age <= 30 * DAY_MS;
  });
}

export function filterPayoutsByKind(payouts: Payout[], include: IncludedKinds = {}): Payout[] {
  return payouts.filter((payout) => payout.kind === "payout" || include[payout.kind] === true);
}

/**
 * Sum per asset. Amounts are added in 7-decimal fixed point (Stellar's
 * precision) using BigInt, so many small payouts don't drift.
 */
export function totalsByAsset(payouts: Payout[]): Record<string, string> {
  const sums = new Map<string, bigint>();
  for (const payout of payouts) {
    const [whole, fraction = ""] = payout.amount.split(".");
    const atomic = BigInt(whole) * SCALE + BigInt(fraction.padEnd(7, "0").slice(0, 7));
    sums.set(payout.asset, (sums.get(payout.asset) ?? ZERO) + atomic);
  }
  const out: Record<string, string> = {};
  sums.forEach((atomic, asset) => {
    const whole = atomic / SCALE;
    const fraction = (atomic % SCALE).toString().padStart(7, "0").replace(/0+$/, "");
    out[asset] = fraction ? `${whole}.${fraction}` : whole.toString();
  });
  return out;
}

export function buildEarningsCsv(payouts: Payout[]): string {
  const rows = payouts.map((payout) => CSV_COLUMNS.map((column) => escapeCsvCell(payout[column])).join(","));
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function buildEarningsJson(payouts: Payout[], range: ReceiptExportRange, now: Date): string {
  return JSON.stringify(
    {
      schemaVersion: EARNINGS_EXPORT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      range,
      totals: totalsByAsset(payouts),
      payouts: payouts.map(({ id, paidAt, kind, amount, asset, network, txHash }) => ({
        id,
        paidAt,
        kind,
        amount,
        asset,
        network,
        txHash,
      })),
    },
    null,
    2
  );
}

/** Payouts in the chosen period and kinds, as CSV or JSON text ready to share. */
export function exportEarnings(
  payouts: Payout[],
  format: ReceiptExportFormat,
  range: ReceiptExportRange,
  include: IncludedKinds,
  now: Date
): string {
  const selected = filterPayoutsByKind(filterPayoutsByRange(payouts, range, now), include);
  return format === "json" ? buildEarningsJson(selected, range, now) : buildEarningsCsv(selected);
}
