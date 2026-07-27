jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        network: "public",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
    },
  },
}));

import { stellarExpertAccountUrl, stellarExpertTxUrl } from "./stellarExpert";

describe("stellarExpert URL helpers", () => {
  it("uses the configured explorer network when no explicit network is provided", () => {
    expect(stellarExpertTxUrl({ txHash: "abc123" })).toBe(
      "https://stellar.expert/explorer/public/tx/abc123"
    );
    expect(stellarExpertAccountUrl({ accountId: "GB123" })).toBe(
      "https://stellar.expert/explorer/public/account/GB123"
    );
  });
});
