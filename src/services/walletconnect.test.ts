import SignClient from "@walletconnect/sign-client";
import Constants from "expo-constants";

import {
  disconnectWallet,
  getChainId,
  getConnectedAccount,
  getProjectId,
  resetWalletConnectForTests,
  signXdrWithWallet,
  startConnection,
  WalletConnectConfigError,
} from "./walletconnect";

jest.mock("@walletconnect/react-native-compat", () => ({}));
jest.mock("@walletconnect/sign-client", () => ({ __esModule: true, default: { init: jest.fn() } }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { walletConnectProjectId: "cfg-project", network: "testnet" } } },
}));

const ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const future = Math.floor(Date.now() / 1000) + 3600;

function session(topic: string, expiry = future) {
  return {
    topic,
    expiry,
    peer: { metadata: { name: "LOBSTR" } },
    namespaces: { stellar: { accounts: [`stellar:testnet:${ADDRESS}`], methods: [], events: [] } },
  };
}

let client: {
  session: { getAll: jest.Mock; delete: jest.Mock };
  connect: jest.Mock;
  disconnect: jest.Mock;
  request: jest.Mock;
};
const extra = () => (Constants.expoConfig as { extra: Record<string, string> }).extra;

beforeEach(() => {
  resetWalletConnectForTests();
  extra().walletConnectProjectId = "cfg-project";
  extra().network = "testnet";
  client = {
    session: { getAll: jest.fn().mockReturnValue([]), delete: jest.fn().mockResolvedValue(undefined) },
    connect: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
    request: jest.fn(),
  };
  (SignClient.init as jest.Mock).mockReset().mockResolvedValue(client);
});

describe("config", () => {
  it("reads the project ID from config and trims it", () => {
    expect(getProjectId()).toBe("cfg-project");
    extra().walletConnectProjectId = "  padded  ";
    expect(getProjectId()).toBe("padded");
  });

  it("throws a clear error when no project ID is configured", async () => {
    extra().walletConnectProjectId = "";
    expect(() => getProjectId()).toThrow(WalletConnectConfigError);
    await expect(getConnectedAccount()).rejects.toThrow(/not configured/);
    expect(SignClient.init).not.toHaveBeenCalled();
  });

  it("maps the configured network to a CAIP-2 chain", () => {
    expect(getChainId()).toBe("stellar:testnet");
    extra().network = "mainnet";
    expect(getChainId()).toBe("stellar:pubnet");
  });
});

describe("sessions", () => {
  it("restores a persisted, unexpired session after a restart", async () => {
    client.session.getAll.mockReturnValue([session("old", 1), session("live")]);
    await expect(getConnectedAccount()).resolves.toEqual({
      topic: "live",
      address: ADDRESS,
      chainId: "stellar:testnet",
      walletName: "LOBSTR",
    });
    expect(SignClient.init).toHaveBeenCalledWith(expect.objectContaining({ projectId: "cfg-project" }));
  });

  it("returns null with no session", async () => {
    await expect(getConnectedAccount()).resolves.toBeNull();
  });

  it("creates the client only once", async () => {
    await getConnectedAccount();
    await getConnectedAccount();
    expect(SignClient.init).toHaveBeenCalledTimes(1);
  });

  it("retries init after a failure", async () => {
    (SignClient.init as jest.Mock).mockRejectedValueOnce(new Error("offline"));
    await expect(getConnectedAccount()).rejects.toThrow("offline");
    await expect(getConnectedAccount()).resolves.toBeNull();
  });
});

describe("connect and disconnect", () => {
  it("proposes a Stellar session and resolves the approved account", async () => {
    client.connect.mockResolvedValue({ uri: "wc:abc@2", approval: async () => session("t1") });
    const pending = await startConnection();
    expect(pending.uri).toBe("wc:abc@2");
    expect(client.connect).toHaveBeenCalledWith({
      requiredNamespaces: {
        stellar: { chains: ["stellar:testnet"], methods: ["stellar_signXDR"], events: [] },
      },
    });
    await expect(pending.approval()).resolves.toMatchObject({ topic: "t1", address: ADDRESS });
  });

  it("fails when the wallet shares no Stellar account", async () => {
    client.connect.mockResolvedValue({
      uri: "wc:abc@2",
      approval: async () => ({ ...session("t1"), namespaces: {} }),
    });
    await expect((await startConnection()).approval()).rejects.toThrow(/Stellar account/);
  });

  it("fails without a pairing URI", async () => {
    client.connect.mockResolvedValue({ approval: jest.fn() });
    await expect(startConnection()).rejects.toThrow(/pairing link/);
  });

  it("disconnects the active session", async () => {
    client.session.getAll.mockReturnValue([session("live")]);
    await disconnectWallet();
    expect(client.disconnect).toHaveBeenCalledWith(expect.objectContaining({ topic: "live" }));
  });

  it("drops the local session when the wallet is unreachable", async () => {
    client.session.getAll.mockReturnValue([session("live")]);
    client.disconnect.mockRejectedValue(new Error("gone"));
    await disconnectWallet();
    expect(client.session.delete).toHaveBeenCalledWith("live", expect.anything());
  });

  it("does nothing when disconnecting without a session", async () => {
    await disconnectWallet();
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});

describe("signXdrWithWallet", () => {
  it("sends stellar_signXDR and returns the signed XDR", async () => {
    client.session.getAll.mockReturnValue([session("live")]);
    client.request.mockResolvedValue({ signedXDR: "SIGNED" });
    await expect(signXdrWithWallet("XDR")).resolves.toBe("SIGNED");
    expect(client.request).toHaveBeenCalledWith({
      topic: "live",
      chainId: "stellar:testnet",
      request: { method: "stellar_signXDR", params: { xdr: "XDR" } },
    });
  });

  it("requires a connected wallet and a signed result", async () => {
    await expect(signXdrWithWallet("XDR")).rejects.toThrow(/No wallet/);
    client.session.getAll.mockReturnValue([session("live")]);
    client.request.mockResolvedValue({});
    await expect(signXdrWithWallet("XDR")).rejects.toThrow(/signed transaction/);
  });
});
