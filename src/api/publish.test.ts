import { Buffer } from "buffer";

import { notifyPublishResult, requestPublishNotificationsPermission } from "../services/notifications";
import { getApiKey } from "../services/secureStorage";
import { hashMultipartBody, signPublisherRequest } from "../utils/requestSignature";
import { PAYMENT_SIGNATURE_HEADER } from "./payment";
import {
  MAX_UPLOAD_BYTES,
  atomicToDisplay,
  buildPublishIdempotencyKey,
  fetchPublishStatus,
  pollPublishStatus,
  publishFile,
  publishLink,
  validatePublishAt,
  validatePublishFile,
  validatePublishLink,
  type PickedFile,
  type PublishLinkInput,
} from "./publish";

// jest.setup.js stubs the SDK; the challenge checks need the real StrKey.
jest.mock("@stellar/stellar-sdk", () => jest.requireActual("@stellar/stellar-sdk"));

jest.mock("../services/secureStorage", () => ({
  getApiKey: jest.fn(),
  storeApiKey: jest.fn(),
  clearApiKey: jest.fn(),
}));

jest.mock("../services/notifications", () => ({
  notifyPublishResult: jest.fn().mockResolvedValue(true),
  requestPublishNotificationsPermission: jest.fn().mockResolvedValue(true),
}));

// The multipart upload runs through the native file-system uploader.
jest.mock("expo-file-system", () => ({
  EncodingType: { Base64: "base64" },
  FileSystemUploadType: { MULTIPART: 1 },
  readAsStringAsync: jest.fn(),
  createUploadTask: jest.fn(),
}));

const FileSystem = jest.requireMock("expo-file-system") as {
  readAsStringAsync: jest.Mock;
  createUploadTask: jest.Mock;
  FileSystemUploadType: { MULTIPART: number };
};

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

const fileBytes = Buffer.from("hello mindvault", "utf8");
const pickedFile: PickedFile = {
  uri: "file:///cache/handbook.pdf",
  name: "handbook.pdf",
  size: fileBytes.length,
  mimeType: "application/pdf",
};
const fileInput = { title: "  Stellar handbook ", price: "1.5", description: "A guide", file: pickedFile };

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

