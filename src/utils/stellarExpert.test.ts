import { resetNetworkForTests, setNetwork } from "../config/network";
import { stellarExpertAccountUrl, stellarExpertTxUrl } from "./stellarExpert";

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

beforeEach(() => resetNetworkForTests());

describe("stellarExpert URL helpers", () => {
  it("uses the configured explorer network when no explicit network is provided", () => {
    expect(stellarExpertTxUrl({ txHash: "abc123" })).toBe(
      "https://stellar.expert/explorer/public/tx/abc123"
    );
    expect(stellarExpertAccountUrl({ accountId: "GB123" })).toBe(
      "https://stellar.expert/explorer/public/account/GB123"
    );
  });

  it("follows a runtime network switch without a restart", () => {
    setNetwork("testnet");
    expect(stellarExpertTxUrl({ txHash: "abc123" })).toBe(
      "https://stellar.expert/explorer/testnet/tx/abc123"
    );
  });
});
