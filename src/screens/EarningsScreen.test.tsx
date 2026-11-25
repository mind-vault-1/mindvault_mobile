import React from "react";
import { Share } from "react-native";
import { fireEvent, waitFor } from "@testing-library/react-native";

import { fetchPayouts } from "../api/payouts";
import { renderWithProviders } from "../test-utils";
import { openExternalUrl } from "../utils/stellarExpert";
import { EarningsScreen } from "./EarningsScreen";

jest.mock("../api/payouts", () => ({ fetchPayouts: jest.fn() }));
jest.mock("../utils/stellarExpert", () => ({
  ...jest.requireActual("../utils/stellarExpert"),
  openExternalUrl: jest.fn().mockResolvedValue(undefined),
}));

const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  jest.mocked(fetchPayouts).mockResolvedValue([
    { id: "p", paidAt: recent, amount: "10", asset: "USDC", txHash: "TXHASHPAYOUT123456", network: "testnet", kind: "payout" },
    { id: "t", paidAt: recent, amount: "2", asset: "USDC", txHash: "TXHASHTIP", network: "testnet", kind: "tip" },
  ]);
});

it("lists payouts with explorer links and totals that exclude tips by default", async () => {
  const screen = renderWithProviders(<EarningsScreen />);
  expect(await screen.findByLabelText("Payout 10 USDC")).toBeTruthy();
  expect(screen.queryByText("2 USDC · tip")).toBeNull();

  fireEvent(screen.getByLabelText("Include tips"), "valueChange", true);
  expect(screen.getByText("12 USDC")).toBeTruthy();
  expect(screen.getByText("2 USDC · tip")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("View transaction TXHASHPAYOUT123456 on explorer"));
  expect(openExternalUrl).toHaveBeenCalledWith(expect.stringContaining("/tx/TXHASHPAYOUT123456"));
});

it("shares a CSV export for the chosen period", async () => {
  const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  const screen = renderWithProviders(<EarningsScreen />);
  await screen.findByLabelText("Payout 10 USDC");
  fireEvent.press(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(share).toHaveBeenCalled());
  const message = share.mock.calls[0][0].message ?? "";
  expect(message.startsWith("paidAt,kind,amount,asset,network,txHash")).toBe(true);
  expect(message).not.toContain("TXHASHTIP");
  share.mockRestore();
});
