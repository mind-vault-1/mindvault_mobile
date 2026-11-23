import {
  fetchAnalytics,
  fetchMe,
  fetchPublicPublisher,
  maskApiKey,
  registerPublisher,
  revokeApiKey,
  rotateApiKey,
  type PublisherAnalytics,
  type RegisterPublisherResponse,
} from "./publishers";
import { getApiBaseUrl } from "./resources";
import { clearApiKey, getApiKey, storeApiKey } from "../services/secureStorage";

jest.mock("../services/secureStorage", () => ({
  getApiKey: jest.fn(),
  storeApiKey: jest.fn(),
  clearApiKey: jest.fn(),
}));

const mockGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>;
const mockStoreApiKey = storeApiKey as jest.MockedFunction<typeof storeApiKey>;
const mockClearApiKey = clearApiKey as jest.MockedFunction<typeof clearApiKey>;
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

describe("fetchPublicPublisher", () => {
  const listing = (id: string, walletAddress: string) => ({
    id,
    title: `Resource ${id}`,
    price: "1.00",
    resourceType: "file",
    walletAddress,
    verificationStatus: "verified",
    onchainStatus: "registered",
    listed: true,
    accessUrl: `https://example.com/resources/${id}`,
  });

  function mockRoutes(routes: Record<string, { status: number; body: unknown }>) {
    const fetchMock = jest.fn(async (url: string) => {
      const path = url.slice(getApiBaseUrl().length).split("?")[0];
      const { status, body } = routes[path];
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: { get: () => "application/json" },
      };
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;
    return fetchMock;
  }

  it("loads the profile and only the resources owned by that wallet", async () => {
    const fetchMock = mockRoutes({
      [`/publishers/wallet/${profile.walletAddress}`]: { status: 200, body: profile },
      "/resources": {
        status: 200,
        body: [listing("r1", profile.walletAddress), listing("r2", "GOTHERWALLET")],
      },
    });

    const result = await fetchPublicPublisher(profile.walletAddress);

    expect(result?.publisher).toEqual(profile);
    expect(result?.resources.map((resource) => resource.id)).toEqual(["r1"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${getApiBaseUrl()}/publishers/wallet/${profile.walletAddress}`,
      `${getApiBaseUrl()}/resources?owner=${profile.walletAddress}&limit=100`,
    ]);
  });

  it("resolves to null when no publisher owns the wallet", async () => {
    mockRoutes({
      [`/publishers/wallet/${profile.walletAddress}`]: {
        status: 404,
        body: { error: "No publisher found for this wallet" },
      },
      "/resources": { status: 200, body: [] },
    });

    await expect(fetchPublicPublisher(profile.walletAddress)).resolves.toBeNull();
  });

  it("rethrows other errors with the server message", async () => {
    mockRoutes({
      [`/publishers/wallet/${profile.walletAddress}`]: { status: 200, body: profile },
      "/resources": { status: 400, body: { error: "Invalid query params" } },
    });

    await expect(fetchPublicPublisher(profile.walletAddress)).rejects.toThrow(
      "Invalid query params"
    );
  });
});

describe("fetchMe", () => {
  it("requests /publishers/me on the configured API with the stored key", async () => {
    mockGetApiKey.mockResolvedValue("stored-key");
    const fetchMock = mockFetch(profile);

    await expect(fetchMe()).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/publishers/me`,
      expect.objectContaining({ method: "GET", headers: { "x-api-key": "stored-key" } })
    );
  });

  it("uses an explicit key instead of the stored one, for validating a new key", async () => {
    mockGetApiKey.mockResolvedValue("stored-key");
    const fetchMock = mockFetch(profile);

    await fetchMe("candidate-key");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { "x-api-key": "candidate-key" } });
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
    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/publishers/me/analytics`,
      expect.objectContaining({ method: "GET", headers: { "x-api-key": "stored-key" } })
    );
  });

  it("uses an explicit key without reading storage", async () => {
    const fetchMock = mockFetch(analytics);
    await fetchAnalytics("candidate-key");
    expect(mockGetApiKey).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { "x-api-key": "candidate-key" } });
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

describe("maskApiKey", () => {
  it("keeps only the first and last four characters", () => {
    expect(maskApiKey("sk_live_abcdef123456")).toBe("sk_l…3456");
  });

  it("fully masks short keys so no secret is shown", () => {
    expect(maskApiKey("abc123")).toBe("••••••");
  });

  it("trims whitespace before masking", () => {
    expect(maskApiKey("  sk_live_abcdef123456  ")).toBe("sk_l…3456");
  });
});

describe("rotateApiKey", () => {
  it("POSTs to the rotate endpoint with the stored key and stores the new key", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    const fetchMock = mockFetch({ apiKey: "new-key-abcdef" });

    await expect(rotateApiKey()).resolves.toBe("new-key-abcdef");

    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/publishers/me/api-key/rotate`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "old-key-123456",
          "X-Timestamp": expect.stringMatching(/^\d{10}$/),
          "X-Signature": expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      })
    );
    expect(mockStoreApiKey).toHaveBeenCalledWith("new-key-abcdef");
  });

  it("does not touch secure storage when the server rejects the rotation", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    mockFetch({ error: "Internal server error" }, 500);

    await expect(rotateApiKey()).rejects.toThrow("Internal server error");
    expect(mockStoreApiKey).not.toHaveBeenCalled();
  });

  it("leaves the old key in place when the stored key is already invalid", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    mockFetch({ error: "Invalid API key" }, 401);

    await expect(rotateApiKey()).rejects.toThrow("Unauthorized: Invalid API key");
    expect(mockStoreApiKey).not.toHaveBeenCalled();
  });

  it("does not overwrite the key when the response has no new key", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    mockFetch({ apiKey: "   " });

    await expect(rotateApiKey()).rejects.toThrow("Server did not return a new API key.");
    expect(mockStoreApiKey).not.toHaveBeenCalled();
  });

  it("does not overwrite the key when the response is not valid JSON", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error("Unexpected token"); },
    });

    await expect(rotateApiKey()).rejects.toThrow("Server did not return a new API key.");
    expect(mockStoreApiKey).not.toHaveBeenCalled();
  });

  it("keeps the central client's network error message", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));

    await expect(rotateApiKey()).rejects.toThrow("Network error. Please check your connection.");
    expect(mockStoreApiKey).not.toHaveBeenCalled();
  });

  it("fails without calling the API when no key is stored", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const fetchMock = mockFetch({ apiKey: "new-key" });

    await expect(rotateApiKey()).rejects.toThrow("No API key configured");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockStoreApiKey).not.toHaveBeenCalled();
  });

  it("redacts an echoed API key in server errors", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    mockFetch({ error: "Cannot rotate old-key-123456" }, 403);

    await expect(rotateApiKey()).rejects.toThrow("Cannot rotate [redacted]");
  });
});

