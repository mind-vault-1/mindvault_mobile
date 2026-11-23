import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { WalletScreen } from "./WalletScreen";
import * as horizon from "../api/horizon";
import { resetNetworkForTests, setNetwork } from "../config/network";
import { ToastProvider } from "../components/ToastProvider";
import * as wc from "../services/walletconnect";
import { ThemeProvider } from "../theme/ThemeProvider";

jest.mock("../services/walletconnect", () => ({
  getConnectedAccount: jest.fn(),
  startConnection: jest.fn(),
  disconnectWallet: jest.fn(),
  signXdrWithWallet: jest.fn(),
}));
jest.mock("../api/horizon", () => ({
  fetchWalletBalances: jest.fn(),
  fundWithFriendbot: jest.fn(),
  hasUsdcTrustline: jest.fn(),
  buildAddUsdcTrustlineXdr: jest.fn(),
  submitSignedTransaction: jest.fn(),
}));
jest.mock("../services/wallet", () => ({
  wipe: jest.fn(),
  getPublicKey: jest.fn().mockResolvedValue(null),
  generateWallet: jest.fn(),
  importWallet: jest.fn(),
}));
jest.mock("../services/secureStorage", () => ({ clearApiKey: jest.fn() }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mocked = wc as jest.Mocked<typeof wc>;
const mockedWallet = jest.requireMock("../services/wallet") as {
  wipe: jest.Mock;
  getPublicKey: jest.Mock;
  generateWallet: jest.Mock;
  importWallet: jest.Mock;
};
const mockedClipboard = jest.requireMock("expo-clipboard") as { setStringAsync: jest.Mock };
const mockedSecureStorage = jest.requireMock("../services/secureStorage") as { clearApiKey: jest.Mock };
const mockedHorizon = horizon as jest.Mocked<typeof horizon>;
const ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
const account = { topic: "t", address: ADDRESS, chainId: "stellar:testnet", walletName: "LOBSTR" };

async function renderScreen() {
  const screen = render(
    <ThemeProvider>
      <ToastProvider>
        <WalletScreen />
      </ToastProvider>
    </ThemeProvider>
  );
  await act(async () => {});
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetNetworkForTests();
  mockedHorizon.hasUsdcTrustline.mockResolvedValue(true);
  mockedHorizon.fundWithFriendbot.mockResolvedValue({ funded: true });
  mockedHorizon.fetchWalletBalances.mockResolvedValue({ xlm: "10.0000000", usdc: "2.5000000" });
  mockedWallet.getPublicKey.mockResolvedValue(null);
});

describe("WalletScreen", () => {
  it("shows the restored connected account", async () => {
    mocked.getConnectedAccount.mockResolvedValue(account);
    const { getByText, getByLabelText } = await renderScreen();
    expect(getByText("LOBSTR")).toBeTruthy();
    expect(getByLabelText(`Connected account ${ADDRESS}`)).toBeTruthy();
    expect(getByText("stellar:testnet")).toBeTruthy();
  });

  it("connects: shows the pairing QR, then the account once approved", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    let approve!: (a: typeof account) => void;
    mocked.startConnection.mockResolvedValue({
      uri: "wc:abc@2",
      approval: () => new Promise((resolve) => (approve = resolve)),
    });
    const { getByLabelText, findByText, queryByLabelText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText("Connect wallet"));
    });
    expect(getByLabelText("WalletConnect pairing QR code")).toBeTruthy();
    await act(async () => approve(account));
    expect(await findByText("Connected wallet")).toBeTruthy();
    expect(queryByLabelText("WalletConnect pairing QR code")).toBeNull();
  });

  it("shows an error when the wallet rejects", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    mocked.startConnection.mockResolvedValue({
      uri: "wc:abc@2",
      approval: () => Promise.reject(new Error("User rejected")),
    });
    const { getByLabelText, findByText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText("Connect wallet"));
    });
    expect(await findByText("User rejected")).toBeTruthy();
  });

  it("shows a configuration error", async () => {
    mocked.getConnectedAccount.mockRejectedValue(new Error("WalletConnect is not configured."));
    const { findByText } = await renderScreen();
    expect(await findByText("WalletConnect is not configured.")).toBeTruthy();
  });

  it("wipes the wallet, API key and session after typed confirmation", async () => {
    mocked.getConnectedAccount.mockResolvedValue(account);
    mocked.disconnectWallet.mockResolvedValue(undefined);
    mockedWallet.wipe.mockResolvedValue(undefined);
    mockedSecureStorage.clearApiKey.mockResolvedValue(undefined);
    const { getByLabelText, findByLabelText, queryByLabelText } = await renderScreen();

    await act(async () => {
      fireEvent.press(getByLabelText("Wipe wallet and sign out"));
    });

    const confirm = await findByLabelText("Erase wallet and sign out");
    expect(confirm.props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(getByLabelText("Type WIPE to confirm wipe"), "wipe");
    expect(confirm.props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.changeText(getByLabelText("Type WIPE to confirm wipe"), "WIPE");
    });
    await act(async () => {
      fireEvent.press(getByLabelText("Erase wallet and sign out"));
    });

    expect(mockedWallet.wipe).toHaveBeenCalled();
    expect(mockedSecureStorage.clearApiKey).toHaveBeenCalled();
    expect(mocked.disconnectWallet).toHaveBeenCalled();
    expect(await findByLabelText("Connect wallet")).toBeTruthy();
    expect(queryByLabelText("Type WIPE to confirm wipe")).toBeNull();
  });

  it("disconnects", async () => {
    mocked.getConnectedAccount.mockResolvedValue(account);
    mocked.disconnectWallet.mockResolvedValue(undefined);
    const { getByLabelText, findByLabelText } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText("Disconnect wallet"));
    });
    expect(mocked.disconnectWallet).toHaveBeenCalled();
    expect(await findByLabelText("Connect wallet")).toBeTruthy();
  });

  it("funds a testnet account with Friendbot", async () => {
    mocked.getConnectedAccount.mockResolvedValue(account);
    const { findByLabelText, findByText } = await renderScreen();

    await act(async () => {
      fireEvent.press(await findByLabelText("Fund with Friendbot"));
    });

    expect(mockedHorizon.fundWithFriendbot).toHaveBeenCalledWith(
      ADDRESS,
      expect.objectContaining({ id: "testnet" })
    );
    expect(await findByText("Testnet account funded")).toBeTruthy();
  });

  it("hides testnet funding tools on mainnet", async () => {
    setNetwork("mainnet");
    mocked.getConnectedAccount.mockResolvedValue(account);
    const { findByText, queryByLabelText } = await renderScreen();

    await findByText("Connected wallet");
    expect(queryByLabelText("Fund with Friendbot")).toBeNull();
    expect(queryByLabelText("Add USDC trustline")).toBeNull();
  });

  it("adds a missing USDC trustline through the connected wallet", async () => {
    mocked.getConnectedAccount.mockResolvedValue(account);
    mockedHorizon.hasUsdcTrustline.mockResolvedValue(false);
    mockedHorizon.buildAddUsdcTrustlineXdr.mockResolvedValue("unsigned-xdr");
    mocked.signXdrWithWallet.mockResolvedValue("signed-xdr");
    mockedHorizon.submitSignedTransaction.mockResolvedValue("tx-hash");
    const { findByLabelText, findByText } = await renderScreen();

    await act(async () => {
      fireEvent.press(await findByLabelText("Add USDC trustline"));
    });

    expect(mocked.signXdrWithWallet).toHaveBeenCalledWith("unsigned-xdr");
    expect(mockedHorizon.submitSignedTransaction).toHaveBeenCalledWith(
      "signed-xdr",
      expect.objectContaining({ id: "testnet" })
    );
    expect(await findByText("USDC trustline added")).toBeTruthy();
  });
});

