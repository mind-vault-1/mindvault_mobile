import { fetchBuyerPayments } from "./payments";

jest.mock("./resources", () => ({ getApiBaseUrl: () => "https://api.example.test" }));

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

it("fetches the encoded buyer address with page parameters and normalizes records", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      payments: [{
        id: "p1",
        resourceId: "resource-1",
        resourceTitle: "Book",
        amount: "12500000",
        asset: "USDC",
        network: "testnet",
        txHash: "tx-1",
        payer: "Gbuyer",
        paidAt: "2026-10-20T12:00:00.000Z",
      }],
      total: 21,
      nextOffset: 20,
    }),
  });
  const page = await fetchBuyerPayments("G/ buyer", { limit: 20, offset: 0 });
  expect(mockFetch).toHaveBeenCalledWith(
    "https://api.example.test/buyers/G%2F%20buyer/payments?limit=20&offset=0"
  );
  expect(page.payments[0].txHash).toBe("tx-1");
  expect(page.payments[0].resourceTitle).toBe("Book");
  expect(page.nextOffset).toBe(20);
});

it("accepts an array response and returns no next page for a short page", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [{
      txHash: "tx-1",
      amount: "10",
      network: "testnet",
      paidAt: "2026-10-20T12:00:00.000Z",
    }],
  });
  const page = await fetchBuyerPayments("Gbuyer", { limit: 20, offset: 0 });
  expect(page.payments).toHaveLength(1);
  expect(page.nextOffset).toBeNull();
});

it("rejects failed requests and invalid addresses", async () => {
  await expect(fetchBuyerPayments(" ")).rejects.toThrow("A buyer wallet address is required.");
  mockFetch.mockResolvedValue({ ok: false, status: 503 });
  await expect(fetchBuyerPayments("Gbuyer")).rejects.toThrow("Unable to load on-chain purchase history.");
});

it("ignores malformed records and clamps page options", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [
      { txHash: "good", amount: "1", network: "testnet", paidAt: "2026-10-20T12:00:00Z" },
      { txHash: "", amount: "x", network: "testnet", paidAt: "bad" },
    ] }),
  });
  const page = await fetchBuyerPayments("Gbuyer", { limit: 1000, offset: -1 });
  expect(mockFetch).toHaveBeenCalledWith("https://api.example.test/buyers/Gbuyer/payments?limit=100&offset=0");
  expect(page.payments).toHaveLength(1);
});


it("uses full array pages for pagination and respects an explicit end marker", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [{
      txHash: "tx-1",
      amount: "10",
      network: "testnet",
      paidAt: "2026-10-20T12:00:00.000Z",
    }],
  });
  await expect(fetchBuyerPayments("Gbuyer", { limit: 1, offset: 0 })).resolves.toMatchObject({
    nextOffset: 1,
  });

  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      payments: [{
        txHash: "tx-1",
        amount: "10",
        network: "testnet",
        paidAt: "2026-10-20T12:00:00.000Z",
      }],
      nextOffset: null,
    }),
  });
  await expect(fetchBuyerPayments("Gbuyer", { limit: 1, offset: 0 })).resolves.toMatchObject({
    nextOffset: null,
  });
});
