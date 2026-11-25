import type { Payout } from "../api/payouts";
import {
  buildEarningsCsv,
  exportEarnings,
  filterPayoutsByKind,
  filterPayoutsByRange,
  totalsByAsset,
} from "./earningsExport";

const now = new Date("2026-06-15T12:00:00.000Z");

function payout(overrides: Partial<Payout>): Payout {
  return {
    id: "p1",
    paidAt: "2026-06-10T00:00:00.000Z",
    amount: "1",
    asset: "USDC",
    txHash: "abc",
    network: "testnet",
    kind: "payout",
    ...overrides,
  };
}

const rows = [
  payout({ id: "recent", amount: "0.1" }),
  payout({ id: "recent2", amount: "0.2" }),
  payout({ id: "old", paidAt: "2025-01-01T00:00:00.000Z", amount: "5" }),
  payout({ id: "tip", kind: "tip", amount: "3" }),
  payout({ id: "lease", kind: "lease", amount: "4" }),
  payout({ id: "xlm", asset: "XLM", amount: "2.5" }),
];

describe("period filtering", () => {
  it("matches the receipt export periods", () => {
    expect(filterPayoutsByRange(rows, "all", now)).toHaveLength(6);
    expect(filterPayoutsByRange(rows, "last30Days", now).map((p) => p.id)).not.toContain("old");
    expect(filterPayoutsByRange(rows, "thisYear", now).map((p) => p.id)).not.toContain("old");
  });
});

describe("totals", () => {
  it("excludes tips, leases and purchases unless opted in", () => {
    expect(filterPayoutsByKind(rows).map((p) => p.id)).toEqual(["recent", "recent2", "old", "xlm"]);
    expect(filterPayoutsByKind(rows, { tip: true }).map((p) => p.id)).toContain("tip");
    expect(filterPayoutsByKind(rows, { tip: true }).map((p) => p.id)).not.toContain("lease");
  });

  it("sums per asset without floating-point drift", () => {
    expect(totalsByAsset(filterPayoutsByKind(rows))).toEqual({ USDC: "5.3", XLM: "2.5" });
    expect(totalsByAsset([payout({ amount: "0.0000001" }), payout({ amount: "0.0000002" })])).toEqual({
      USDC: "0.0000003",
    });
  });
});

describe("export format", () => {
  it("writes CSV with a header and escaped cells", () => {
    const csv = buildEarningsCsv([payout({ txHash: "=evil" })]);
    expect(csv).toBe(
      "paidAt,kind,amount,asset,network,txHash\r\n2026-06-10T00:00:00.000Z,payout,1,USDC,testnet,'=evil\r\n",
    );
  });

  it("writes JSON with schema, period, totals and filtered payouts", () => {
    const json = JSON.parse(exportEarnings(rows, "json", "last30Days", {}, now));
    expect(json).toMatchObject({ schemaVersion: 1, range: "last30Days", totals: { USDC: "0.3", XLM: "2.5" } });
    expect(json.payouts.map((p: Payout) => p.id)).toEqual(["recent", "recent2", "xlm"]);
  });

  it("applies the same filters to CSV", () => {
    const csv = exportEarnings(rows, "csv", "all", { lease: true }, now);
    expect(csv.trim().split("\r\n")).toHaveLength(6);
  });
});
