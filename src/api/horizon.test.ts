import { Horizon } from "@stellar/stellar-sdk";

import { fetchWalletBalances, getHorizonUrl } from "./horizon";

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn(),
    },
  };
});

// Keep a reference to the mocked constructor so tests can configure per-call.
const MockServer = Horizon.Server as jest.MockedClass<typeof Horizon.Server>;

function makeLoadAccount(result: () => Promise<unknown>) {
  MockServer.mockImplementation(
    () => ({ loadAccount: jest.fn(result) } as unknown as Horizon.Server)
  );
}

const TEST_ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

describe("getHorizonUrl", () => {
  it("returns the testnet URL for the default network", () => {
    expect(getHorizonUrl()).toBe("https://horizon-testnet.stellar.org");
  });
});

describe("fetchWalletBalances", () => {
  beforeEach(() => {
    MockServer.mockReset();
  });

  it("requires a non-empty address", async () => {
    await expect(fetchWalletBalances("")).rejects.toThrow("A wallet address is required.");
    await expect(fetchWalletBalances("   ")).rejects.toThrow("A wallet address is required.");
  });

  it("returns XLM and USDC balances when both are present", async () => {
    makeLoadAccount(async () => ({
      balances: [
        { asset_type: "native", balance: "100.0000000" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          balance: "25.5000000",
        },
      ],
    }));

    const result = await fetchWalletBalances(TEST_ADDRESS);

    expect(result).toEqual({ xlm: "100.0000000", usdc: "25.5000000" });
  });

  it("returns usdc: null when there is no USDC trustline", async () => {
    makeLoadAccount(async () => ({
      balances: [
        { asset_type: "native", balance: "50.0000000" },
      ],
    }));

    const result = await fetchWalletBalances(TEST_ADDRESS);

    expect(result).toEqual({ xlm: "50.0000000", usdc: null });
  });

  it("returns xlm: '0' and usdc: null for an unfunded account (404)", async () => {
    makeLoadAccount(async () => {
      // Horizon SDK sets a `status` property on its error objects.
      const err = Object.assign(new Error("Not Found"), { status: 404 });
      throw err;
    });

    const result = await fetchWalletBalances(TEST_ADDRESS);

    expect(result).toEqual({ xlm: "0", usdc: null });
  });

  it("also handles 404 nested in error.response.status", async () => {
    makeLoadAccount(async () => {
      const err = Object.assign(new Error("Not Found"), { response: { status: 404 } });
      throw err;
    });

    const result = await fetchWalletBalances(TEST_ADDRESS);

    expect(result).toEqual({ xlm: "0", usdc: null });
  });

  it("throws a user-safe message on network failure", async () => {
    makeLoadAccount(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(fetchWalletBalances(TEST_ADDRESS)).rejects.toThrow(
      "Network error. Please check your connection."
    );
  });

  it("throws a user-safe message on another network error variant", async () => {
    makeLoadAccount(async () => {
      throw new TypeError("Network request failed");
    });

    await expect(fetchWalletBalances(TEST_ADDRESS)).rejects.toThrow(
      "Network error. Please check your connection."
    );
  });

  it("propagates a non-404 Horizon error message", async () => {
    makeLoadAccount(async () => {
      const err = Object.assign(new Error("Server error"), { status: 500 });
      throw err;
    });

    await expect(fetchWalletBalances(TEST_ADDRESS)).rejects.toThrow("Server error");
  });

  it("returns xlm from the native balance entry", async () => {
    makeLoadAccount(async () => ({
      balances: [
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: "GCQPYGH4K57XBDENKKX55KDTWOTK5WDWRQOH2LHEDX3EKVIQRLMESGBG",
          balance: "10.0000000",
        },
        { asset_type: "native", balance: "200.0000000" },
      ],
    }));

    const result = await fetchWalletBalances(TEST_ADDRESS);

    expect(result.xlm).toBe("200.0000000");
    expect(result.usdc).toBe("10.0000000");
  });
});