describe("revokeApiKey", () => {
  it("DELETEs the key with the stored key and clears it locally", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    const fetchMock = mockFetch({}, 204);

    await expect(revokeApiKey()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/publishers/me/api-key`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "x-api-key": "old-key-123456",
          "X-Timestamp": expect.stringMatching(/^\d{10}$/),
          "X-Signature": expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      })
    );
    expect(mockClearApiKey).toHaveBeenCalledTimes(1);
  });

  it("keeps the key when the server fails to revoke it", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    mockFetch({ error: "Internal server error" }, 500);

    await expect(revokeApiKey()).rejects.toThrow("Internal server error");
    expect(mockClearApiKey).not.toHaveBeenCalled();
  });

  it("still signs the device out when the server says the key is already invalid", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    mockFetch({ error: "Invalid API key" }, 401);

    await expect(revokeApiKey()).resolves.toBeUndefined();
    expect(mockClearApiKey).toHaveBeenCalledTimes(1);
  });

  it("treats an unknown key as already revoked", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    mockFetch({ error: "Not found" }, 404);

    await expect(revokeApiKey()).resolves.toBeUndefined();
    expect(mockClearApiKey).toHaveBeenCalledTimes(1);
  });

  it("fails without calling the API when no key is stored", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const fetchMock = mockFetch({});

    await expect(revokeApiKey()).rejects.toThrow("No API key configured");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockClearApiKey).not.toHaveBeenCalled();
  });

  it("redacts an echoed API key in server errors", async () => {
    mockGetApiKey.mockResolvedValue("old-key-123456");
    mockFetch({ error: "Cannot revoke old-key-123456" }, 403);

    await expect(revokeApiKey()).rejects.toThrow("Cannot revoke [redacted]");
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

describe("fetchLeaderboard", () => {
  it("requests the leaderboard endpoint and returns the rows", async () => {
    const rows = [{ id: "p1", name: "Ada", walletAddress: "G1", joinedAt: "x", totalResources: 1, listedResources: 1, verifiedResources: 0, totalSales: 2, totalEarned: "1.0000" }];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => rows,
      text: async () => JSON.stringify(rows),
    }) as unknown as typeof fetch;
    const { fetchLeaderboard } = require("./publishers");
    await expect(fetchLeaderboard()).resolves.toEqual(rows);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${getApiBaseUrl()}/publishers/leaderboard`);
    global.fetch = originalFetch;
  });
});
