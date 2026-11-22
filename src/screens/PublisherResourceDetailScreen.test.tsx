import React from "react";
import { Linking } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { PublisherResourceDetailScreen, RESOURCE_NOT_FOUND_MESSAGE } from "./PublisherResourceDetailScreen";
import { ToastProvider } from "../components/ToastProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { delistResource, fetchPublisherResources } from "../api/resources";
import { fetchAnalytics } from "../api/publishers";
import type { Resource } from "../types";

jest.mock("../api/resources", () => ({
  fetchPublisherResources: jest.fn(),
  delistResource: jest.fn(),
  getApiBaseUrl: jest.fn(() => "https://api.mindvault.test"),
  DEFAULT_STELLAR_NETWORK: "testnet",
  DEFAULT_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
}));
jest.mock("../api/publishers", () => ({ fetchAnalytics: jest.fn() }));
jest.mock("../utils/errorLogger", () => ({ logError: jest.fn() }));
jest.mock("react-native-safe-area-context", () => require("../test-utils").safeAreaMock());

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
let mockResourceId = "res-1";
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { resourceId: mockResourceId } }),
}));

jest.mock("../components/TransferOwnershipModal", () => {
  const { Pressable, Text } = require("react-native");
  return {
    TransferOwnershipModal: ({ onSuccess }: any) => (
      <Pressable accessibilityLabel="mock transfer success" onPress={() => onSuccess("tx-transfer")}>
        <Text>transfer-modal</Text>
      </Pressable>
    ),
  };
});
jest.mock("../components/RegisterModal", () => {
  const { Pressable, Text } = require("react-native");
  return {
    RegisterModal: ({ onSuccess }: any) => (
      <Pressable accessibilityLabel="mock register success" onPress={() => onSuccess("Registered!", "abcdef1234567890")}>
        <Text>register-modal</Text>
      </Pressable>
    ),
  };
});

const mockedFetchResources = fetchPublisherResources as jest.Mock;
const mockedFetchAnalytics = fetchAnalytics as jest.Mock;
const mockedDelist = delistResource as jest.Mock;

const WALLET = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "res-1",
    title: "Stellar Handbook",
    price: "2.50",
    resourceType: "file",
    walletAddress: WALLET,
    verificationStatus: "verified",
    onchainStatus: "none",
    listed: true,
    accessUrl: "https://example.com/file",
    publishedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const analytics = {
  summary: {
    totalEarned: "12.5000", currency: "USDC", totalSales: 5, totalResources: 1, listedResources: 1,
    verification: { verified: 1, rejected: 0, pending: 0 },
  },
  resources: [
    {
      id: "res-1", title: "Stellar Handbook", price: "2.50", totalSales: 5, totalEarned: "12.5000",
      recentPayments: [{ payerAddress: "GPAYERADDRESS123456", amount: "2.5000", paidAt: "2026-10-10T00:00:00.000Z" }],
    },
  ],
};

function detail() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <PublisherResourceDetailScreen />
      </ToastProvider>
    </ThemeProvider>
  );
}

function renderScreen() {
  return render(detail());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResourceId = "res-1";
  mockedFetchResources.mockResolvedValue([resource({ id: "other", title: "Other" }), resource()]);
  mockedFetchAnalytics.mockResolvedValue(analytics);
});

it("shows a loading state, then the stats and on-chain info", async () => {
  const screen = renderScreen();
  expect(screen.getByLabelText("Loading resource")).toBeTruthy();

  expect(await screen.findByLabelText("Sales: 5")).toBeTruthy();
  expect(screen.getByLabelText("Earned: 12.5000 USDC")).toBeTruthy();
  expect(screen.getByText("2.5000 USDC")).toBeTruthy();
  expect(screen.getByText("Stellar Handbook")).toBeTruthy();
  expect(screen.queryByText("Other")).toBeNull();
  expect(screen.getByText("Not registered")).toBeTruthy();
  expect(screen.getByLabelText(`View owner ${WALLET} on Stellar Expert`)).toBeTruthy();
});

