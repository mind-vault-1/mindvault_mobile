import { fetchVerification, formatConfidence } from "./verification";
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
      `${getApiBaseUrl()}/resources/res%201/verification`
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
});

describe("formatConfidence", () => {
  it("accepts a 0-1 fraction or a 0-100 percentage", () => {
    expect(formatConfidence(0.874)).toBe("87%");
    expect(formatConfidence(1)).toBe("100%");
    expect(formatConfidence(92)).toBe("92%");
  });
});
