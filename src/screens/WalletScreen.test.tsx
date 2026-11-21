import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { WalletScreen } from "./WalletScreen";
import { ToastProvider } from "../components/ToastProvider";
import * as wc from "../services/walletconnect";
import { ThemeProvider } from "../theme/ThemeProvider";

jest.mock("../services/walletconnect", () => ({
  getConnectedAccount: jest.fn(),
  startConnection: jest.fn(),
  disconnectWallet: jest.fn(),
}));
jest.mock("react-native-qrcode-svg", () => "QRCode");
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mocked = wc as jest.Mocked<typeof wc>;
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

beforeEach(() => jest.clearAllMocks());

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
});