/** Stubs the native uploader so `publishFile` sees the given HTTP result. */
function mockUpload(result: { status: number; body: string; headers?: Record<string, string> } | null) {
  const uploadAsync = jest.fn().mockResolvedValue(result);
  const cancelAsync = jest.fn().mockResolvedValue(undefined);
  FileSystem.createUploadTask.mockReturnValue({ uploadAsync, cancelAsync });
  return { uploadAsync, cancelAsync };
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  mockedGetApiKey.mockResolvedValue("publisher-key");
  (notifyPublishResult as jest.Mock).mockClear();
  (requestPublishNotificationsPermission as jest.Mock).mockClear();
  FileSystem.readAsStringAsync.mockReset();
  FileSystem.readAsStringAsync.mockResolvedValue(fileBytes.toString("base64"));
  FileSystem.createUploadTask.mockReset();
  mockUpload({ status: 201, body: JSON.stringify(createdResource) });
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
    expect(init.headers["Idempotency-Key"]).toBe(buildPublishIdempotencyKey(validInput));
    expect(JSON.parse(init.body)).toEqual({
      resourceType: "link",
      title: "Stellar handbook",
      url: "https://example.com/handbook",
      price: "1.5",
      description: "A guide",
    });
  });

  it("reuses provided idempotency key when provided", async () => {
    fetchMock.mockResolvedValue(mockResponse(201, createdResource));

    await publishLink(validInput, undefined, "custom-idem-key");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBe("custom-idem-key");
  });

  it("surfaces clear still processing message on 409 conflict", async () => {
    fetchMock.mockResolvedValue(mockResponse(409, { error: "Conflict" }));

    await expect(publishLink(validInput)).rejects.toThrow(
      "Your publish request is still processing. Please wait a moment before retrying."
    );
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

describe("validatePublishFile", () => {
  const form = { title: "Handbook", price: "1.5", description: "", file: pickedFile };

  it("accepts a valid file", () => {
    expect(validatePublishFile(form)).toEqual({});
  });

  it("rejects empty and oversized files", () => {
    expect(validatePublishFile({ ...form, file: { ...pickedFile, size: 0 } }).file).toBe(
      "That file is empty."
    );
    expect(
      validatePublishFile({ ...form, file: { ...pickedFile, size: MAX_UPLOAD_BYTES + 1 } }).file
    ).toBe("File must be 25 MB or smaller.");
  });

  it("rejects MIME types the server refuses", () => {
    expect(
      validatePublishFile({ ...form, file: { ...pickedFile, mimeType: "application/x-msdownload" } }).file
    ).toBe("Unsupported file type. Choose a PDF, an image or a text file.");
  });

  it("shares the title and price rules", () => {
    expect(validatePublishFile({ ...form, title: " " }).title).toBe("Title is required.");
    expect(validatePublishFile({ ...form, price: "0" }).price).toBe("Price must be greater than zero.");
  });
});

describe("publishFile", () => {
  it("uploads the file as a signed multipart body", async () => {
    const result = await publishFile(fileInput, { idempotencyKey: "publish-key" });

    expect(result).toEqual({ type: "published", resource: createdResource });
    const [url, fileUri, options] = FileSystem.createUploadTask.mock.calls[0];
    expect(url).toMatch(/\/resources$/);
    expect(fileUri).toBe(pickedFile.uri);
    expect(options.uploadType).toBe(FileSystem.FileSystemUploadType.MULTIPART);
    expect(options.fieldName).toBe("file");
    expect(options.mimeType).toBe("application/pdf");
    expect(options.parameters).toEqual({
      resourceType: "file",
      title: "Stellar handbook",
      price: "1.5",
      description: "A guide",
    });
    expect(options.headers["x-api-key"]).toBe("publisher-key");
    expect(options.headers["Idempotency-Key"]).toBe("publish-key");
    expect(options.headers["X-Signature"]).toBe(
      signPublisherRequest({
        secret: "publisher-key",
        method: "POST",
        path: "/resources",
        timestamp: options.headers["X-Timestamp"],
        bodyHash: hashMultipartBody(options.parameters, { bytes: fileBytes }),
        idempotencyKey: "publish-key",
      })
    );
  });

  it("reports upload progress fractions", async () => {
    const uploadAsync = jest.fn().mockResolvedValue({
      status: 201,
      body: JSON.stringify(createdResource),
      headers: {},
    });
    FileSystem.createUploadTask.mockImplementation((_url, _uri, _options, callback) => {
      callback({ totalBytesSent: 25, totalBytesExpectedToSend: 100 });
      callback({ totalBytesSent: 100, totalBytesExpectedToSend: 100 });
      return { uploadAsync, cancelAsync: jest.fn() };
    });

    const onProgress = jest.fn();
    await publishFile(fileInput, { onProgress });

    expect(onProgress.mock.calls.map(([value]) => value)).toEqual([0.25, 1]);
  });

  it("cancels an in-flight upload when the signal aborts", async () => {
    const controller = new AbortController();
    let finish: (value: null) => void = () => undefined;
    const uploadAsync = jest.fn(() => new Promise<null>((resolve) => { finish = resolve; }));
    const cancelAsync = jest.fn(async () => finish(null));
    FileSystem.createUploadTask.mockReturnValue({ uploadAsync, cancelAsync });

    const promise = publishFile(fileInput, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await expect(promise).rejects.toThrow("Upload cancelled.");
    expect(uploadAsync).toHaveBeenCalled();
    expect(cancelAsync).toHaveBeenCalled();
  });

  it("returns the verification fee challenge on 402", async () => {
    mockUpload({ status: 402, body: "", headers: { "PAYMENT-REQUIRED": paymentRequiredHeader() } });

    const result = await publishFile(fileInput);

    expect(result.type).toBe("payment");
    if (result.type !== "payment") return;
    expect(result.fee).toBe("0.5");
    expect(result.challenge.accepted.amount).toBe("5000000");
  });

  it("retries with the payment signature after the fee is signed", async () => {
    mockUpload({ status: 402, body: "", headers: { "PAYMENT-REQUIRED": paymentRequiredHeader() } });
    const first = await publishFile(fileInput);
    if (first.type !== "payment") throw new Error("expected a payment challenge");

    mockUpload({ status: 201, body: JSON.stringify(createdResource) });
    const result = await publishFile(fileInput, {
      payment: { challenge: first.challenge, transaction: "signed-xdr" },
    });

    expect(result).toEqual({ type: "published", resource: createdResource });
    const options = FileSystem.createUploadTask.mock.calls[1][2];
    const signature = JSON.parse(
      Buffer.from(options.headers[PAYMENT_SIGNATURE_HEADER], "base64").toString("utf8")
    );
    expect(signature.payload).toEqual({ transaction: "signed-xdr" });
  });

  it("surfaces clear still processing message on 409 conflict", async () => {
    mockUpload({ status: 409, body: JSON.stringify({ error: "Conflict" }) });

    await expect(publishFile(fileInput)).rejects.toThrow(
      "Your publish request is still processing. Please wait a moment before retrying."
    );
  });

  it("surfaces forbidden and server errors", async () => {
    mockUpload({ status: 403, body: "" });
    await expect(publishFile(fileInput)).rejects.toThrow("Forbidden: Access denied");

    mockUpload({ status: 400, body: JSON.stringify({ error: "Upload limit exceeded" }) });
    await expect(publishFile(fileInput)).rejects.toThrow("Upload limit exceeded");
  });

  it("fails when no API key is stored", async () => {
    mockedGetApiKey.mockResolvedValue(null);
    await expect(publishFile(fileInput)).rejects.toThrow("No API key configured");
    expect(FileSystem.createUploadTask).not.toHaveBeenCalled();
  });
});

describe("fetchPublishStatus and pollPublishStatus", () => {
  it("fetches resource publish status across states", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, { ...createdResource, verificationStatus: "verified", onchainStatus: "registered" })
    );
    const status = await fetchPublishStatus("res-1");
    expect(status.status).toBe("on-chain");
  });

  it("polls with backoff until on-chain terminal state", async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(mockResponse(200, { ...createdResource, verificationStatus: "pending" }))
      .mockResolvedValueOnce(mockResponse(200, { ...createdResource, verificationStatus: "verified", onchainStatus: "registered" }));

    const statuses: string[] = [];
    let cancelled = false;

    const pollPromise = pollPublishStatus(
      "res-1",
      (s) => statuses.push(s.status),
      () => cancelled,
      100
    );

    await jest.advanceTimersByTimeAsync(150);
    await pollPromise;

    expect(statuses).toEqual(["verifying", "on-chain"]);
    expect(requestPublishNotificationsPermission).toHaveBeenCalled();
    expect(notifyPublishResult).toHaveBeenCalledWith("res-1", "on-chain");
    jest.useRealTimers();
  });

  it("notifies once when verification is rejected", async () => {
    fetchMock.mockResolvedValue(
      mockResponse(200, { ...createdResource, verificationStatus: "rejected" })
    );

    await pollPublishStatus("res-2", () => undefined, () => false, 100);

    expect(notifyPublishResult).toHaveBeenCalledWith("res-2", "rejected");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling when cancelled", async () => {
    fetchMock.mockResolvedValue(
      mockResponse(200, { ...createdResource, verificationStatus: "pending" })
    );
    let cancelled = false;
    const statuses: string[] = [];

    await pollPublishStatus(
      "res-1",
      (s) => {
        statuses.push(s.status);
        cancelled = true;
      },
      () => cancelled,
      100
    );

    expect(statuses).toEqual(["verifying"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("validatePublishAt", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("accepts no schedule and a time comfortably in the future", () => {
    expect(validatePublishAt(undefined, now)).toBeNull();
    expect(validatePublishAt("2026-06-02T12:00:00.000Z", now)).toBeNull();
  });

  it("rejects unparseable, past, too-soon and too-far times", () => {
    expect(validatePublishAt("soon", now)).toBe("Enter a valid date and time.");
    expect(validatePublishAt("2026-05-01T00:00:00.000Z", now)).toBe("Schedule at least 5 minutes from now.");
    expect(validatePublishAt("2026-06-01T12:01:00.000Z", now)).toBe("Schedule at least 5 minutes from now.");
    expect(validatePublishAt("2028-01-01T00:00:00.000Z", now)).toBe("Schedule within the next year.");
  });

  it("keeps idempotency keys unchanged for immediate publishes", () => {
    const input = { title: "t", url: "https://e.com", price: "1", description: "" };
    expect(buildPublishIdempotencyKey(input)).toBe("publish|t|https://e.com|1|");
    expect(buildPublishIdempotencyKey({ ...input, publishAt: "2026-06-02T12:00:00.000Z" })).not.toBe(
      buildPublishIdempotencyKey(input),
    );
  });
});
