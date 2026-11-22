import { getPublicKey } from "../services/wallet";
import { checkUsdcForPayment, usdcToStroops } from "./horizon";

jest.mock("../services/wallet", () => ({
  getPublicKey: jest.fn(),
}));

const mockedGetPublicKey = getPublicKey as jest.MockedFunction<typeof getPublicKey>;
const ADDRESS = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function account(balance: string | null): Response {
  return response(200, {
    balances:
      balance === null
        ? []
        : [
            {
              asset_type: "credit_alphanum4",
              asset_code: "USDC",
              asset_issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
              balance,
            },
          ],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetPublicKey.mockResolvedValue(ADDRESS);
});

describe("usdcToStroops", () => {
  it("converts decimal USDC to 7-decimal base units", () => {
    expect(usdcToStroops("1.25")).toBe(BigInt(12500000));
    expect(usdcToStroops("0.0000001")).toBe(BigInt(1));
  });

  it("rejects malformed amounts", () => {
    expect(usdcToStroops("1.12345678")).toBeNull();
    expect(usdcToStroops("abc")).toBeNull();
  });
});

describe("checkUsdcForPayment", () => {
  it("returns ok when the trustline covers the price", async () => {
    const fetchFn = jest.fn().mockResolvedValue(account("2.0000000"));

    await expect(checkUsdcForPayment("1.25", { fetchFn })).resolves.toEqual({ status: "ok" });
    expect(fetchFn).toHaveBeenCalledWith(
      `https://horizon-testnet.stellar.org/accounts/${ADDRESS}`,
      undefined
    );
  });

  it("reports a missing trustline with an actionable message", async () => {
    const fetchFn = jest.fn().mockResolvedValue(account(null));

    const result = await checkUsdcForPayment("1.25", { fetchFn });
    expect(result).toMatchObject({ status: "missing-trustline" });
    expect(String((result as { message?: string }).message)).toContain("Open Wallet");
  });

  it("treats an unfunded account as a missing trustline", async () => {
    const fetchFn = jest.fn().mockResolvedValue(response(404, { status: 404 }));

    await expect(checkUsdcForPayment("1.25", { fetchFn })).resolves.toMatchObject({
      status: "missing-trustline",
    });
  });

  it("reports an insufficient balance with both amounts", async () => {
    const fetchFn = jest.fn().mockResolvedValue(account("0.5000000"));

    const result = await checkUsdcForPayment("1.25", { fetchFn });
    expect(result).toMatchObject({
      status: "insufficient-balance",
      available: "0.5",
      required: "1.25",
    });
    expect(String((result as { message?: string }).message)).toContain("Open Wallet");
  });

  it("accepts a custom classic USDC issuer for self-hosted deployments", async () => {
    const customIssuer = "GCUSTOMISSUERTEST123456789012345678901234567890123456789012345";
    const fetchFn = jest.fn().mockResolvedValue(response(200, {
      balances: [{
        asset_code: "USDC",
        asset_issuer: customIssuer,
        balance: "2.0000000",
      }],
    }));

    await expect(
      checkUsdcForPayment("1.25", { address: ADDRESS, fetchFn, issuer: customIssuer })
    ).resolves.toEqual({ status: "ok" });
  });

  it("warns and continues when Horizon is unreachable", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error("Network request failed"));

    const result = await checkUsdcForPayment("1.25", { fetchFn });
    expect(result).toMatchObject({ status: "unavailable" });
    expect(String((result as { warning?: string }).warning)).toContain("Couldn't check");
  });

  it("passes the caller's abort signal and makes no call when already cancelled", async () => {
    const controller = new AbortController();
    const fetchFn = jest.fn().mockResolvedValue(account("2.0000000"));

    await checkUsdcForPayment("1.25", { fetchFn, signal: controller.signal });
    expect(fetchFn).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal });

    fetchFn.mockClear();
    controller.abort();
    await expect(
      checkUsdcForPayment("1.25", { fetchFn, signal: controller.signal })
    ).rejects.toThrow("USDC check cancelled");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
