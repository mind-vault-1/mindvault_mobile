import { checkHealth } from "./health";

jest.mock("./resources", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

it("pings GET /health on the configured API and reports up with latency", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200 });

  const result = await checkHealth();

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.example.com/health",
    expect.objectContaining({ signal: expect.anything() })
  );
  expect(result.status).toBe("up");
  expect(typeof result.latencyMs).toBe("number");
});

it("reports down when the server returns an error status", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });

  const result = await checkHealth("https://other.example.com");

  expect(fetchMock.mock.calls[0][0]).toBe("https://other.example.com/health");
  expect(result).toEqual(
    expect.objectContaining({ status: "down", error: "Server responded with 503." })
  );
});

it("reports down when the request fails", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));

  await expect(checkHealth()).resolves.toEqual({
    status: "down",
    latencyMs: null,
    error: "The server could not be reached.",
  });
});

it("reports down when the request times out", async () => {
  fetchMock.mockImplementation(
    (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      })
  );

  await expect(checkHealth(undefined, 10)).resolves.toEqual(
    expect.objectContaining({ status: "down", error: "The server did not respond in time." })
  );
});
