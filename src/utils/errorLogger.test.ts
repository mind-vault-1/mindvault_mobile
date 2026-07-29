import { extractApiErrorMessageFromBody } from "./errorLogger";

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
        "Payment failed for token=secret-token-123",
        "Fallback",
        "text/plain"
      )
    ).toBe("Payment failed for token: [redacted]");
  });

  it("falls back for empty or invalid JSON bodies", () => {
    expect(extractApiErrorMessageFromBody("", "Fallback", "text/plain")).toBe("Fallback");
    expect(extractApiErrorMessageFromBody("{not json", "Fallback", "application/json")).toBe(
      "Fallback"
    );
  });
});
