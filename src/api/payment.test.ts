import { Buffer } from "buffer";

import {
  encodePaymentSignature,
  parsePaymentRequired,
  prepareResourceAccess,
  priceToAtomicUnits,
  signPaymentTransaction,
  submitSignedPayment,
  type PaymentChallenge,
} from "./payment";

// jest.setup.js stubs the SDK; this suite needs the real one, with only the
// network-facing pieces (Soroban RPC and contract assembly) mocked.
const mockGetLatestLedger = jest.fn();
const mockBuild = jest.fn();
jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    rpc: { ...actual.rpc, Server: jest.fn(() => ({ getLatestLedger: mockGetLatestLedger })) },
    contract: { ...actual.contract, AssembledTransaction: { build: (...args: unknown[]) => mockBuild(...args) } },
  };
});

const { Keypair, StrKey } = jest.requireActual("@stellar/stellar-sdk");

const PAY_TO: string = Keypair.random().publicKey();
const ASSET: string = StrKey.encodeContract(Buffer.alloc(32, 7));
const URL = "https://api.example.com/resources/abc";
const RESOURCE = { url: URL, description: "A resource", mimeType: "text/plain" };

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    scheme: "exact",
    network: "stellar:testnet",
    asset: ASSET,
    amount: "10000000",
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { areFeesSponsored: true },
    ...overrides,
  };
}

function paymentRequiredHeader(body: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({ x402Version: 2, resource: RESOURCE, accepts: [requirement()], ...body }),
    "utf8"
  ).toString("base64");
}

