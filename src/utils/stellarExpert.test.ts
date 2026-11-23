import { resetNetworkForTests, setNetwork } from "../config/network";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

import { openExternalUrl, stellarExpertAccountUrl, stellarExpertTxUrl } from "./stellarExpert";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

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

describe("openExternalUrl", () => {
  const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;
  const url = "https://stellar.expert/explorer/public/tx/abc";
  let canOpen: jest.SpyInstance;
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    openBrowser.mockReset().mockResolvedValue({ type: "opened" });
    canOpen = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    // react-native's jest setup already mocks Linking, so spyOn reuses that mock.
    canOpen.mockClear();
    openURL.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens http(s) URLs in the in-app browser without leaving the app", async () => {
    await openExternalUrl(url);

    expect(openBrowser).toHaveBeenCalledWith(url);
    expect(openURL).not.toHaveBeenCalled();
  });

  it("falls back to Linking when the in-app browser fails to open", async () => {
    openBrowser.mockRejectedValueOnce(new Error("no browser"));

    await openExternalUrl(url);

    expect(canOpen).toHaveBeenCalledWith(url);
    expect(openURL).toHaveBeenCalledWith(url);
  });

  it("rejects when the in-app browser fails and Linking cannot open the URL", async () => {
    openBrowser.mockRejectedValueOnce(new Error("no browser"));
    canOpen.mockResolvedValueOnce(false);

    await expect(openExternalUrl(url)).rejects.toThrow("Cannot open URL");
    expect(openURL).not.toHaveBeenCalled();
  });

  it("sends non-http(s) schemes straight to Linking", async () => {
    await openExternalUrl("mailto:support@example.com");

    expect(openBrowser).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith("mailto:support@example.com");
  });
});
