import { collectDiagnostics, formatDiagnostics } from "./diagnostics";
import { getApiBaseUrl } from "../api/resources";
import { getApiKey } from "./secureStorage";
import { clearErrorLog, logError } from "../utils/errorLogger";

jest.mock("./secureStorage", () => ({ getApiKey: jest.fn() }));

const mockGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>;

beforeEach(() => {
  jest.clearAllMocks();
  clearErrorLog();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("collectDiagnostics", () => {
  it("reports app, platform and API details, and whether a key is stored", async () => {
    mockGetApiKey.mockResolvedValue("publisher-key");

    const report = await collectDiagnostics();

    expect(report).toMatchObject({
      platform: expect.any(String),
      osVersion: expect.any(String),
      deviceModel: expect.any(String),
      environment: __DEV__ ? "development" : "production",
      apiBaseUrl: getApiBaseUrl(),
      hasApiKey: true,
    });
    expect(JSON.stringify(report)).not.toContain("publisher-key");
  });

  it("reports no key when none is stored or SecureStore fails", async () => {
    mockGetApiKey.mockResolvedValueOnce(null);
    expect((await collectDiagnostics()).hasApiKey).toBe(false);

    mockGetApiKey.mockRejectedValueOnce(new Error("keychain locked"));
    expect((await collectDiagnostics()).hasApiKey).toBe(false);
  });
});

describe("formatDiagnostics", () => {
  it("includes recent errors with secrets redacted", async () => {
    mockGetApiKey.mockResolvedValue(null);
    const secretSeed = `S${"A".repeat(55)}`;
    logError("publisher.save", new Error(`Request failed for apiKey=sk_live_topsecret seed ${secretSeed}`));

    const text = formatDiagnostics(await collectDiagnostics());

    expect(text).toContain("=== Recent errors (redacted) ===");
    expect(text).toContain("publisher.save");
    expect(text).not.toContain("sk_live_topsecret");
    expect(text).not.toContain(secretSeed);
  });

  it("says None when there are no recent errors", async () => {
    mockGetApiKey.mockResolvedValue(null);
    expect(formatDiagnostics(await collectDiagnostics())).toMatch(/Recent errors \(redacted\) ===\nNone$/);
  });
});
