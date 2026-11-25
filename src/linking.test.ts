import AsyncStorage from "@react-native-async-storage/async-storage";

import { createLinkingOptions } from "./linking";
import { getReferralState, referralCodeFor } from "./services/referrals";

jest.mock("./services/wallet", () => ({ getPublicKey: jest.fn().mockResolvedValue("GME") }));

describe("createLinkingOptions", () => {
  const testHost = "https://api.mindvault.app";

  it("resolves custom scheme mindvault:// to ResourceDetail", () => {
    const linking = createLinkingOptions(testHost);
    const state = linking.getStateFromPath?.("resources/abc123");

    expect(state).toEqual({
      routes: [
        { name: "Catalog" },
        { name: "ResourceDetail", params: { resourceId: "abc123" } },
      ],
    });
  });

  it("resolves https://<host>/resources/<id> to ResourceDetail", () => {
    const linking = createLinkingOptions(testHost);
    const state = linking.getStateFromPath?.("resources/xyz789");

    expect(state).toEqual({
      routes: [
        { name: "Catalog" },
        { name: "ResourceDetail", params: { resourceId: "xyz789" } },
      ],
    });
  });

  it("returns undefined for unrelated paths", () => {
    const linking = createLinkingOptions(testHost);
    expect(linking.getStateFromPath?.("some/random/path")).toBeUndefined();
    expect(linking.getStateFromPath?.("")).toBeUndefined();
  });

  it("records a referral link and opens the catalog", async () => {
    await AsyncStorage.clear();
    const code = referralCodeFor("GFRIEND");
    const linking = createLinkingOptions(testHost);
    expect(linking.getStateFromPath?.(`ref/${code}`)).toEqual({ routes: [{ name: "Catalog" }] });
    await waitForReferrer(code);
  });

  it("keeps resource links working alongside referral links", () => {
    const linking = createLinkingOptions(testHost);
    expect(linking.getStateFromPath?.("resources/ref")).toEqual({
      routes: [{ name: "Catalog" }, { name: "ResourceDetail", params: { resourceId: "ref" } }],
    });
    expect(linking.getStateFromPath?.("ref/bad")).toBeUndefined();
  });

  it("returns undefined for other hosts", () => {
    const linking = createLinkingOptions(testHost);
    const state = linking.getStateFromPath?.("https://example.com/resources/abc");
    expect(state).toBeUndefined();
  });
});

describe("app.config.js host derivation logic", () => {
  function deriveHost(apiUrl: string): string | null {
    try {
      const url = new URL(apiUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return null;
      if (url.protocol === "http:") return null;
      return url.hostname;
    } catch {
      return null;
    }
  }

  it("extracts host from HTTPS URL", () => {
    expect(deriveHost("https://api.mindvault.app")).toBe("api.mindvault.app");
    expect(deriveHost("https://staging.mindvault.app/api")).toBe("staging.mindvault.app");
  });

  it("returns null for localhost", () => {
    expect(deriveHost("http://localhost:4021")).toBeNull();
    expect(deriveHost("https://localhost:4021")).toBeNull();
    expect(deriveHost("http://127.0.0.1:4021")).toBeNull();
  });

  it("returns null for non-HTTPS URLs", () => {
    expect(deriveHost("http://api.mindvault.app")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(deriveHost("not-a-url")).toBeNull();
    expect(deriveHost("")).toBeNull();
  });
});

async function waitForReferrer(code: string) {
  for (let i = 0; i < 20; i += 1) {
    if ((await getReferralState()).referrerCode === code) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("referrer was not recorded");
}
