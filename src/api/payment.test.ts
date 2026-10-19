import {
  buildUnsignedPaymentTransaction,
  parsePaymentChallenge,
  prepareResourceAccess,
  submitSignedPayment,
  type PaymentChallenge,
} from "./payment";

const PAYER = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const PAY_TO = "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU4APMDLQNBW5QV3W3KO";
const ASSET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const URL = "https://api.example.com/resources/abc/content";

jest.mock("@stellar/stellar-sdk", () => {
  const VALID_PUBLIC_KEY = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
  const builder: any = {};
  builder.addOperation = jest.fn(() => builder);
  builder.setTimeout = jest.fn(() => builder);
  builder.build = jest.fn(() => ({ toXDR: () => "unsigned-xdr" }));
  return {
    Account: jest.fn(),
    Address: { fromString: jest.fn(() => ({ toScVal: () => "address" })) },
    Contract: jest.fn(() => ({ call: jest.fn(() => "transfer-operation") })),
    TransactionBuilder: jest.fn(() => builder),
    nativeToScVal: jest.fn(() => "amount"),
    StrKey: { isValidEd25519PublicKey: (key: string) => key === VALID_PUBLIC_KEY },
  };
});

function challengeBody(requirementOverrides: Record<string, unknown> = {}) {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "stellar:testnet",
        maxAmountRequired: "10000000",
        payTo: PAY_TO,
        asset: ASSET,
        maxTimeoutSeconds: 60,
        ...requirementOverrides,
      },
    ],
  };
}

function mockResponse(status: number, body: unknown, contentType = "application/json") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    text: async () => text,
    json: async () => body,
  };
}

function mockFetchQueue(...responses: unknown[]) {
  const fetchMock = jest.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  global.fetch = fetchMock as unknown as typeof global.fetch;
  return fetchMock;
}

describe("parsePaymentChallenge", () => {
  it("accepts a testnet exact challenge at the displayed price", () => {
    expect(parsePaymentChallenge(JSON.stringify(challengeBody()), "1.00")).toEqual({
      x402Version: 1,
      accepted: expect.objectContaining({
        scheme: "exact",
        network: "stellar:testnet",
        maxAmountRequired: "10000000",
        payTo: PAY_TO,
        asset: ASSET,
      }),
    });
  });

  it("accepts a challenge priced below what is displayed", () => {
    const challenge = parsePaymentChallenge(
      JSON.stringify(challengeBody({ maxAmountRequired: "5000000" })),
      "1.00"
    );
    expect(challenge.accepted.maxAmountRequired).toBe("5000000");
  });

  it("rejects a body that is not JSON", () => {
    expect(() => parsePaymentChallenge("<html>402</html>", "1.00")).toThrow(
      "402 received but the x402 challenge body was invalid."
    );
  });

  it("rejects an unsupported x402 version", () => {
    expect(() =>
      parsePaymentChallenge(JSON.stringify({ ...challengeBody(), x402Version: 3 }), "1.00")
    ).toThrow("402 received but the x402 challenge version is unsupported.");
  });

  it("rejects a challenge without any payment options", () => {
    expect(() =>
      parsePaymentChallenge(JSON.stringify({ x402Version: 1, accepts: [] }), "1.00")
    ).toThrow("402 received but the x402 challenge did not include any payment options.");
  });

  it("rejects an unsupported payment scheme", () => {
    expect(() =>
      parsePaymentChallenge(JSON.stringify(challengeBody({ scheme: "upto" })), "1.00")
    ).toThrow("This resource uses an unsupported payment scheme.");
  });

  it("rejects a challenge on a network the app is not on", () => {
    expect(() =>
      parsePaymentChallenge(JSON.stringify(challengeBody({ network: "stellar:pubnet" })), "1.00")
    ).toThrow("This resource requires stellar:pubnet, but the app is on stellar:testnet.");
  });

  it("rejects incomplete payment requirements", () => {
    expect(() =>
      parsePaymentChallenge(JSON.stringify(challengeBody({ payTo: "" })), "1.00")
    ).toThrow("402 received but the x402 payment requirements were incomplete.");
  });

  it("rejects a non-numeric amount", () => {
    expect(() =>
      parsePaymentChallenge(JSON.stringify(challengeBody({ maxAmountRequired: "1.5" })), "1.00")
    ).toThrow("402 received but the x402 payment requirements were incomplete.");
  });

  it("rejects a payment above the displayed price", () => {
    expect(() =>
      parsePaymentChallenge(JSON.stringify(challengeBody({ maxAmountRequired: "20000000" })), "1.00")
    ).toThrow("The requested payment is higher than the displayed price.");
  });

  it("rejects an unparseable displayed price", () => {
    expect(() => parsePaymentChallenge(JSON.stringify(challengeBody()), "free")).toThrow(
      "The displayed price is invalid."
    );
  });
});

