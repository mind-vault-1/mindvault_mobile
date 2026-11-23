import { Account, Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  buildAddUsdcTrustlineXdr,
  checkUsdcForPayment,
  fetchWalletBalances,
  fundWithFriendbot,
  getHorizonUrl,
  hasUsdcTrustline,
  submitSignedTransaction,
} from "./horizon";
import { NETWORKS } from "../config/network";

const mockLoadAccount = jest.fn();
const mockSubmitTransaction = jest.fn();

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn(() => ({
        loadAccount: mockLoadAccount,
        submitTransaction: mockSubmitTransaction,
      })),
    },
  };
});

const config = NETWORKS.testnet;
const publicKey = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ hash: "friendbot-hash" }),
  }) as unknown as typeof global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("wallet balances", () => {
  it("uses the configured network's Horizon URL", () => {
    expect(getHorizonUrl()).toBe(config.horizonUrl);
  });

  it("requires a non-empty address", async () => {
    await expect(fetchWalletBalances("")).rejects.toThrow("A wallet address is required.");
    await expect(fetchWalletBalances("   ")).rejects.toThrow("A wallet address is required.");
  });

  it("returns XLM and USDC balances", async () => {
    mockLoadAccount.mockResolvedValueOnce({
      balances: [
        { asset_type: "native", balance: "100.0000000" },
        { asset_type: "credit_alphanum4", asset_code: "USDC", balance: "25.5000000" },
      ],
    });

    await expect(fetchWalletBalances(publicKey)).resolves.toEqual({
      xlm: "100.0000000",
      usdc: "25.5000000",
    });
  });

  it("returns a null USDC balance when there is no trustline", async () => {
    mockLoadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: "native", balance: "50.0000000" }],
    });

    await expect(fetchWalletBalances(publicKey)).resolves.toEqual({
      xlm: "50.0000000",
      usdc: null,
    });
  });

  it("treats an unfunded account as zero balances", async () => {
    mockLoadAccount.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { status: 404 }));

    await expect(fetchWalletBalances(publicKey)).resolves.toEqual({ xlm: "0", usdc: null });
  });

  it("handles a nested 404 status", async () => {
    mockLoadAccount.mockRejectedValueOnce(
      Object.assign(new Error("Not Found"), { response: { status: 404 } })
    );

    await expect(fetchWalletBalances(publicKey)).resolves.toEqual({ xlm: "0", usdc: null });
  });

  it("maps network errors to a user-safe message", async () => {
    mockLoadAccount.mockRejectedValueOnce(new TypeError("Network request failed"));

    await expect(fetchWalletBalances(publicKey)).rejects.toThrow(
      "Network error. Please check your connection."
    );
  });

  it("propagates other Horizon errors", async () => {
    mockLoadAccount.mockRejectedValueOnce(
      Object.assign(new Error("Server error"), { status: 500 })
    );

    await expect(fetchWalletBalances(publicKey)).rejects.toThrow("Server error");
  });
});

it("funds a testnet account through Friendbot", async () => {
  await expect(fundWithFriendbot(publicKey, config)).resolves.toEqual({
    funded: true,
    hash: "friendbot-hash",
  });
  expect(global.fetch).toHaveBeenCalledWith(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
  );
});

it("refuses to use Friendbot on mainnet", async () => {
  await expect(fundWithFriendbot(publicKey, NETWORKS.mainnet)).rejects.toThrow(
    "Friendbot is available on test networks only."
  );
  expect(global.fetch).not.toHaveBeenCalled();
});

it("detects a USDC trustline", async () => {
  mockLoadAccount.mockResolvedValueOnce({
    balances: [
      { asset_type: "native", balance: "10" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: config.usdcIssuer },
    ],
  });
  await expect(hasUsdcTrustline(publicKey, config)).resolves.toBe(true);

  mockLoadAccount.mockResolvedValueOnce({
    balances: [{ asset_type: "native", balance: "10" }],
  });
  await expect(hasUsdcTrustline(publicKey, config)).resolves.toBe(false);
});

it("allows a payment when the USDC trustline and balance cover the price", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      balances: [{ asset_code: "USDC", asset_issuer: config.usdcIssuer, balance: "2.5000000" }],
    }),
  }) as unknown as typeof global.fetch;

  await expect(checkUsdcForPayment("1.25", { publicKey })).resolves.toEqual({ status: "ok" });
});

it("reports a missing trustline before payment", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ balances: [{ asset_type: "native", balance: "10" }] }),
  }) as unknown as typeof global.fetch;

  await expect(checkUsdcForPayment("1.25", { publicKey })).resolves.toEqual({
    status: "missing-trustline",
    message: "Your wallet needs a USDC trustline before you can pay.",
  });
});

it("reports insufficient USDC before payment", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      balances: [{ asset_code: "USDC", asset_issuer: config.usdcIssuer, balance: "0.5000000" }],
    }),
  }) as unknown as typeof global.fetch;

  await expect(checkUsdcForPayment("1.25", { publicKey })).resolves.toEqual({
    status: "insufficient-balance",
    message: "Your wallet does not have enough USDC to cover this payment.",
  });
});

it("warns and continues when Horizon is unavailable", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof global.fetch;

  await expect(checkUsdcForPayment("1.25", { publicKey })).resolves.toEqual({
    status: "unavailable",
    warning: "Couldn't check your USDC balance right now.",
  });
});

it("does not call Horizon without a wallet address", async () => {
  await expect(checkUsdcForPayment("1.25")).resolves.toEqual({
    status: "unavailable",
    warning: "Connect a wallet to check your USDC balance before paying.",
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("builds and submits a signed USDC trustline transaction", async () => {
  mockLoadAccount.mockResolvedValue(new Account(publicKey, "1"));
  mockSubmitTransaction.mockResolvedValue({ hash: "tx-hash" });

  const xdr = await buildAddUsdcTrustlineXdr(publicKey, config);
  expect(typeof xdr).toBe("string");

  const signed = new TransactionBuilder(new Account(publicKey, "2"), {
    fee: "100",
    networkPassphrase: config.passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", config.usdcIssuer as string) }))
    .setTimeout(300)
    .build();
  signed.sign(Keypair.random());

  await expect(submitSignedTransaction(signed.toXDR(), config)).resolves.toBe("tx-hash");
  expect(mockSubmitTransaction).toHaveBeenCalledWith(expect.objectContaining({ sign: expect.any(Function) }));
});
