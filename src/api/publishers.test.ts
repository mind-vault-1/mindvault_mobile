import { fetchAnalytics, fetchMe, registerPublisher, type PublisherAnalytics, type RegisterPublisherResponse } from "./publishers";
import { getApiBaseUrl } from "./resources";
import { getApiKey } from "../services/secureStorage";

jest.mock("../services/secureStorage", () => ({
  getApiKey: jest.fn(),
}));

const mockGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>;
const originalFetch = global.fetch;

const profile = {
  id: "pub-123",
  name: "Test Publisher",
  email: "test@example.com",
  walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
  createdAt: "2024-01-01T00:00:00Z",
};

function mockFetch(body: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => "application/json" },
  });
  global.fetch = fetchMock as unknown as typeof global.fetch;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("fetchMe", () => {
  it("requests /publishers/me on the configured API with the stored key", async () => {
    mockGetApiKey.mockResolvedValue("stored-key");
    const fetchMock = mockFetch(profile);

    await expect(fetchMe()).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith(`${getApiBaseUrl()}/publishers/me`, {
      headers: { "x-api-key": "stored-key" },
    });
  });

  it("uses an explicit key instead of the stored one, for validating a new key", async () => {
    mockGetApiKey.mockResolvedValue("stored-key");
    const fetchMock = mockFetch(profile);

    await fetchMe("candidate-key");
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { "x-api-key": "candidate-key" } });
  });

  it("throws without calling the API when no key is stored", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const fetchMock = mockFetch(profile);

    await expect(fetchMe()).rejects.toThrow("No API key configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps 401 to a friendly message", async () => {
    mockFetch({ error: "Invalid API key" }, 401);
    await expect(fetchMe("bad-key")).rejects.toThrow("Unauthorized: Invalid API key");
  });

  it("surfaces the server message for other errors, without echoing the key", async () => {
    mockFetch({ error: "Publisher disabled for key-123" }, 403);
    await expect(fetchMe("key-123")).rejects.toThrow("Publisher disabled for [redacted]");
  });
});

describe("fetchAnalytics", () => {
  const analytics: PublisherAnalytics = {
    summary: {
      totalEarned: "12.5000", currency: "USDC", totalSales: 7,
      totalResources: 2, listedResources: 1,
      verification: { verified: 1, rejected: 0, pending: 1 },
    },
    resources: [{
      id: "r1", title: "Handbook", price: "2.5000", totalSales: 5, totalEarned: "12.5000",
      recentPayments: [{ payerAddress: profile.walletAddress, amount: "2.5000", paidAt: "2026-10-01T10:00:00Z" }],
    }],
  };

  it("requests the server's analytics shape with the stored key", async () => {
    mockGetApiKey.mockResolvedValue("stored-key");
    const fetchMock = mockFetch(analytics);
    await expect(fetchAnalytics()).resolves.toEqual(analytics);
    expect(fetchMock).toHaveBeenCalledWith(`${getApiBaseUrl()}/publishers/me/analytics`, {
      headers: { "x-api-key": "stored-key" },
    });
  });

  it("uses an explicit key without reading storage", async () => {
    const fetchMock = mockFetch(analytics);
    await fetchAnalytics("candidate-key");
    expect(mockGetApiKey).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { "x-api-key": "candidate-key" } });
  });

  it("does not fetch without a key", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const fetchMock = mockFetch(analytics);
    await expect(fetchAnalytics()).rejects.toThrow("No API key configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the same unauthorized message as fetchMe", async () => {
    mockFetch({}, 401);
    await expect(fetchAnalytics("bad-key")).rejects.toThrow("Unauthorized: Invalid API key");
  });

  it("redacts echoed API keys in server errors", async () => {
    mockFetch({ error: "Analytics unavailable for secret-key" }, 403);
    await expect(fetchAnalytics("secret-key")).rejects.toThrow("Analytics unavailable for [redacted]");
  });

  it("uses an analytics-specific fallback", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "" });
    await expect(fetchAnalytics("key")).rejects.toThrow("Failed to load publisher analytics");
  });
});

describe("registerPublisher", () => {
  const registerResponse: RegisterPublisherResponse = {
    id: "pub-456",
    name: "New Publisher",
    email: "new@example.com",
    walletAddress: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    apiKey: "sk_live_abcdef123456",
    createdAt: "2026-10-20T12:00:00Z",
  };

  it("sends POST /publishers with name, email, and walletAddress", async () => {
    const fetchMock = mockFetch(registerResponse, 201);

    await expect(
      registerPublisher({
        name: "New Publisher",
        email: "new@example.com",
        walletAddress: registerResponse.walletAddress,
      })
    ).resolves.toEqual(registerResponse);

    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/publishers`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Publisher",
          email: "new@example.com",
          walletAddress: registerResponse.walletAddress,
        }),
      })
    );
  });

  it("returns the API key in the response (only shown once)", async () => {
    mockFetch(registerResponse, 201);

    const result = await registerPublisher({
      name: "Test",
      email: "test@example.com",
      walletAddress: profile.walletAddress,
    });

    expect(result.apiKey).toBe("sk_live_abcdef123456");
  });

  it("throws on 409 with server message for duplicate email", async () => {
    mockFetch({ error: "Email already registered" }, 409);

    await expect(
      registerPublisher({
        name: "Test",
        email: "existing@example.com",
        walletAddress: profile.walletAddress,
      })
    ).rejects.toThrow("Email already registered");
  });

  it("surfaces validation errors from the server", async () => {
    mockFetch({ error: "Invalid wallet address format" }, 400);

    await expect(
      registerPublisher({
        name: "Test",
        email: "test@example.com",
        walletAddress: "not-a-valid-address",
      })
    ).rejects.toThrow("Invalid wallet address format");
  });

  it("surfaces server errors for 5xx", async () => {
    mockFetch({ error: "Internal server error" }, 500);

    await expect(
      registerPublisher({
        name: "Test",
        email: "test@example.com",
        walletAddress: profile.walletAddress,
      })
    ).rejects.toThrow("Internal server error");
  });
});