describe("buildUnsignedPaymentTransaction", () => {
  const accepted = parsePaymentChallenge(JSON.stringify(challengeBody()), "1.00");

  it("builds the transfer transaction for a valid payer", () => {
    expect(buildUnsignedPaymentTransaction(accepted, PAYER)).toBe("unsigned-xdr");
  });

  it("rejects a payer that is not a Stellar public key", () => {
    expect(() => buildUnsignedPaymentTransaction(accepted, "not-a-key")).toThrow(
      "Enter a valid Stellar public key."
    );
  });
});

describe("prepareResourceAccess", () => {
  it("returns the resource when the server responds 200 without payment", async () => {
    mockFetchQueue(mockResponse(200, "<h1>free</h1>", "text/html"));

    await expect(prepareResourceAccess(URL, "1.00", PAYER)).resolves.toEqual({
      type: "ready",
      result: { type: "text", content: "<h1>free</h1>" },
    });
  });

  it("hands off binary content to the external browser", async () => {
    mockFetchQueue(mockResponse(200, "", "application/pdf"));

    await expect(prepareResourceAccess(URL, "1.00", PAYER)).resolves.toEqual({
      type: "ready",
      result: { type: "external", url: URL },
    });
  });

  it("returns a signable challenge when the server responds 402", async () => {
    mockFetchQueue(mockResponse(402, challengeBody(), "application/json"));

    const access = await prepareResourceAccess(URL, "1.00", PAYER);
    expect(access).toEqual({
      type: "payment",
      challenge: expect.objectContaining({
        x402Version: 1,
        networkPassphrase: "Test SDF Network ; September 2015",
        unsignedXdr: "unsigned-xdr",
      }),
    });
  });

  it("propagates a rejection from the challenge parser", async () => {
    mockFetchQueue(mockResponse(402, challengeBody({ scheme: "upto" }), "application/json"));

    await expect(prepareResourceAccess(URL, "1.00", PAYER)).rejects.toThrow(
      "This resource uses an unsupported payment scheme."
    );
  });

  it("surfaces other HTTP failures", async () => {
    mockFetchQueue(mockResponse(500, { error: "Upstream unavailable" }));

    await expect(prepareResourceAccess(URL, "1.00", PAYER)).rejects.toThrow(
      "Upstream unavailable"
    );
  });
});

describe("submitSignedPayment", () => {
  const challenge: PaymentChallenge = {
    ...parsePaymentChallenge(JSON.stringify(challengeBody()), "1.00"),
    networkPassphrase: "Test SDF Network ; September 2015",
    unsignedXdr: "unsigned-xdr",
  };

  it("retries with a base64 X-PAYMENT header carrying the signed transaction", async () => {
    const fetchMock = mockFetchQueue(mockResponse(200, "unlocked", "text/plain"));

    await expect(submitSignedPayment(URL, challenge, "signed-xdr")).resolves.toEqual({
      type: "text",
      content: "unlocked",
    });

    const [, init] = fetchMock.mock.calls[0];
    const header = JSON.parse(Buffer.from(init.headers["X-PAYMENT"], "base64").toString("utf8"));
    expect(header.payload.transaction).toBe("signed-xdr");
    expect(header).toMatchObject({
      x402Version: 1,
      scheme: "exact",
      network: "stellar:testnet",
    });
  });

  it("surfaces a payment the server rejects", async () => {
    mockFetchQueue(mockResponse(402, { error: "Payment verification failed" }));

    await expect(submitSignedPayment(URL, challenge, "signed-xdr")).rejects.toThrow(
      "Payment verification failed"
    );
  });
});
