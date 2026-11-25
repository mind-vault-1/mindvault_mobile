import { fetchPayouts } from "./payouts";
import { publisherFetch } from "./resources";

jest.mock("./resources", () => ({ publisherFetch: jest.fn() }));

describe("fetchPayouts", () => {
  it("drops malformed rows, defaults unknown kinds and sorts newest first", async () => {
    jest.mocked(publisherFetch).mockResolvedValue([
      { id: "a", paidAt: "2026-01-01T00:00:00Z", amount: "1.5", asset: "USDC", txHash: "h1", network: "testnet", kind: "tip" },
      { id: "b", paidAt: "2026-02-01T00:00:00Z", amount: "2", asset: "USDC", txHash: "h2", kind: "mystery" },
      { id: "bad", paidAt: "nope", amount: "1", asset: "USDC", txHash: "h3" },
      { id: "bad2", paidAt: "2026-01-01T00:00:00Z", amount: "-1", asset: "USDC", txHash: "h4" },
    ]);
    const payouts = await fetchPayouts();
    expect(publisherFetch).toHaveBeenCalledWith("/publishers/me/payouts", { method: "GET" }, "Failed to load payouts");
    expect(payouts.map((p) => [p.id, p.kind])).toEqual([
      ["b", "payout"],
      ["a", "tip"],
    ]);
  });

  it("returns an empty list for a non-array body", async () => {
    jest.mocked(publisherFetch).mockResolvedValue({});
    expect(await fetchPayouts()).toEqual([]);
  });
});
