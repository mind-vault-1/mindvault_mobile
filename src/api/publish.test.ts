import { Buffer } from "buffer";

import { getApiKey } from "../services/secureStorage";
import { PAYMENT_SIGNATURE_HEADER } from "./payment";
import {
  atomicToDisplay,
  publishLink,
  validatePublishLink,
  type PublishLinkInput,
} from "./publish";

// jest.setup.js stubs the SDK; the challenge checks need the real StrKey.
jest.mock("@stellar/stellar-sdk", () => jest.requireActual("@stellar/stellar-sdk"));

jest.mock("../services/secureStorage", () => ({
  getApiKey: jest.fn(),
  storeApiKey: jest.fn(),
  clearApiKey: jest.fn(),
}));

const { Keypair, StrKey } = jest.requireActual("@stellar/stellar-sdk");
const PAY_TO: string = Keypair.random().publicKey();
const ASSET: string = StrKey.encodeContract(Buffer.alloc(32, 7));

const mockedGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>;

const validInput: PublishLinkInput = {
  title: "  Stellar handbook ",
  url: "https://example.com/handbook",
  price: "1.5",
  description: "A guide",
};

const createdResource = {
  id: "res-1",
  title: "Stellar handbook",
  price: "1.5",
  resourceType: "link",
  walletAddress: PAY_TO,
  verificationStatus: "pending",
  onchainStatus: "none",
  listed: true,
  accessUrl: "https://api.example.com/resources/res-1",
};

function paymentRequiredHeader(amount = "5000000") {
  return Buffer.from(
    JSON.stringify({
      x402Version: 2,
      resource: { url: "https://api.example.com/resources" },
      accepts: [
        {
          scheme: "exact",
          network: "stellar:testnet",
          asset: ASSET,
          amount,
          payTo: PAY_TO,
          maxTimeoutSeconds: 60,
          extra: { areFeesSponsored: true },
        },
      ],
    }),
    "utf8"
  ).toString("base64");
}

function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  mockedGetApiKey.mockResolvedValue("publisher-key");
});

describe("validatePublishLink", () => {
  it("accepts a valid form", () => {
    expect(validatePublishLink(validInput)).toEqual({});
  });

  it("requires title, URL and price", () => {
    expect(validatePublishLink({ title: " ", url: "", price: "", description: "" })).toEqual({
      title: "Title is required.",
      url: "URL is required.",
      price: "Price is required.",
    });
  });

  it("rejects malformed URLs and non-web schemes", () => {
    expect(validatePublishLink({ ...validInput, url: "example.com" }).url).toBe(
      "Enter a complete URL, including https://."
    );
    expect(validatePublishLink({ ...validInput, url: "ftp://example.com" }).url).toBe(
      "URL must start with http:// or https://."
    );
  });

  it("rejects invalid, zero and over-precise prices", () => {
    expect(validatePublishLink({ ...validInput, price: "abc" }).price).toBeDefined();
    expect(validatePublishLink({ ...validInput, price: "0" }).price).toBe(
      "Price must be greater than zero."
    );
    expect(validatePublishLink({ ...validInput, price: "1.12345678" }).price).toBeDefined();
  });

  it("limits title and description length", () => {
    const errors = validatePublishLink({
      ...validInput,
      title: "t".repeat(121),
      description: "d".repeat(2001),
    });
    expect(errors.title).toBeDefined();
    expect(errors.description).toBeDefined();
  });
});

it("converts USDC base units to a display amount", () => {
  expect(atomicToDisplay("15000000")).toBe("1.5");
  expect(atomicToDisplay("5000000")).toBe("0.5");
  expect(atomicToDisplay("10000000")).toBe("1");
});

describe("publishLink", () => {
  it("posts the link resource with the publisher API key", async () => {
    fetchMock.mockResolvedValue(mockResponse(201, createdResource));

    const result = await publishLink(validInput);

    expect(result).toEqual({ type: "published", resource: createdResource });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/resources$/);
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("publisher-key");
    expect(JSON.parse(init.body)).toEqual({
      resourceType: "link",
      title: "Stellar handbook",
      url: "https://example.com/handbook",
      price: "1.5",
      description: "A guide",
    });
  });

  it("returns the verification fee challenge on 402", async () => {
    fetchMock.mockResolvedValue(
      mockResponse(402, {}, { "PAYMENT-REQUIRED": paymentRequiredHeader("5000000") })
    );

    const result = await publishLink(validInput);

    expect(result.type).toBe("payment");
    if (result.type !== "payment") return;
    expect(result.fee).toBe("0.5");
    expect(result.challenge.accepted.amount).toBe("5000000");
  });

  it("retries with the PAYMENT-SIGNATURE header after the fee is signed", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(402, {}, { "PAYMENT-REQUIRED": paymentRequiredHeader() }))
      .mockResolvedValueOnce(mockResponse(201, createdResource));

    const first = await publishLink(validInput);
    if (first.type !== "payment") throw new Error("expected a payment challenge");
    const result = await publishLink(validInput, {
      challenge: first.challenge,
      transaction: "signed-xdr",
    });

    expect(result).toEqual({ type: "published", resource: createdResource });
    const headers = fetchMock.mock.calls[1][1].headers;
    const signature = JSON.parse(
      Buffer.from(headers[PAYMENT_SIGNATURE_HEADER], "base64").toString("utf8")
    );
    expect(signature.payload).toEqual({ transaction: "signed-xdr" });
    expect(headers["x-api-key"]).toBe("publisher-key");
  });

  it("reports a rejected payment instead of asking again", async () => {
    fetchMock.mockResolvedValue(
      mockResponse(402, {}, { "PAYMENT-REQUIRED": paymentRequiredHeader() })
    );
    const first = await publishLink(validInput);
    if (first.type !== "payment") throw new Error("expected a payment challenge");

    await expect(
      publishLink(validInput, { challenge: first.challenge, transaction: "signed-xdr" })
    ).rejects.toThrow("The verification fee was not accepted");
  });

  it("fails when no API key is stored", async () => {
    mockedGetApiKey.mockResolvedValue(null);
    await expect(publishLink(validInput)).rejects.toThrow("No API key configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces server validation errors", async () => {
    fetchMock.mockResolvedValue(mockResponse(400, { error: "URL is not reachable" }));
    await expect(publishLink(validInput)).rejects.toThrow("URL is not reachable");
  });
});
