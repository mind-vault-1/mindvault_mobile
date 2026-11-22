import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";

import { fetchAnalytics, fetchMe, type PublisherAnalytics } from "../api/publishers";
import { renderWithProviders } from "../test-utils";
import { PublisherAnalyticsScreen } from "./PublisherAnalyticsScreen";
import { PublisherProfileScreen } from "./PublisherProfileScreen";

jest.mock("../api/publishers");
jest.mock("../services/secureStorage", () => ({ clearApiKey: jest.fn(), storeApiKey: jest.fn() }));
jest.mock("react-native-safe-area-context", () => require("../test-utils").safeAreaMock());
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

const mockFetchAnalytics = fetchAnalytics as jest.MockedFunction<typeof fetchAnalytics>;
const mockFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const analytics: PublisherAnalytics = {
  summary: {
    totalEarned: "12.5000", currency: "USDC", totalSales: 7, totalResources: 3, listedResources: 2,
    verification: { verified: 1, rejected: 1, pending: 1 },
  },
  resources: [
    { id: "low", title: "Small guide", price: "1.2500", totalSales: 2, totalEarned: "2.5000", recentPayments: [] },
    { id: "high", title: "Stellar handbook", price: "2.0000", totalSales: 5, totalEarned: "10.0000", recentPayments: [
      { payerAddress: "G-public-payer-address", amount: "2.0000", paidAt: "2026-10-01T10:00:00Z" },
    ] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAnalytics.mockResolvedValue(analytics);
});

it("shows loading while the analytics request is pending", async () => {
  mockFetchAnalytics.mockReturnValue(new Promise(() => {}));
  const screen = renderWithProviders(<PublisherAnalyticsScreen />);
  await waitFor(() => expect(screen.getByLabelText("Loading publisher analytics")).toBeTruthy());
});

it("renders the server's totals, verification counts, payments and earnings order", async () => {
  const screen = renderWithProviders(<PublisherAnalyticsScreen />);
  expect(await screen.findByLabelText("Earned 12.50 USDC from 7 sales")).toBeTruthy();
  expect(screen.getByText("3 resources · 2 listed")).toBeTruthy();
  expect(screen.getByText("1 verified")).toBeTruthy();
  expect(screen.getByText("1 rejected")).toBeTruthy();
  expect(screen.getByText("1 pending")).toBeTruthy();
  expect(screen.getByText("10.00 USDC earned")).toBeTruthy();
  expect(screen.getByLabelText("Payer G-public-payer-address")).toBeTruthy();
  expect(screen.getByText("2.00 USDC")).toBeTruthy();
  expect(screen.getAllByTestId(/^analytics-resource-/).map((row) => row.props.testID)).toEqual([
    "analytics-resource-high", "analytics-resource-low",
  ]);
  expect(analytics.resources[0].id).toBe("low");
});

it("keeps precision for small USDC earnings", async () => {
  mockFetchAnalytics.mockResolvedValue({ ...analytics, summary: { ...analytics.summary, totalEarned: "0.0001" } });
  const screen = renderWithProviders(<PublisherAnalyticsScreen />);
  expect(await screen.findByLabelText("Earned 0.0001 USDC from 7 sales")).toBeTruthy();
});

it("explains the empty state and keeps zero totals visible", async () => {
  mockFetchAnalytics.mockResolvedValue({ summary: {
    totalEarned: "0.0000", currency: "USDC", totalSales: 0, totalResources: 0, listedResources: 0,
    verification: { verified: 0, rejected: 0, pending: 0 },
  }, resources: [] });
  const screen = renderWithProviders(<PublisherAnalyticsScreen />);
  expect(await screen.findByText("No resources yet")).toBeTruthy();
  expect(screen.getByLabelText("Earned 0.00 USDC from 0 sales")).toBeTruthy();
  expect(screen.getByText("Publish a resource to start tracking sales and earnings here.")).toBeTruthy();
});

it("surfaces an API error and retries successfully", async () => {
  mockFetchAnalytics.mockRejectedValueOnce(new Error("Unauthorized: Invalid API key"));
  const screen = renderWithProviders(<PublisherAnalyticsScreen />);
  expect((await screen.findByRole("alert")).props.children).toBe("Unauthorized: Invalid API key");
  fireEvent.press(screen.getByRole("button", { name: "Retry loading analytics" }));
  expect(await screen.findByLabelText("Earned 12.50 USDC from 7 sales")).toBeTruthy();
  expect(mockFetchAnalytics).toHaveBeenCalledTimes(2);
});

it("opens analytics from the publisher profile", async () => {
  mockFetchMe.mockResolvedValue({ id: "pub", name: "Publisher", email: "publisher@example.com", walletAddress: "G-public-wallet", createdAt: "2026-01-01T00:00:00Z" });
  const screen = renderWithProviders(<PublisherProfileScreen />);
  fireEvent.press(await screen.findByRole("button", { name: "View publisher analytics" }));
  expect(mockNavigate).toHaveBeenCalledWith("PublisherAnalytics");
});
