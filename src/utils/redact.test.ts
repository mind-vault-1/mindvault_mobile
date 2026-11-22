import * as fs from "fs";
import * as path from "path";

import { logError } from "./errorLogger";
import { redact, redactString } from "./redact";

// Realistic, publicly documented credentials used purely as redaction fixtures:
// a Stellar testnet secret seed, the jwt.io sample JWT and a Stellar
// envelope-shaped signed XDR base64 blob. The API-key fixtures keep the
// `pk_live_`/`sk_test_` shape the redaction targets but use a tilde-separated
// placeholder: a byte-realistic key trips GitHub's secret push protection.
const STELLAR_SECRET = "SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN";
const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const PUBLISHABLE_KEY = "pk_live_fixture~redaction~key~012345";
const SECRET_KEY = "sk_test_fixture~redaction~key~012345";
const SIGNED_XDR =
  "AAAAAgAAAABXc1r3m9hTZq7jK0u9W7VjLQhXk3Lm9pQ2rS4tU6vW8xY0zA2bC4dE6fG8hI0jK2lM4nO6pQ8rS0tU2vW4xY6zA8bC0dE2fG4hI6jK8lM0nO2pQ4rS6tU8vW0xY2zA4bC6dE8fG0hI2jK4lM6nO8pQ0rS2tU";

function expectFullyRedacted(output: string, secrets: string[]) {
  for (const secret of secrets) {
    expect(output).not.toContain(secret);
    // Redaction must also remove partial fragments an attacker could reassemble.
    expect(output).not.toContain(secret.slice(8, 24));
  }
}

describe("redactString", () => {
  it("removes realistic secrets embedded in free text", () => {
    const message = `signer=${STELLAR_SECRET} token=${JWT} keys=${PUBLISHABLE_KEY}/${SECRET_KEY} envelope=${SIGNED_XDR}`;
    expectFullyRedacted(redactString(message), [
      STELLAR_SECRET,
      JWT,
      PUBLISHABLE_KEY,
      SECRET_KEY,
      SIGNED_XDR,
    ]);
  });

  it("keeps ordinary text intact", () => {
    expect(redactString("Publishing resource #42 failed")).toBe("Publishing resource #42 failed");
  });
});

describe("redact", () => {
  it("removes secrets from strings and nested objects", () => {
    const payload = {
      message: `authorization failed for ${JWT}`,
      headers: { Authorization: `Bearer ${JWT}`, "X-Api-Key": SECRET_KEY },
      body: {
        secretSeed: STELLAR_SECRET,
        signedXdr: SIGNED_XDR,
        nested: [{ note: `key ${PUBLISHABLE_KEY}`, public: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7" }],
      },
    };

    const safe = JSON.stringify(redact(payload));

    expectFullyRedacted(safe, [STELLAR_SECRET, JWT, PUBLISHABLE_KEY, SECRET_KEY, SIGNED_XDR]);
    // Public addresses and plain text survive.
    expect(safe).toContain("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7");
  });

  it("redacts values stored under sensitive keys outright", () => {
    const safe = redact({ token: "opaque-value", xdr: "opaque-xdr", hmac: "opaque-hmac" }) as Record<
      string,
      unknown
    >;
    expect(safe.token).toBe("[redacted]");
    expect(safe.xdr).toBe("[redacted]");
    expect(safe.hmac).toBe("[redacted]");
  });
});

describe("logError", () => {
  it("never persists or prints secrets from the message or the context", () => {
    const consoleError = jest.spyOn(globalThis.console, "error").mockImplementation(() => {});
    try {
      logError(`publish context seed=${STELLAR_SECRET}`, new Error(`failed with ${JWT} and ${SIGNED_XDR}`));
      const printed = consoleError.mock.calls.flat().join(" ");
      expectFullyRedacted(printed, [STELLAR_SECRET, JWT, SIGNED_XDR]);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("console bypass guard", () => {
  it("fails when a console.* call bypasses logError", () => {
    const srcRoot = path.join(__dirname, "..");
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        // errorLogger.ts is the one module allowed to write to the console:
        // it redacts everything first and only does so in development.
        if (full === path.join(srcRoot, "utils", "errorLogger.ts")) continue;
        if (/\bconsole\./.test(fs.readFileSync(full, "utf8"))) {
          offenders.push(path.relative(srcRoot, full));
        }
      }
    };

    walk(srcRoot);

    expect(offenders).toEqual([]);
  });
});
