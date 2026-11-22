import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { ReceiptDetailScreen } from "./ReceiptDetailScreen";
import { getReceipt } from "../services/receipts";
import { fetchReceipt } from "../api/payment";

jest.mock("../services/receipts", () => ({
  ...jest.requireActual("../services/receipts"),
  getReceipt: jest.fn(),
}));

jest.mock("../api/payment", () => ({
  ...jest.requireActual("../api/payment"),
  fetchReceipt: jest.fn(),
}));

jest.mock("../utils/stellarExpert", () => ({
  ...jest.requireActual("../utils/stellarExpert"),
  stellarExpertTxUrl: jest.fn((args: any) => `https://stellar.expert/explorer/${args.network}/tx/${args.txHash}`),
  openExternalUrl: jest.fn(),
}));

jest.mock("../theme/ThemeProvider", () => {
  const colors = {
    primary: "#6366f1",
    primaryMuted: "#e0e7ff",
    surface: "#ffffff",
    border: "#e2e8f0",
    text: "#0f172a",
    textMuted: "#64748b",
    textSubtle: "#94a3b8",
    danger: "#ef4444",
    dangerBg: "#fee2e2",
    success: "#22c55e",
    successBg: "#dcfce7",
    warning: "#f59e0b",
    warningBg: "#fef3c7",
    neutralBg: "#f1f5f9",
    background: "#ffffff",
  };
  return {
    useAppTheme: () => ({
      colors,
      colorScheme: "light",
      shared: {
        screen: {},
        card: {},
        badge: {},
        badgeText: {},
        button: {},
        buttonText: {},
        primaryButton: {},
        primaryButtonText: {},
      },
      typography: {
        title: {},
        subtitle: {},
        heading: {},
        body: {},
        caption: {},
        price: {},
        cardTitle: {},
      },
    }),
  };
});



const mockedGetReceipt = getReceipt as jest.MockedFunction<typeof getReceipt>;
const mockedFetchReceipt = fetchReceipt as jest.MockedFunction<typeof fetchReceipt>;
const mockedOpenExternalUrl = require("../utils/stellarExpert").openExternalUrl as jest.MockedFunction<any>;

describe("ReceiptDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockedGetReceipt.mockResolvedValue(null);
    mockedFetchReceipt.mockResolvedValue({
      id: "pay-123",
      resourceId: "res-1",
      resourceTitle: "Test Resource",
      amount: "12500000",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      network: "testnet",
      txHash: "abc123def456",
      payer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      paidAt: "2026-10-20T12:00:00Z",
      verified: true,
    });

    const { getByText } = render(
      <ReceiptDetailScreen route={{ params: { txHash: "abc123def456" } } as any} navigation={{ navigate: jest.fn() } as any} />
    );

    expect(getByText("Loading receipt details…")).toBeTruthy();
  });

  it("shows verified badge when local and server receipts match", async () => {
    const localReceipt = {
      resourceId: "res-1",
      title: "Test Resource",
      amount: "12500000",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      network: "testnet",
      txHash: "abc123def456",
      payer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      paidAt: "2026-10-20T12:00:00Z",
    };
    const serverReceipt = {
      id: "pay-123",
      resourceId: "res-1",
      resourceTitle: "Test Resource",
      amount: "12500000",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      network: "testnet",
      txHash: "abc123def456",
      payer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      paidAt: "2026-10-20T12:00:00Z",
      verified: true,
    };

    mockedGetReceipt.mockResolvedValue(localReceipt);
    mockedFetchReceipt.mockResolvedValue(serverReceipt);

    const { getByText } = render(
      <ReceiptDetailScreen route={{ params: { txHash: "abc123def456" } } as any} navigation={{ navigate: jest.fn() } as any} />
    );

    await waitFor(() => {
      expect(getByText("Verified")).toBeTruthy();
      expect(getByText("✓ Local receipt matches server record")).toBeTruthy();
    });
  });

  it("shows mismatch badge when local and server receipts differ", async () => {
    const localReceipt = {
      resourceId: "res-1",
      title: "Test Resource",
      amount: "12500000",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      network: "testnet",
      txHash: "different-hash",
      payer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      paidAt: "2026-10-20T12:00:00Z",
    };
    const serverReceipt = {
      id: "pay-123",
      resourceId: "res-1",
      resourceTitle: "Test Resource",
      amount: "12500000",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      network: "testnet",
      txHash: "abc123def456",
      payer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      paidAt: "2026-10-20T12:00:00Z",
      verified: true,
    };

    mockedGetReceipt.mockResolvedValue(localReceipt);
    mockedFetchReceipt.mockResolvedValue(serverReceipt);

    const { getByText } = render(
      <ReceiptDetailScreen route={{ params: { txHash: "abc123def456" } } as any} navigation={{ navigate: jest.fn() } as any} />
    );

    await waitFor(() => {
      expect(getByText("Mismatch")).toBeTruthy();
      expect(getByText("⚠ Local receipt differs from server")).toBeTruthy();
    });
  });

  it("shows 'No local receipt' when only server receipt exists", async () => {
    const serverReceipt = {
      id: "pay-123",
      resourceId: "res-1",
      resourceTitle: "Test Resource",
      amount: "12500000",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      network: "testnet",
      txHash: "abc123def456",
      payer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      paidAt: "2026-10-20T12:00:00Z",
      verified: true,
    };

    mockedGetReceipt.mockResolvedValue(null);
    mockedFetchReceipt.mockResolvedValue(serverReceipt);

    const { getByText } = render(
      <ReceiptDetailScreen route={{ params: { txHash: "abc123def456" } } as any} navigation={{ navigate: jest.fn() } as any} />
    );

    await waitFor(() => {
      expect(getByText(/No local receipt to compare/)).toBeTruthy();
      expect(getByText("No local receipt found for this transaction.")).toBeTruthy();
    });
  });

  it("shows error when server receipt fetch fails", async () => {
    mockedGetReceipt.mockResolvedValue(null);
    mockedFetchReceipt.mockRejectedValue(new Error("Network error"));

    const { getByText } = render(
      <ReceiptDetailScreen route={{ params: { txHash: "abc123def456" } } as any} navigation={{ navigate: jest.fn() } as any} />
    );

    await waitFor(() => {
      expect(getByText("Network error")).toBeTruthy();
    });
  });

  it("opens Stellar Expert when View on Explorer is pressed", async () => {
    const serverReceipt = {
      id: "pay-123",
      resourceId: "res-1",
      resourceTitle: "Test Resource",
      amount: "12500000",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      network: "testnet",
      txHash: "abc123def456",
      payer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      paidAt: "2026-10-20T12:00:00Z",
      verified: true,
    };

    mockedGetReceipt.mockResolvedValue(null);
    mockedFetchReceipt.mockResolvedValue(serverReceipt);

    const { getByText } = render(
      <ReceiptDetailScreen route={{ params: { txHash: "abc123def456" } } as any} navigation={{ navigate: jest.fn() } as any} />
    );

    await waitFor(() => {
      expect(getByText("View on Explorer")).toBeTruthy();
    });

    fireEvent.press(getByText("View on Explorer"));

    await waitFor(() => {
      expect(mockedOpenExternalUrl).toHaveBeenCalledWith("https://stellar.expert/explorer/testnet/tx/abc123def456");
    });
  });
});
