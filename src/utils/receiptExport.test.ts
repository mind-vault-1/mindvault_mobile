import type { PaymentReceipt } from "../services/receipts";
import {
  buildReceiptsCsv,
  buildReceiptsJson,
  escapeCsvCell,
  exportReceipts,
  filterReceiptsByRange,
  RECEIPT_EXPORT_SCHEMA_VERSION,
} from "./receiptExport";

const NOW = new Date("2026-10-19T12:00:00.000Z");

function receipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    resourceId: "res-1",
    title: "Stellar handbook",
    amount: "12500000",
    asset: "CASSET",
    network: "stellar:testnet",
    txHash: "tx-1",
    payer: "GPAYER",
    paidAt: "2026-10-10T09:00:00.000Z",
    ...overrides,
  };
}

describe("escapeCsvCell", () => {
  it("leaves plain values untouched", () => {
    expect(escapeCsvCell("Handbook")).toBe("Handbook");
    expect(escapeCsvCell("")).toBe("");
  });

  it("quotes values containing commas, quotes or line breaks", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(escapeCsvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it.each(["=SUM(A1)", "+1+1", "-2", "@cmd"])("prefixes %s so spreadsheets read it as text", (value) => {
    expect(escapeCsvCell(value)).toBe(`'${value}`);
  });

  it("guards a leading tab or carriage return as well", () => {
    expect(escapeCsvCell("\t=1")).toBe("'\t=1");
  });
});

describe("filterReceiptsByRange", () => {
  const receipts = [
    receipt({ txHash: "recent", paidAt: "2026-10-01T00:00:00.000Z" }),
    receipt({ txHash: "older-this-year", paidAt: "2026-02-01T00:00:00.000Z" }),
    receipt({ txHash: "last-year", paidAt: "2025-06-15T10:00:00.000Z" }),
  ];

  it("keeps everything for all time", () => {
    expect(filterReceiptsByRange(receipts, "all", NOW)).toHaveLength(3);
  });

  it("keeps the last 30 days only", () => {
    const hashes = filterReceiptsByRange(receipts, "last30Days", NOW).map((r) => r.txHash);
    expect(hashes).toEqual(["recent"]);
  });

  it("keeps receipts from the current calendar year", () => {
    const hashes = filterReceiptsByRange(receipts, "thisYear", NOW).map((r) => r.txHash);
    expect(hashes).toEqual(["recent", "older-this-year"]);
  });
});

describe("buildReceiptsJson", () => {
  it("writes a schema version and only the public receipt fields", () => {
    const leaked = { ...receipt(), signedXdr: "SECRET-XDR" } as PaymentReceipt;
    const parsed = JSON.parse(buildReceiptsJson([leaked], NOW));

    expect(parsed).toEqual({
      schemaVersion: RECEIPT_EXPORT_SCHEMA_VERSION,
      exportedAt: NOW.toISOString(),
      receipts: [receipt()],
    });
    expect(JSON.stringify(parsed)).not.toContain("SECRET-XDR");
  });
});

describe("buildReceiptsCsv", () => {
  it("writes a header row and one RFC 4180 row per receipt", () => {
    const csv = buildReceiptsCsv([
      receipt({ title: 'Guide, "v2"', resourceId: null, txHash: "tx-9" }),
    ]);

    expect(csv).toBe(
      [
        "paidAt,title,resourceId,amount,asset,network,txHash,payer",
        '2026-10-10T09:00:00.000Z,"Guide, ""v2""",,12500000,CASSET,stellar:testnet,tx-9,GPAYER',
        "",
      ].join("\r\n")
    );
  });

  it("writes only the header when there are no receipts", () => {
    expect(buildReceiptsCsv([])).toBe(
      "paidAt,title,resourceId,amount,asset,network,txHash,payer\r\n"
    );
  });
});

describe("exportReceipts", () => {
  it("exports only the receipts in the chosen range", () => {
    const receipts = [
      receipt({ txHash: "recent", paidAt: "2026-10-01T00:00:00.000Z" }),
      receipt({ txHash: "old", paidAt: "2024-01-01T00:00:00.000Z" }),
    ];

    const parsed = JSON.parse(exportReceipts(receipts, "json", "last30Days", NOW));
    expect(parsed.receipts.map((r: PaymentReceipt) => r.txHash)).toEqual(["recent"]);

    const csv = exportReceipts(receipts, "csv", "all", NOW);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3);
  });
});

describe("JSON schema", () => {
  it("has exactly schemaVersion, exportedAt and receipts with the public fields", () => {
    const parsed = JSON.parse(buildReceiptsJson([receipt()], NOW));
    expect(Object.keys(parsed).sort()).toEqual(["exportedAt", "receipts", "schemaVersion"]);
    expect(parsed.schemaVersion).toBe(1);
    expect(Object.keys(parsed.receipts[0]).sort()).toEqual(
      ["amount", "asset", "network", "paidAt", "payer", "resourceId", "title", "txHash"]
    );
  });

  it("keeps unicode titles intact and writes an empty list when nothing matches", () => {
    const parsed = JSON.parse(buildReceiptsJson([receipt({ title: "Ünïcødé 📚 指南" })], NOW));
    expect(parsed.receipts[0].title).toBe("Ünïcødé 📚 指南");
    expect(JSON.parse(exportReceipts([receipt({ paidAt: "2020-01-01T00:00:00.000Z" })], "json", "last30Days", NOW)).receipts).toEqual([]);
  });
});

describe("CSV escaping", () => {
  it.each([
    ["a comma", "Guide, part 1", '"Guide, part 1"'],
    ["quotes", 'The "best" guide', '"The ""best"" guide"'],
    ["a newline", "Line 1\nLine 2", '"Line 1\nLine 2"'],
    ["a carriage return", "Line 1\rLine 2", '"Line 1\rLine 2"'],
    ["unicode", "Ünïcødé 📚 指南", "Ünïcødé 📚 指南"],
    ["unicode and a comma", "café, 東京", '"café, 東京"'],
  ])("handles %s", (_label, input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it("keeps a multi-line title inside one CSV record", () => {
    const csv = buildReceiptsCsv([receipt({ title: 'Multi\nline, "quoted"' })]);
    expect(csv).toContain('"Multi\nline, ""quoted"""');
    // Header, one record, and the trailing terminator.
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("guards formula-like titles even when they also need quoting", () => {
    expect(escapeCsvCell("=HYPERLINK(\"x\",\"y\")")).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });
});

describe("date filter boundaries", () => {
  it("includes exactly 30 days ago and excludes anything older or in the future", () => {
    const thirtyDays = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const older = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000 - 1).toISOString();
    const future = new Date(NOW.getTime() + 60 * 1000).toISOString();
    const hashes = filterReceiptsByRange([
      receipt({ txHash: "edge", paidAt: thirtyDays }),
      receipt({ txHash: "older", paidAt: older }),
      receipt({ txHash: "future", paidAt: future }),
    ], "last30Days", NOW).map((r) => r.txHash);
    expect(hashes).toEqual(["edge"]);
  });

  it("filters a merged local and on-chain list without changing its order", () => {
    const merged = [
      receipt({ txHash: "local", paidAt: "2026-10-15T00:00:00.000Z" }),
      receipt({ txHash: "chain", paidAt: "2026-10-12T00:00:00.000Z" }),
      receipt({ txHash: "old-chain", paidAt: "2025-06-01T12:00:00.000Z" }),
    ];
    const csv = exportReceipts(merged, "csv", "thisYear", NOW);
    const rows = csv.split("\r\n").filter(Boolean).slice(1).map((row) => row.split(",")[6]);
    expect(rows).toEqual(["local", "chain"]);
  });
});