function mockResponse(status: number, body: string, headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("priceToAtomicUnits", () => {
  it("converts a displayed USDC price to 7-decimal base units", () => {
    expect(priceToAtomicUnits("1")).toBe(BigInt("10000000"));
    expect(priceToAtomicUnits("1.5")).toBe(BigInt("15000000"));
    expect(priceToAtomicUnits("0.1234567")).toBe(BigInt("1234567"));
  });

  it("rejects malformed prices", () => {
    expect(() => priceToAtomicUnits("1,50")).toThrow("The displayed price is invalid.");
  });
});

describe("parsePaymentRequired", () => {
  it("picks the exact option on the app's network and keeps it byte-for-byte", () => {
    const challenge = parsePaymentRequired(paymentRequiredHeader(), "1.00");

    expect(challenge).toEqual({ x402Version: 2, accepted: requirement(), resource: RESOURCE });
  });

  it("accepts an amount equal to the displayed price", () => {
    expect(() => parsePaymentRequired(paymentRequiredHeader(), "1")).not.toThrow();
  });

  it.each([
    ["no header", null, "402 received without a PAYMENT-REQUIRED header."],
    ["an unreadable header", "%%%", "402 received but the payment challenge couldn't be read."],
    ["x402 v1", paymentRequiredHeader({ x402Version: 1 }), "Unsupported x402 version 1."],
    ["no options", paymentRequiredHeader({ accepts: [] }), "offered no payment options"],
    [
      "an unsupported scheme",
      paymentRequiredHeader({ accepts: [requirement({ scheme: "upto" })] }),
      "This resource uses an unsupported payment scheme.",
    ],
    [
      "another network",
      paymentRequiredHeader({ accepts: [requirement({ network: "stellar:pubnet" })] }),
      "This resource requires stellar:pubnet, but the app is on stellar:testnet.",
    ],
    [
      "a non-contract asset",
      paymentRequiredHeader({ accepts: [requirement({ asset: "USDC" })] }),
      "the payment requirements were incomplete",
    ],
    [
      "unsponsored fees",
      paymentRequiredHeader({ accepts: [requirement({ extra: {} })] }),
      "fee sponsorship",
    ],
    [
      "a price above the displayed one",
      paymentRequiredHeader({ accepts: [requirement({ amount: "10000001" })] }),
      "The requested payment is higher than the displayed price.",
    ],
  ])("rejects %s", (_label, header, message) => {
    expect(() => parsePaymentRequired(header, "1.00")).toThrow(message);
  });
});

describe("encodePaymentSignature", () => {
  it("matches the @x402/core PaymentPayload shape", () => {
    const challenge = parsePaymentRequired(paymentRequiredHeader(), "1.00");
    const decoded = JSON.parse(
      Buffer.from(encodePaymentSignature(challenge, "signed-tx-xdr"), "base64").toString("utf8")
    );

    expect(decoded).toEqual({
      x402Version: 2,
      payload: { transaction: "signed-tx-xdr" },
      resource: RESOURCE,
      accepted: requirement(),
    });
  });
});

describe("prepareResourceAccess", () => {
  it("returns the content directly when the server answers 200", async () => {
    fetchMock.mockResolvedValue(mockResponse(200, "free content", { "content-type": "text/plain" }));

    await expect(prepareResourceAccess(URL, "1.00")).resolves.toEqual({
      type: "ready",
      result: { type: "text", content: "free content" },
    });
  });

  it("returns the challenge from the PAYMENT-REQUIRED header on 402", async () => {
    fetchMock.mockResolvedValue(
      mockResponse(402, "{}", { "PAYMENT-REQUIRED": paymentRequiredHeader() })
    );

    const access = await prepareResourceAccess(URL, "1.00");
    expect(access).toEqual({
      type: "payment",
      challenge: { x402Version: 2, accepted: requirement(), resource: RESOURCE },
    });
  });

  it("surfaces other errors", async () => {
    fetchMock.mockResolvedValue(mockResponse(500, JSON.stringify({ error: "Storage offline" })));
    await expect(prepareResourceAccess(URL, "1.00")).rejects.toThrow("Storage offline");
  });
});

describe("submitSignedPayment", () => {
  const challenge: PaymentChallenge = { x402Version: 2, accepted: requirement(), resource: RESOURCE };

  it("retries with the PAYMENT-SIGNATURE header and returns the content", async () => {
    fetchMock.mockResolvedValue(mockResponse(200, "paid content", { "content-type": "text/plain" }));

    await expect(submitSignedPayment(URL, challenge, "signed-tx")).resolves.toEqual({
      type: "text",
      content: "paid content",
    });
    expect(fetchMock).toHaveBeenCalledWith(URL, {
      headers: { "PAYMENT-SIGNATURE": encodePaymentSignature(challenge, "signed-tx") },
    });
  });

  it("explains a rejected payment", async () => {
    fetchMock.mockResolvedValue(mockResponse(402, ""));
    await expect(submitSignedPayment(URL, challenge, "signed-tx")).rejects.toThrow(
      "The payment was not accepted."
    );
  });
});

describe("signPaymentTransaction", () => {
  const challenge: PaymentChallenge = { x402Version: 2, accepted: requirement(), resource: RESOURCE };
  const payer = Keypair.random();

  function assembled(missingSigners: string[][], simulation: object = { result: {} }) {
    const needs = jest.fn();
    missingSigners.forEach((value) => needs.mockReturnValueOnce(value));
    return {
      simulation,
      needsNonInvokerSigningBy: needs,
      signAuthEntries: jest.fn(),
      simulate: jest.fn(),
      built: { toXDR: () => "signed-tx-xdr" },
    };
  }

  beforeEach(() => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 1000 });
  });

  it("simulates the USDC transfer, signs only the payer's auth entry and returns the XDR", async () => {
    const tx = assembled([[payer.publicKey()], []]);
    mockBuild.mockResolvedValue(tx);

    await expect(signPaymentTransaction(challenge, payer.secret())).resolves.toBe("signed-tx-xdr");

    expect(mockBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: ASSET,
        method: "transfer",
        networkPassphrase: "Test SDF Network ; September 2015",
        rpcUrl: "https://soroban-testnet.stellar.org",
      })
    );
    expect(tx.signAuthEntries).toHaveBeenCalledWith(
      expect.objectContaining({ publicKey: payer.publicKey(), expiration: 1012 })
    );
    expect(tx.simulate).toHaveBeenCalledTimes(1);
  });

  it("stops when the simulation fails", async () => {
    mockBuild.mockResolvedValue(assembled([], { error: "insufficient balance" }));

    await expect(signPaymentTransaction(challenge, payer.secret())).rejects.toThrow(
      "The payment simulation failed: insufficient balance"
    );
  });

  it("refuses a transfer that needs another account's signature", async () => {
    mockBuild.mockResolvedValue(assembled([[payer.publicKey(), PAY_TO]]));

    await expect(signPaymentTransaction(challenge, payer.secret())).rejects.toThrow(
      "This payment needs a signature from a different account."
    );
  });
});