it("offers every publisher action", async () => {
  const screen = renderScreen();
  await screen.findByLabelText("Sales: 5");
  for (const name of [
    "Edit price for Stellar Handbook",
    "Register Stellar Handbook on-chain",
    "Transfer ownership of Stellar Handbook",
    "Delist Stellar Handbook",
  ]) {
    expect(screen.getByRole("button", { name })).toBeTruthy();
  }
});

it("links the registration transaction to the explorer", async () => {
  mockedFetchResources.mockResolvedValue([resource({ onchainStatus: "registered", onchainTxHash: "deadbeefcafe1234" })]);
  jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
  const openSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const screen = renderScreen();

  fireEvent.press(await screen.findByLabelText("View transaction deadbeefcafe1234 on Stellar Expert"));
  await waitFor(() => expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/tx/deadbeefcafe1234")));
});

it("still shows the resource when stats fail", async () => {
  mockedFetchAnalytics.mockRejectedValue(new Error("Analytics down"));
  const screen = renderScreen();
  expect(await screen.findByText("Stats unavailable: Analytics down")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delist Stellar Handbook" })).toBeTruthy();
});

it("clears stale stats when the selected resource changes", async () => {
  const screen = renderScreen();
  expect(await screen.findByLabelText("Sales: 5")).toBeTruthy();

  mockResourceId = "res-2";
  mockedFetchResources.mockResolvedValue([
    resource({ id: "res-2", title: "Other Handbook" }),
  ]);
  mockedFetchAnalytics.mockResolvedValue({ ...analytics, resources: [] });
  screen.rerender(detail());

  expect(await screen.findByText("No sales recorded yet.")).toBeTruthy();
  expect(screen.queryByLabelText("Sales: 5")).toBeNull();
  expect(screen.getByText("Other Handbook")).toBeTruthy();
});

it("shows an error with retry when loading fails", async () => {
  mockedFetchResources.mockRejectedValueOnce(new Error("Unauthorized: Invalid API key"));
  const screen = renderScreen();
  expect(await screen.findByText("Unauthorized: Invalid API key")).toBeTruthy();

  fireEvent.press(screen.getByText("Retry"));
  expect(await screen.findByLabelText("Sales: 5")).toBeTruthy();
  expect(mockedFetchResources).toHaveBeenCalledTimes(2);
});

it("says when the resource is no longer owned and goes back on request", async () => {
  mockedFetchResources.mockResolvedValue([resource({ id: "other" })]);
  const screen = renderScreen();
  expect(await screen.findByText(RESOURCE_NOT_FOUND_MESSAGE)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Back to my resources"));
  expect(mockNavigation.goBack).toHaveBeenCalled();
});

it("delists after confirmation and goes back", async () => {
  mockedDelist.mockResolvedValue(undefined);
  const screen = renderScreen();
  fireEvent.press(await screen.findByRole("button", { name: "Delist Stellar Handbook" }));
  expect(screen.getByTestId("detail-delist-modal")).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Confirm delist"));
  });
  expect(mockedDelist).toHaveBeenCalledWith("res-1");
  expect(mockNavigation.goBack).toHaveBeenCalled();
});

it("keeps the delist dialog open with the error when delisting fails", async () => {
  mockedDelist.mockRejectedValue(new Error("Forbidden: Access denied"));
  const screen = renderScreen();
  fireEvent.press(await screen.findByRole("button", { name: "Delist Stellar Handbook" }));
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Confirm delist"));
  });
  expect(await screen.findByText("Forbidden: Access denied")).toBeTruthy();
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
});

it("updates on-chain info after registering", async () => {
  const screen = renderScreen();
  fireEvent.press(await screen.findByRole("button", { name: "Register Stellar Handbook on-chain" }));
  fireEvent.press(screen.getByLabelText("mock register success"));
  expect(await screen.findByLabelText("View transaction abcdef1234567890 on Stellar Expert")).toBeTruthy();
});

it("goes back after a transfer, since the resource changed owner", async () => {
  const screen = renderScreen();
  fireEvent.press(await screen.findByRole("button", { name: "Transfer ownership of Stellar Handbook" }));
  fireEvent.press(screen.getByLabelText("mock transfer success"));
  expect(mockNavigation.goBack).toHaveBeenCalled();
});
