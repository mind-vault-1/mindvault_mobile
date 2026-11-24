import { digestMatches, isSha256Hex, sha256Hex, sha256HexOfBytes, utf8Bytes } from "./hash";

describe("sha256Hex", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["hello world", "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])("matches the published test vector for %j", (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it("agrees with Node's crypto for every length around the padding boundaries", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("crypto") as typeof import("crypto");
    for (let length = 0; length <= 130; length++) {
      const text = "a".repeat(length);
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });

  it("agrees with Node's crypto for multi-byte and mixed text", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("crypto") as typeof import("crypto");
    for (const text of ["é", "€5 only", "日本語のテキスト", "emoji 😀 mix", "line\nbreak\r\n", "x".repeat(1000) + "é"]) {
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });

  it("hashes multi-byte text by its UTF-8 bytes", () => {
    expect(utf8Bytes("é")).toEqual([0xc3, 0xa9]);
    expect(utf8Bytes("€")).toEqual([0xe2, 0x82, 0xac]);
    expect(utf8Bytes("😀")).toEqual([0xf0, 0x9f, 0x98, 0x80]);
    expect(sha256Hex("é")).toBe(sha256HexOfBytes([0xc3, 0xa9]));
  });

  it("returns 64 lowercase hex characters", () => {
    expect(sha256Hex("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isSha256Hex", () => {
  it("accepts 64 hex characters in either case and rejects everything else", () => {
    expect(isSha256Hex(sha256Hex("x"))).toBe(true);
    expect(isSha256Hex(sha256Hex("x").toUpperCase())).toBe(true);
    expect(isSha256Hex("abc")).toBe(false);
    expect(isSha256Hex("g".repeat(64))).toBe(false);
    expect(isSha256Hex(undefined)).toBe(false);
    expect(isSha256Hex(null)).toBe(false);
  });
});

describe("digestMatches", () => {
  it("is true for the digest of the same content", () => {
    expect(digestMatches("hello world", sha256Hex("hello world"))).toBe(true);
    expect(digestMatches("hello world", sha256Hex("hello world").toUpperCase())).toBe(true);
  });

  it("is false for a different digest", () => {
    expect(digestMatches("hello world", sha256Hex("hello worle"))).toBe(false);
  });

  it("is false for a truncated copy of the content", () => {
    const original = "The full text of the resource.";
    expect(digestMatches(original.slice(0, -5), sha256Hex(original))).toBe(false);
  });

  it("is false for a missing or malformed expected digest", () => {
    expect(digestMatches("x", undefined)).toBe(false);
    expect(digestMatches("x", "")).toBe(false);
    expect(digestMatches("x", "not a digest")).toBe(false);
  });
});
