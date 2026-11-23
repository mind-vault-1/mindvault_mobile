import {
  EMPTY_BODY_HASH,
  buildCanonicalString,
  computeRequestSignature,
  getRequestPath,
  hashMultipartBody,
  hashRequestBody,
  isTimestampWithinSkew,
  signPublisherRequest,
  signedRequestHeaders,
  timingSafeEqualHex,
  verifyRequestSignature,
} from "./requestSignature";

// Vectors from server/src/utils/requestSignature.test.ts.
const secret = "mv_test_secret_key";
const timestamp = "1710000000";
const path = "/resources/abc/register";
const body = JSON.stringify({ signedXdr: "AAAA..." });
const bodyHash = hashRequestBody(body);

describe("requestSignature", () => {
  it("uses the known empty-body hash", () => {
    expect(EMPTY_BODY_HASH).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("hashes the canonical JSON body", () => {
    expect(bodyHash).toBe("e5a151f6a61fcf0d1681658c8afb8f0511f7945f577abb3cd2b0fb6746a80428");
  });

  it("builds the same canonical string as the server", () => {
    expect(
      buildCanonicalString({ method: "post", path, timestamp, bodyHash })
    ).toBe(`POST\n${path}\n${timestamp}\n${bodyHash}`);

    expect(
      buildCanonicalString({
        method: "POST",
        path,
        timestamp,
        bodyHash,
        idempotencyKey: "idem-1",
      })
    ).toBe(`POST\n${path}\n${timestamp}\n${bodyHash}\nidem-1`);
  });

  it("matches the server HMAC for the test vector", () => {
    const canonical = `POST\n${path}\n${timestamp}\n${bodyHash}`;
    expect(computeRequestSignature(secret, canonical)).toBe(
      "114d08da5ccd28378174f2ccf3ca00f661623bda1bcd855d4f2758c3843f9708"
    );
    expect(
      signPublisherRequest({ secret, method: "POST", path, timestamp, bodyHash })
    ).toBe("114d08da5ccd28378174f2ccf3ca00f661623bda1bcd855d4f2758c3843f9708");
  });

  it("strips the host and fragment from a request target", () => {
    expect(getRequestPath("https://api.example.test/resources/abc?x=1#frag")).toBe(
      "/resources/abc?x=1"
    );
    expect(getRequestPath("/resources/abc?x=1")).toBe("/resources/abc?x=1");
  });

  it("produces a different signature for a different path", () => {
    const signature = signPublisherRequest({
      secret,
      method: "POST",
      path,
      timestamp,
      bodyHash,
    });
    expect(
      signPublisherRequest({
        secret,
        method: "POST",
        path: "/resources/other/register",
        timestamp,
        bodyHash,
      })
    ).not.toBe(signature);
  });

  it("verifies a signature and rejects a tampered one", () => {
    const signature = signPublisherRequest({ secret, method: "POST", path, timestamp, bodyHash });
    expect(
      verifyRequestSignature({ secret, method: "POST", path, timestamp, bodyHash, signature })
    ).toBe(true);
    expect(
      verifyRequestSignature({
        secret,
        method: "POST",
        path: "/resources/other/register",
        timestamp,
        bodyHash,
        signature,
      })
    ).toBe(false);
    expect(timingSafeEqualHex(signature, signature)).toBe(true);
    expect(timingSafeEqualHex(signature, "0".repeat(64))).toBe(false);
  });

  it("builds the signature headers for a mutation", () => {
    const spy = jest.spyOn(Date, "now").mockReturnValue(1710000000000);
    try {
      const headers = signedRequestHeaders({
        secret,
        method: "POST",
        path: `/resources/abc/register?x=1#frag`,
        body,
      });

      expect(headers["X-Timestamp"]).toBe(timestamp);
      expect(headers["X-Signature"]).toBe(
        signPublisherRequest({
          secret,
          method: "POST",
          path: "/resources/abc/register?x=1",
          timestamp,
          bodyHash,
        })
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("hashes multipart fields in sorted order with an optional file digest", () => {
    const fields = { price: "1.00", title: "Doc" };
    const withoutFile = hashMultipartBody(fields);
    const withFile = hashMultipartBody(fields, {
      buffer: Uint8Array.from([104, 101, 108, 108, 111]),
    });

    expect(withoutFile).toMatch(/^[0-9a-f]{64}$/);
    expect(withFile).toMatch(/^[0-9a-f]{64}$/);
    expect(withFile).not.toBe(withoutFile);
  });

  it("accepts timestamps inside the skew window and rejects stale ones", () => {
    const now = Date.parse("2024-03-10T12:00:00Z");
    expect(isTimestampWithinSkew(Math.floor(now / 1000), now, 300_000)).toBe(true);
    expect(isTimestampWithinSkew(Math.floor((now - 600_000) / 1000), now, 300_000)).toBe(false);
    expect(isTimestampWithinSkew(Number.NaN, now, 300_000)).toBe(false);
  });
});
