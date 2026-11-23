import {
  getDefaultNetworkId,
  getNetwork,
  getNetworkConfig,
  resetNetworkForTests,
  setNetwork,
  subscribeNetwork,
} from "./network";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        network: "public",
      },
    },
  },
}));

beforeEach(() => resetNetworkForTests());

it("normalizes the configured network to a network id", () => {
  expect(getDefaultNetworkId()).toBe("mainnet");
  expect(getNetwork()).toBe("mainnet");
  expect(getNetworkConfig().explorerSegment).toBe("public");
});

it("switches networks and notifies subscribers", () => {
  const listener = jest.fn();
  const unsubscribe = subscribeNetwork(listener);

  setNetwork("testnet");
  expect(getNetwork()).toBe("testnet");
  expect(getNetworkConfig().passphrase).toContain("Test SDF Network");
  expect(listener).toHaveBeenCalledWith("testnet");

  unsubscribe();
  setNetwork("futurenet");
  expect(listener).toHaveBeenCalledTimes(1);
  expect(getNetworkConfig().explorerSegment).toBe("futurenet");
});
