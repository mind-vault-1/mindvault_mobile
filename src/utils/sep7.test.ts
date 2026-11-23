import {
  SEP7_CALLBACK_URL,
  buildSep7TransactionUri,
  isSep7CallbackUrl,
  parseSep7Callback,
} from "./sep7";

describe("SEP-7 URI helpers", () => {
  it("builds a wallet URI with the default callback", () => {
    expect(buildSep7TransactionUri(" abc123 ")).toBe(
      `web+stellar:tx?xdr=abc123&callback=${encodeURIComponent(SEP7_CALLBACK_URL)}`
    );
  });

  it("supports a custom callback and message, and omits the callback when disabled", () => {
    const uri = buildSep7TransactionUri("abc123", {
      callbackUrl: "mindvault://return",
      message: "Sign payment",
    });
    const params = new URLSearchParams(uri.slice(uri.indexOf("?") + 1));
    expect(params.get("xdr")).toBe("abc123");
    expect(params.get("callback")).toBe("mindvault://return");
    expect(params.get("message")).toBe("Sign payment");

    expect(buildSep7TransactionUri("abc123", { callbackUrl: null })).toBe(
      "web+stellar:tx?xdr=abc123"
    );
  });

  it("rejects an empty transaction", () => {
    expect(() => buildSep7TransactionUri("  ")).toThrow("A transaction XDR is required.");
  });

  it("parses only MindVault SEP-7 callback URLs", () => {
    expect(isSep7CallbackUrl(SEP7_CALLBACK_URL)).toBe(true);
    expect(isSep7CallbackUrl("mindvault://resources/abc")).toBe(false);

    expect(parseSep7Callback(`${SEP7_CALLBACK_URL}?result=signed&xdr=signed-xdr`)).toEqual({
      status: "signed",
      signedXdr: "signed-xdr",
      error: undefined,
    });
    expect(parseSep7Callback(`${SEP7_CALLBACK_URL}?result=rejected`)).toEqual({
      status: "rejected",
      signedXdr: undefined,
      error: undefined,
    });
    expect(parseSep7Callback(`${SEP7_CALLBACK_URL}?result=unknown`)).toEqual({
      status: "unknown",
      signedXdr: undefined,
      error: undefined,
    });
    expect(parseSep7Callback("mindvault://resources/abc")).toBeNull();
  });
});
