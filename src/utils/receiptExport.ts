import type { PaymentReceipt } from "../services/receipts";

/** Bump when the JSON shape changes, so readers can tell exports apart. */
export const RECEIPT_EXPORT_SCHEMA_VERSION = 1;

export type ReceiptExportFormat = "json" | "csv";
export type ReceiptExportRange = "all" | "last30Days" | "thisYear";

export const RECEIPT_EXPORT_RANGES: { value: ReceiptExportRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "last30Days", label: "Last 30 days" },
  { value: "thisYear", label: "This year" },
];

const CSV_COLUMNS = [
  "paidAt",
  "title",
  "resourceId",
  "amount",
  "asset",
  "network",
  "txHash",
  "payer",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Copies only the public settlement fields, so nothing else can leak into an export. */
function toPublicReceipt(receipt: PaymentReceipt): PaymentReceipt {
  return {
    resourceId: receipt.resourceId,
    title: receipt.title,
    amount: receipt.amount,
    asset: receipt.asset,
    network: receipt.network,
    txHash: receipt.txHash,
    payer: receipt.payer,
    paidAt: receipt.paidAt,
  };
}

export function filterReceiptsByRange(
  receipts: PaymentReceipt[],
  range: ReceiptExportRange,
  now: Date
): PaymentReceipt[] {
  if (range === "all") return receipts;

  return receipts.filter((receipt) => {
    const paidAt = new Date(receipt.paidAt);
    if (range === "thisYear") return paidAt.getFullYear() === now.getFullYear();
    const age = now.getTime() - paidAt.getTime();
    return age >= 0 && age <= 30 * DAY_MS;
  });
}

/**
 * Escapes one CSV cell per RFC 4180, and neutralises leading `=`, `+`, `-`, `@`
 * (and tab/CR) so a spreadsheet app does not run the cell as a formula.
 */
export function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildReceiptsJson(receipts: PaymentReceipt[], now: Date): string {
  return JSON.stringify(
    {
      schemaVersion: RECEIPT_EXPORT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      receipts: receipts.map(toPublicReceipt),
    },
    null,
    2
  );
}

export function buildReceiptsCsv(receipts: PaymentReceipt[]): string {
  const rows = receipts.map((receipt) => {
    const row = toPublicReceipt(receipt);
    return CSV_COLUMNS.map((column) => escapeCsvCell(row[column] ?? "")).join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

/** The text to share: receipts in the chosen range, as JSON or CSV. */
export function exportReceipts(
  receipts: PaymentReceipt[],
  format: ReceiptExportFormat,
  range: ReceiptExportRange,
  now: Date
): string {
  const selected = filterReceiptsByRange(receipts, range, now);
  return format === "json" ? buildReceiptsJson(selected, now) : buildReceiptsCsv(selected);
}
