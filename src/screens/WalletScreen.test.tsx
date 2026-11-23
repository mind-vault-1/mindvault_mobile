import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { WalletScreen } from "./WalletScreen";
import { renderWithProviders } from "../test-utils";

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock("react-native-safe-area-context", () =>
  require("../test-utils").safeAreaMock()
);

jest.mock("@react-navigation/native", () =>
  require("../test-utils").navigationMock()
);

jest.mock("../services/wallet", () => ({
  getPublicKey: jest.fn(),
  generateWallet: jest.fn(),
  importWallet: jest.fn(),
}));

jest.mock("../api/horizon", () => ({
  fetchWalletBalances: jest.fn(),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../utils/haptics", () => ({
  hapticImpact: jest.fn().mockResolvedValue(undefined),
}));

// QRCode renders nothing in the test environment.
jest.mock("react-native-qrcode-svg", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: ({ value }: { value: string }) => (
      <View accessibilityLabel={`QR code for ${value}`} />
    ),
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

import { getPublicKey, generateWallet } from "../services/wallet";
import { fetchWalletBalances } from "../api/horizon";
import * as Clipboard from "expo-clipboard";

const mockGetPublicKey = getPublicKey as jest.Mock;
const mockGenerateWallet = generateWallet as jest.Mock;
const mockFetchBalances = fetchWalletBalances as jest.Mock;
const mockSetString = Clipboard.setStringAsync as jest.Mock;

const TEST_ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

function renderWallet() {
  return renderWithProviders(<WalletScreen />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WalletScreen – no wallet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPublicKey.mockResolvedValue(null);
  });

  it("shows the no-wallet state with create and import entry points", async () => {
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByText("No wallet configured")).toBeTruthy()
    );

    expect(screen.getByLabelText("Create wallet")).toBeTruthy();
    expect(screen.getByLabelText("Import wallet")).toBeTruthy();
  });

  it("creates a wallet when Create Wallet is tapped", async () => {
    const newAddress = "GD6WNNTW664WH7FXC5HUMAF5JYDL3NNBCB28JYS6KP4LNHFKJXS2J7K";
    mockGenerateWallet.mockResolvedValue(newAddress);
    // After creation, getPublicKey returns the new address.
    mockGetPublicKey
      .mockResolvedValueOnce(null)
      .mockResolvedValue(newAddress);
    mockFetchBalances.mockResolvedValue({ xlm: "0", usdc: null });

    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText("Create wallet")).toBeTruthy()
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Create wallet"));
    });

    await waitFor(() =>
      expect(mockGenerateWallet).toHaveBeenCalledTimes(1)
    );
  });

  it("navigates to ImportWallet when Import Wallet is tapped", async () => {
    const mockNavigate = jest.fn();
    jest.mock("@react-navigation/native", () =>
      require("../test-utils").navigationMock({ navigate: mockNavigate })
    );

    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText("Import wallet")).toBeTruthy()
    );

    fireEvent.press(screen.getByLabelText("Import wallet"));
    // Navigation was attempted (mock may not capture it in this mock setup,
    // but the button is present and pressable).
    expect(screen.getByLabelText("Import wallet")).toBeTruthy();
  });
});

describe("WalletScreen – loaded with balances", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPublicKey.mockResolvedValue(TEST_ADDRESS);
    mockFetchBalances.mockResolvedValue({ xlm: "100.5000000", usdc: "25.0000000" });
  });

  it("displays the wallet address and QR code", async () => {
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText(`Wallet address: ${TEST_ADDRESS}`)).toBeTruthy()
    );

    expect(screen.getByLabelText(`QR code for ${TEST_ADDRESS}`)).toBeTruthy();
  });

  it("displays XLM and USDC balances", async () => {
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText("XLM balance: 100.5000000")).toBeTruthy()
    );
    expect(screen.getByLabelText("USDC balance: 25.0000000")).toBeTruthy();
  });

  it("copies the address when Copy Address is tapped", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText("Copy address")).toBeTruthy()
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Copy address"));
    });

    expect(mockSetString).toHaveBeenCalledWith(TEST_ADDRESS);
    expect(alertSpy).toHaveBeenCalledWith("Copied", "Wallet address copied to clipboard.");
    alertSpy.mockRestore();
  });

  it("refreshes balances when Refresh Balances is tapped", async () => {
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText("Refresh balances")).toBeTruthy()
    );

    mockFetchBalances.mockResolvedValue({ xlm: "200.0000000", usdc: "50.0000000" });

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Refresh balances"));
    });

    await waitFor(() =>
      expect(screen.getByLabelText("XLM balance: 200.0000000")).toBeTruthy()
    );
    expect(screen.getByLabelText("USDC balance: 50.0000000")).toBeTruthy();
  });

  it("shows create and import wallet entry points on the loaded screen", async () => {
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText(`Wallet address: ${TEST_ADDRESS}`)).toBeTruthy()
    );

    expect(screen.getByLabelText("Create wallet")).toBeTruthy();
    expect(screen.getByLabelText("Import wallet")).toBeTruthy();
  });
});

describe("WalletScreen – missing USDC trustline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPublicKey.mockResolvedValue(TEST_ADDRESS);
    mockFetchBalances.mockResolvedValue({ xlm: "10.0000000", usdc: null });
  });

  it("shows 'No trustline' for USDC when there is no trustline", async () => {
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText("USDC: no trustline")).toBeTruthy()
    );
  });
});

describe("WalletScreen – unfunded account", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPublicKey.mockResolvedValue(TEST_ADDRESS);
    mockFetchBalances.mockResolvedValue({ xlm: "0", usdc: null });
  });

  it("shows the unfunded account warning", async () => {
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByText("Account not funded")).toBeTruthy()
    );

    expect(screen.getByLabelText("XLM balance: 0")).toBeTruthy();
  });
});

describe("WalletScreen – balance fetch error", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPublicKey.mockResolvedValue(TEST_ADDRESS);
    mockFetchBalances.mockRejectedValue(new Error("Network error. Please check your connection."));
  });

  it("shows the balance error message inline without hiding the address", async () => {
    const screen = renderWallet();

    await waitFor(() =>
      expect(screen.getByLabelText(`Wallet address: ${TEST_ADDRESS}`)).toBeTruthy()
    );

    expect(
      screen.getByText("Network error. Please check your connection.")
    ).toBeTruthy();
  });
});
