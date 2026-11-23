import { fetchAgentStatus, fetchVerification, formatConfidence } from "./verification";
import { getApiBaseUrl } from "./resources";

describe("fetchVerification", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requests the verification endpoint with the URL-encoded resource ID", async () => {
    const mockDetails = {
      resourceId: "res 1",
      title: "Doc",
      status: "verified",
      listed: true,
      publishedAt: "2026-10-18T13:00:00Z",
      verification: { isOriginal: true, confidence: 0.9, flags: [], checkedAt: "2026-10-18T14:00:00Z" },
    };

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockDetails,
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const result = await fetchVerification("res 1");

    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/resources/res%201/verification`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toEqual(mockDetails);
  });

  it("extracts and surfaces error message on non-ok responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Verification result not found" }),
      text: async () => JSON.stringify({ error: "Verification result not found" }),
      headers: { get: () => "application/json" },
    }) as unknown as typeof global.fetch;

    await expect(fetchVerification("non-existent")).rejects.toThrow(
      "Verification result not found"
    );
  });

  it("rejects a response that does not match the verification schema", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ resourceId: "r1" }),
    }) as unknown as typeof global.fetch;

    await expect(fetchVerification("r1")).rejects.toThrow("The server returned an unexpected response.");
  });
});

describe("formatConfidence", () => {
  it("accepts a 0-1 fraction or a 0-100 percentage", () => {
    expect(formatConfidence(0.874)).toBe("87%");
    expect(formatConfidence(1)).toBe("100%");
    expect(formatConfidence(92)).toBe("92%");
  });
});

describe("fetchAgentStatus", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requests the agent-status endpoint and parses the response", async () => {
    const mockStatus = {
      verificationsProcessed: 1240,
      approvalRate: 0.95,
      earnings: "150.00",
      status: "active",
    };

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockStatus,
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const result = await fetchAgentStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/verify/agent-status`,
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toEqual({
      verificationsProcessed: 1240,
      approvalRate: 0.95,
      earnings: "150.00",
      status: "active",
    });
  });

  it("accepts snake_case properties from server", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        verifications_processed: 500,
        approval_rate: 0.88,
        total_earnings: "42.50",
      }),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const result = await fetchAgentStatus();
    expect(result).toEqual({
      verificationsProcessed: 500,
      approvalRate: 0.88,
      earnings: "42.50",
    });
  });

  it("surfaces server error message on failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal agent failure" }),
      text: async () => JSON.stringify({ error: "Internal agent failure" }),
      headers: { get: () => "application/json" },
    }) as unknown as typeof global.fetch;

    await expect(fetchAgentStatus()).rejects.toThrow("Internal agent failure");
  });

  it("rejects invalid agent status schema", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "active" }),
    }) as unknown as typeof global.fetch;

    await expect(fetchAgentStatus()).rejects.toThrow("The server returned an unexpected response.");
  });
});
