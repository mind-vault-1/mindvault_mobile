import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { describeEntry, LeaderboardScreen } from "./LeaderboardScreen";
import { fetchLeaderboard, type LeaderboardEntry } from "../api/publishers";
import { fetchAgentStatus } from "../api/verification";
import { ThemeProvider } from "../theme/ThemeProvider";

jest.mock("../api/publishers", () => ({ fetchLeaderboard: jest.fn() }));
jest.mock("../api/verification", () => ({
  fetchAgentStatus: jest.fn(),
  formatConfidence: jest.requireActual("../api/verification").formatConfidence,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockFetch = fetchLeaderboard as jest.MockedFunction<typeof fetchLeaderboard>;
const mockFetchAgent = fetchAgentStatus as jest.MockedFunction<typeof fetchAgentStatus>;
const navigation = { navigate: jest.fn() } as any;

const entry = (over: Partial<LeaderboardEntry>): LeaderboardEntry => ({
  id: "p1",
  name: "Ada Publishing",
  walletAddress: "GADA",
  joinedAt: "2024-01-01T00:00:00Z",
  totalResources: 3,
  listedResources: 2,
  verifiedResources: 1,
  totalSales: 4,
  totalEarned: "12.5000",
  ...over,
});

async function renderScreen() {
  const screen = render(
    <ThemeProvider>
      <LeaderboardScreen
        route={{ key: "Leaderboard", name: "Leaderboard" }}
        navigation={navigation}
      />
    </ThemeProvider>
  );
  await act(async () => {});
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAgent.mockResolvedValue({
    verificationsProcessed: 1240,
    approvalRate: 0.95,
    earnings: "150.00",
    status: "active",
  });
});

describe("LeaderboardScreen", () => {
  it("renders a ranked list with earnings and resource count", async () => {
    mockFetch.mockResolvedValue([
      entry({}),
      entry({ id: "p2", name: "Bo", walletAddress: "GBO", totalEarned: "3.0000", totalResources: 1, totalSales: 1 }),
    ]);
    const { getByText, getByLabelText } = await renderScreen();
    expect(getByText("Ada Publishing")).toBeTruthy();
    expect(getByText("12.5000 USDC")).toBeTruthy();
    expect(getByText("3 resources · 4 sales")).toBeTruthy();
    expect(
      getByLabelText("Rank 2 of 2, Bo, earned 3.0000 USDC from 1 sale, 1 resource")
    ).toBeTruthy();
  });

  it("opens the public profile when an entry is tapped", async () => {
    mockFetch.mockResolvedValue([entry({})]);
    const { getByLabelText } = await renderScreen();
    fireEvent.press(getByLabelText(/Rank 1 of 1, Ada Publishing/));
    expect(navigation.navigate).toHaveBeenCalledWith("PublisherPublic", { address: "GADA" });
  });

  it("refetches on pull to refresh", async () => {
    mockFetch.mockResolvedValue([entry({})]);
    const { UNSAFE_getByType } = await renderScreen();
    const { RefreshControl } = require("react-native");
    await act(async () => {
      UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("shows an error with retry, then the list", async () => {
    mockFetch.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce([entry({})]);
    const { getByText, getByLabelText } = await renderScreen();
    expect(getByText("boom")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByLabelText("Retry loading leaderboard"));
    });
    expect(getByText("Ada Publishing")).toBeTruthy();
  });

  it("shows an empty state", async () => {
    mockFetch.mockResolvedValue([]);
    const { getByText } = await renderScreen();
    expect(getByText("No publishers yet")).toBeTruthy();
  });

  it("describes a singular entry for screen readers", () => {
    expect(describeEntry(entry({ totalSales: 1, totalResources: 1 }), 1, 5)).toBe(
      "Rank 1 of 5, Ada Publishing, earned 12.5000 USDC from 1 sale, 1 resource"
    );
  });

  it("renders the AI verification agent status card with accessible numbers", async () => {
    mockFetch.mockResolvedValue([entry({})]);
    mockFetchAgent.mockResolvedValue({
      verificationsProcessed: 1240,
      approvalRate: 0.95,
      earnings: "150.00",
      status: "active",
    });

    const { getByText, getByLabelText } = await renderScreen();

    expect(getByText("AI Verification Agent")).toBeTruthy();
    expect(getByText("1,240")).toBeTruthy();
    expect(getByText("95%")).toBeTruthy();
    expect(getByText("150.00 USDC")).toBeTruthy();

    expect(getByLabelText("1,240 verifications processed")).toBeTruthy();
    expect(getByLabelText("Approval rate 95%")).toBeTruthy();
    expect(getByLabelText("Total earnings 150.00 USDC")).toBeTruthy();
  });

  it("renders agent status error with a retry button", async () => {
    mockFetch.mockResolvedValue([entry({})]);
    mockFetchAgent
      .mockRejectedValueOnce(new Error("Agent offline"))
      .mockResolvedValueOnce({
        verificationsProcessed: 50,
        approvalRate: 1,
        earnings: "10.00",
      });

    const { getByText, getByLabelText } = await renderScreen();

    expect(getByText("Agent offline")).toBeTruthy();
    const retryButton = getByLabelText("Retry loading agent status");
    expect(retryButton).toBeTruthy();

    await act(async () => {
      fireEvent.press(retryButton);
    });

    expect(mockFetchAgent).toHaveBeenCalledTimes(2);
    expect(getByText("50")).toBeTruthy();
    expect(getByText("100%")).toBeTruthy();
  });
});
