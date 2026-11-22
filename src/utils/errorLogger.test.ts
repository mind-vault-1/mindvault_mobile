import {
  extractApiErrorMessageFromBody,
  logError,
  normalizeError,
  getErrorLog,
  clearErrorLog,
} from "./errorLogger";

describe("extractApiErrorMessageFromBody", () => {
  it("preserves common structured server messages", () => {
    expect(
      extractApiErrorMessageFromBody(
        JSON.stringify({ message: "Price must be greater than zero." }),
        "Fallback",
        "application/json"
      )
    ).toBe("Price must be greater than zero.");
  });

  it("extracts validation errors without exposing sensitive fields", () => {
    expect(
      extractApiErrorMessageFromBody(
        JSON.stringify({
          errors: {
            price: "Must be a valid decimal.",
            apiKey: "pk_live_very-secret-value",
          },
        }),
        "Fallback",
        "application/json"
      )
    ).toBe("price: Must be a valid decimal.");
  });

  it("redacts sensitive values from plain text messages", () => {
    expect(
      extractApiErrorMessageFromBody(
        "Payment failed for token=secret-token-123, authorization: Basic abc123",
        "Fallback",
        "text/plain"
      )
    ).toBe("Payment failed for token: [redacted], authorization: [redacted]");
  });

  it("redacts secret seeds, API keys, XDR, and HMAC signature headers", () => {
    const secretSeed = `S${"A".repeat(55)}`;
    const message = [
      `secret_seed=${secretSeed}`,
      "api-key=pk_live_very-secret-value",
      "sk_test_unlabeled-secret-key",
      "xdr=AAAA-test-xdr",
      "X-Stellar-Signature: hmac-secret-value",
    ].join("; ");

    const normalized = normalizeError(message);

    expect(normalized.message).not.toContain(secretSeed);
    expect(normalized.message).not.toContain("pk_live_very-secret-value");
    expect(normalized.message).not.toContain("sk_test_unlabeled-secret-key");
    expect(normalized.message).not.toContain("AAAA-test-xdr");
    expect(normalized.message).not.toContain("hmac-secret-value");
    expect(normalized.message.match(/\[redacted\]/g)).toHaveLength(5);
  });

  it("redacts sensitive object properties and error stacks", () => {
    const secretSeed = `S${"B".repeat(55)}`;
    const error = new Error(`Request failed with apiKey=${secretSeed}`);
    error.stack = `Error: apiKey=${secretSeed}\n    at request`;

    const normalizedError = normalizeError(error);
    const normalizedObject = normalizeError({
      message: "Request failed",
      headers: { "X-HMAC-Signature": "sensitive-signature" },
      xdr: "sensitive-xdr",
    });

    expect(normalizedError.message).not.toContain(secretSeed);
    expect(normalizedError.stack).not.toContain(secretSeed);
    expect(normalizedObject.message).not.toContain("sensitive-signature");
    expect(normalizedObject.message).not.toContain("sensitive-xdr");
  });

  it("redacts sensitive values from the logging context", () => {
    const consoleError = jest.spyOn(globalThis.console, "error").mockImplementation(() => {});
    const secret = "context-secret";

    try {
      logError(`request token=${secret}`, new Error("Failed"));
      expect(consoleError).toHaveBeenCalledWith(
        "[MindVault] request token: [redacted]: Failed"
      );
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain(secret);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("falls back for empty or invalid JSON bodies", () => {
    expect(extractApiErrorMessageFromBody("", "Fallback", "text/plain")).toBe("Fallback");
    expect(extractApiErrorMessageFromBody("{not json", "Fallback", "application/json")).toBe(
      "Fallback"
    );
  });
});

describe("error log tracking", () => {
  beforeEach(() => {
    clearErrorLog();
  });

  it("tracks logged errors", () => {
    const consoleErrorSpy = jest.spyOn(globalThis.console, "error").mockImplementation(() => {});

    try {
      logError("test context 1", new Error("Error 1"));
      logError("test context 2", new Error("Error 2"));

      const log = getErrorLog();
      expect(log).toContain("test context 1");
      expect(log).toContain("Error 1");
      expect(log).toContain("test context 2");
      expect(log).toContain("Error 2");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("clears the error log", () => {
    const consoleErrorSpy = jest.spyOn(globalThis.console, "error").mockImplementation(() => {});

    try {
      logError("test context", new Error("Test error"));
      let log = getErrorLog();
      expect(log).toContain("test context");

      clearErrorLog();
      log = getErrorLog();
      expect(log).toBe("");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
