import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { LeaseSheet } from "./LeaseSheet";
import { quoteLease, buyLease, type LeaseQuote } from "../api/leases";
import type { Resource } from "../types";

jest.mock("../api/leases", () => ({
  ...jest.requireActual("../api/leases"),
  quoteLease: jest.fn(),
  buyLease: jest.fn(),
}));

jest.mock("../components/SignTransactionSheet", () => {
  const RN = jest.requireActual("react-native");
  return {
    SignTransactionSheet: ({ visible, onCancel, onSigned, sign }: any) => {
      if (!visible) return null;
      return (
        <RN.View testID="sign-transaction-sheet">
          <RN.Text testID="sign-sheet-title">Sign Transaction Sheet</RN.Text>
          <RN.Pressable
            testID="mock-sign-btn"
            onPress={async () => {
              if (sign) {
                try {
                  const result = await sign("S-test-secret");
                  await onSigned?.(result ?? "SIGNED_XDR");
                } catch {
                  // ignore
                }
              } else {
                await onSigned?.("SIGNED_XDR");
              }
            }}
          />
          <RN.Pressable testID="mock-sign-cancel" onPress={onCancel} />
        </RN.View>
      );
    },
  };
});

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

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const mockedQuoteLease = quoteLease as jest.MockedFunction<typeof quoteLease>;
const mockedBuyLease = buyLease as jest.MockedFunction<typeof buyLease>;

function createResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "res-123",
    title: "Test Resource",
    price: "5.00",
    resourceType: "file",
    publisherName: "Alice",
    walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
    verificationStatus: "verified",
    onchainStatus: "none",
    listed: true,
    accessUrl: "https://example.com/file",
    ...overrides,
  };
}

describe("LeaseSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders three tier options when visible", async () => {
    mockedQuoteLease.mockResolvedValue({
      resourceId: "res-123",
      tier: 0,
      creator: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      price: "1000000",
    });

    const onClose = jest.fn();
    const onLeasePurchased = jest.fn();

    const { getByText, queryByText } = render(
      <LeaseSheet
        visible={true}
        resource={createResource()}
        price="5.00"
        onClose={onClose}
        onLeasePurchased={onLeasePurchased}
      />
    );

    expect(getByText("Rent Test Resource")).toBeTruthy();
    expect(getByText("Hour")).toBeTruthy();
    expect(getByText("Day")).toBeTruthy();
    expect(getByText("Week")).toBeTruthy();
    expect(queryByText("Fetching lease quote…")).toBeNull();
  });

  it("fetches quote when a tier is selected", async () => {
    const quote: LeaseQuote = {
      resourceId: "res-123",
      tier: 1,
      creator: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      price: "25000000",
    };
    mockedQuoteLease.mockResolvedValue(quote);

    const onClose = jest.fn();
    const onLeasePurchased = jest.fn();

    const { getByText, getByLabelText } = render(
      <LeaseSheet
        visible={true}
        resource={createResource()}
        price="5.00"
        onClose={onClose}
        onLeasePurchased={onLeasePurchased}
      />
    );

    fireEvent.press(getByLabelText("Select Day lease"));

    await waitFor(() => {
      expect(mockedQuoteLease).toHaveBeenCalledWith("res-123", 1);
    });

    await waitFor(() => {
      expect(getByText("Day")).toBeTruthy();
      expect(getByText("2.50 USDC")).toBeTruthy();
    });
  });

  it("shows error when quote fails", async () => {
    mockedQuoteLease.mockRejectedValue(new Error("Resource not found"));

    const onClose = jest.fn();
    const onLeasePurchased = jest.fn();

    const { getByText, getByLabelText, queryByText } = render(
      <LeaseSheet
        visible={true}
        resource={createResource()}
        price="5.00"
        onClose={onClose}
        onLeasePurchased={onLeasePurchased}
      />
    );

    fireEvent.press(getByLabelText("Select Hour lease"));

    await waitFor(() => {
      expect(getByText("Resource not found")).toBeTruthy();
    });

    // Retry button should work
    fireEvent.press(getByText("Try Again"));
    await waitFor(() => {
      expect(queryByText("Resource not found")).toBeNull();
      expect(getByText("Hour")).toBeTruthy();
    });
  });

  it("opens SignTransactionSheet on confirm and completes purchase", async () => {
    const quote: LeaseQuote = {
      resourceId: "res-123",
      tier: 1,
      creator: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      price: "25000000",
    };
    mockedQuoteLease.mockResolvedValue(quote);

    mockedBuyLease.mockResolvedValue({
      resourceId: "res-123",
      tier: 1,
      state: "Pending",
      expiresAt: null,
      txHash: "abc123def456",
    });

    const onClose = jest.fn();
    const onLeasePurchased = jest.fn();

    const { getByText, getByLabelText, getByTestId } = render(
      <LeaseSheet
        visible={true}
        resource={createResource()}
        price="5.00"
        onClose={onClose}
        onLeasePurchased={onLeasePurchased}
      />
    );

    // Select tier
    fireEvent.press(getByLabelText("Select Day lease"));
    await waitFor(() => expect(getByText("2.50 USDC")).toBeTruthy());

    // Confirm
    fireEvent.press(getByText("Confirm & Pay"));

    // SignTransactionSheet should be visible
    await waitFor(() => expect(getByTestId("sign-transaction-sheet")).toBeTruthy());

    // Simulate signing
    fireEvent.press(getByTestId("mock-sign-btn"));

    await waitFor(() => {
      expect(onLeasePurchased).toHaveBeenCalledWith({
        tier: 1,
        txHash: "abc123def456",
      });
    });

    await waitFor(() => expect(getByText("Lease Purchased")).toBeTruthy());
  });

  it("calls onClose when close button is pressed", async () => {
    mockedQuoteLease.mockResolvedValue({
      resourceId: "res-123",
      tier: 0,
      creator: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
      price: "1000000",
    });

    const onClose = jest.fn();
    const onLeasePurchased = jest.fn();

    const { getByText } = render(
      <LeaseSheet
        visible={true}
        resource={createResource()}
        price="5.00"
        onClose={onClose}
        onLeasePurchased={onLeasePurchased}
      />
    );

    fireEvent.press(getByText("✕"));
    expect(onClose).toHaveBeenCalled();
  });
});
