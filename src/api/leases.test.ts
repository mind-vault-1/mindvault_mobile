import { quoteLease, buyLease, leaseTierLabel, type LeaseTier, type LeaseQuote } from "./leases";
import { getApiKey } from "../services/secureStorage";

jest.mock("../services/secureStorage", () => ({
  getApiKey: jest.fn(),
}));

const mockGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>;

describe("quoteLease", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requests the lease quote endpoint with the correct tier", async () => {
    const quote: LeaseQuote = {
      resourceId: "res-123",
      tier: 1,
      creator: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      price: "12500000",
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => quote,
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const result = await quoteLease("res-123", 1);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/resources/res-123/lease/quote?tier=1"),
      expect.objectContaining({ headers: { "Content-Type": "application/json" } })
    );
    expect(result).toEqual(quote);
  });

  it("surfaces server error messages", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Resource not found" }),
      text: async () => JSON.stringify({ error: "Resource not found" }),
      headers: { get: () => "application/json" },
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(quoteLease("missing", 0)).rejects.toThrow("Resource not found");
  });
});

describe("leaseTierLabel", () => {
  it("returns correct labels for each tier", () => {
    expect(leaseTierLabel(0)).toBe("Hour");
    expect(leaseTierLabel(1)).toBe("Day");
    expect(leaseTierLabel(2)).toBe("Week");
  });
});

describe("leaseTierSeconds", () => {
  it("returns correct durations", () => {
    expect(leaseTierSeconds(0)).toBe(3600);
    expect(leaseTierSeconds(1)).toBe(86400);
    expect(leaseTierSeconds(2)).toBe(604800);
  });
});