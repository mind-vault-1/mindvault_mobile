import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { WalletScreen } from "./WalletScreen";
import { ToastProvider } from "../components/ToastProvider";
import { ThemeProvider } from "../theme/ThemeProvider";

jest.mock("../services/walletconnect", () => ({
  getConnectedAccount: jest.fn().mockResolvedValue(null),
  startConnection: jest.fn(),
  disconnectWallet: jest.fn().mockResolvedValue(undefined),
  signXdrWithWallet: jest.fn(),
}));
jest.mock("../api/horizon", () => ({
  fetchWalletBalances: jest.fn(),
  fundWithFriendbot: jest.fn(),
  hasUsdcTrustline: jest.fn(),
  buildAddUsdcTrustlineXdr: jest.fn(),
  submitSignedTransaction: jest.fn(),
}));

const memoryWallet = new Map<string, string>();
jest.mock("../services/wallet", () => ({
  getPublicKey: jest.fn(async () => memoryWallet.get("public") ?? null),
  generateWallet: jest.fn(async () => {
    memoryWallet.set("public", "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7");
    return memoryWallet.get("public")!;
  }),
  importWallet: jest.fn(async (secret: string) => {
    if (!secret.trim()) throw new Error("Invalid recovery secret.");
    memoryWallet.set("secret", secret);
    memoryWallet.set("public", "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7");
    return memoryWallet.get("public")!;
  }),
  wipe: jest.fn(async () => memoryWallet.clear()),
}));
jest.mock("../services/secureStorage", () => ({ clearApiKey: jest.fn().mockResolvedValue(undefined) }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockedWallet = jest.requireMock("../services/wallet") as {
  importWallet: jest.Mock;
  wipe: jest.Mock;
};

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
  memoryWallet.clear();
});

it("re-imports a wallet mnemonic and shows the recovered address", async () => {
  const screen = await renderScreen();
  await act(async () => fireEvent.press(screen.getByLabelText("Import wallet")));
  await act(async () => fireEvent.changeText(screen.getByLabelText("Wallet secret key"), "SRECOVERY"));
  await act(async () => fireEvent.press(screen.getByLabelText("Import wallet")));

  expect(mockedWallet.importWallet).toHaveBeenCalledWith("SRECOVERY");
  expect(await screen.findByLabelText(/Wallet address/)).toBeTruthy();
  expect(memoryWallet.get("secret")).toBe("SRECOVERY");
});

it("leaves no partial wallet after a failed restore", async () => {
  mockedWallet.importWallet.mockImplementationOnce(async () => {
    throw new Error("Invalid recovery secret.");
  });
  const screen = await renderScreen();

  await act(async () => fireEvent.press(screen.getByLabelText("Import wallet")));
  await act(async () => fireEvent.changeText(screen.getByLabelText("Wallet secret key"), "bad-secret"));
  await act(async () => fireEvent.press(screen.getByLabelText("Import wallet")));

  expect(await screen.findByText("Invalid recovery secret.")).toBeTruthy();
  expect(memoryWallet.has("secret")).toBe(false);
  expect(memoryWallet.has("public")).toBe(false);
  expect(screen.queryByLabelText(/Wallet address/)).toBeNull();
});

it("requires typed confirmation before wiping the wallet", async () => {
  const screen = await renderScreen();
  await act(async () => fireEvent.press(screen.getByLabelText("Wipe wallet and sign out")));

  const erase = screen.getByLabelText("Erase wallet and sign out");
  expect(erase.props.accessibilityState.disabled).toBe(true);
  await act(async () => fireEvent.changeText(screen.getByLabelText("Type WIPE to confirm wipe"), "WIPE"));
  await act(async () => fireEvent.press(screen.getByLabelText("Erase wallet and sign out")));

  expect(mockedWallet.wipe).toHaveBeenCalled();
  expect(memoryWallet.size).toBe(0);
  expect(await screen.findByLabelText("Create wallet")).toBeTruthy();
});