describe("WalletScreen receive and balances", () => {
  it("shows the local address, QR code and balances", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    mockedWallet.getPublicKey.mockResolvedValue(ADDRESS);
    const { findByLabelText, findByText } = await renderScreen();

    expect(await findByLabelText(`Wallet address ${ADDRESS}`)).toBeTruthy();
    expect(await findByLabelText("Wallet address QR code")).toBeTruthy();
    expect(await findByText("XLM: 10.0000000")).toBeTruthy();
    expect(await findByText("USDC: 2.5000000")).toBeTruthy();
    expect(mockedHorizon.fetchWalletBalances).toHaveBeenCalledWith(ADDRESS);
  });

  it("copies the receiving address", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    mockedWallet.getPublicKey.mockResolvedValue(ADDRESS);
    const { findByLabelText } = await renderScreen();

    await act(async () => {
      fireEvent.press(await findByLabelText("Copy wallet address"));
    });

    expect(mockedClipboard.setStringAsync).toHaveBeenCalledWith(ADDRESS);
  });

  it("refreshes balances on demand", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    mockedWallet.getPublicKey.mockResolvedValue(ADDRESS);
    const { findByLabelText } = await renderScreen();

    await act(async () => {
      fireEvent.press(await findByLabelText("Refresh balances"));
    });

    expect(mockedHorizon.fetchWalletBalances).toHaveBeenCalledTimes(2);
  });

  it("handles an unfunded account gracefully", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    mockedWallet.getPublicKey.mockResolvedValue(ADDRESS);
    mockedHorizon.fetchWalletBalances.mockResolvedValue({ xlm: "0", usdc: null });
    const { findByText } = await renderScreen();

    expect(await findByText("XLM: 0")).toBeTruthy();
    expect(await findByText("USDC: 0")).toBeTruthy();
    expect(await findByText("This account is not funded yet.")).toBeTruthy();
    expect(await findByText("No USDC trustline on this account.")).toBeTruthy();
  });

  it("shows a balance fetch error", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    mockedWallet.getPublicKey.mockResolvedValue(ADDRESS);
    mockedHorizon.fetchWalletBalances.mockRejectedValue(new Error("Horizon unavailable"));
    const { findByText } = await renderScreen();

    expect(await findByText("Horizon unavailable")).toBeTruthy();
  });

  it("creates a local wallet", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    mockedWallet.generateWallet.mockResolvedValue(ADDRESS);
    const { findByLabelText } = await renderScreen();

    await act(async () => {
      fireEvent.press(await findByLabelText("Create wallet"));
    });

    expect(mockedWallet.generateWallet).toHaveBeenCalled();
    expect(await findByLabelText(`Wallet address ${ADDRESS}`)).toBeTruthy();
  });

  it("imports a local wallet from a secret key", async () => {
    mocked.getConnectedAccount.mockResolvedValue(null);
    mockedWallet.importWallet.mockResolvedValue(ADDRESS);
    const screen = await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Import wallet"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Wallet secret key"), "SSECRET");
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Import wallet"));
    });

    expect(mockedWallet.importWallet).toHaveBeenCalledWith("SSECRET");
    expect(await screen.findByLabelText(`Wallet address ${ADDRESS}`)).toBeTruthy();
  });
});
