import { Share } from "react-native";
import { act, fireEvent } from "@testing-library/react-native";

import type { PaymentReceipt } from "../services/receipts";
import { renderWithProviders } from "../test-utils";
import { ReceiptExportButton } from "./ReceiptExportButton";

const recent: PaymentReceipt = {
  resourceId: "res-1",
  title: "Handbook",
  amount: "12500000",
  asset: "CASSET",
  network: "stellar:testnet",
  txHash: "tx-1",
  payer: "GPAYER",
  paidAt: new Date().toISOString(),
};

const old: PaymentReceipt = { ...recent, txHash: "tx-old", paidAt: "2020-03-01T00:00:00.000Z" };

let shareSpy: jest.SpyInstance;

beforeEach(() => {
  shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
});

afterEach(() => {
  shareSpy.mockRestore();
});

function sharedText(): string {
  return (shareSpy.mock.calls[0][0] as { message: string }).message;
}

it("shares every receipt as JSON by default", async () => {
  const screen = renderWithProviders(<ReceiptExportButton receipts={[recent, old]} />);
  expect(screen.getByText("Export 2 receipts as JSON")).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Export receipts"));
  });

  expect(shareSpy).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('"schemaVersion": 1') })
  );
  expect(JSON.parse(sharedText()).receipts).toHaveLength(2);
});

it("exports CSV for the chosen range", async () => {
  const screen = renderWithProviders(<ReceiptExportButton receipts={[recent, old]} />);

  fireEvent.press(screen.getByLabelText("CSV"));
  fireEvent.press(screen.getByLabelText("This year"));
  expect(screen.getByText("Export 1 receipt as CSV")).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Export receipts"));
  });

  const lines = sharedText().split("\r\n").filter(Boolean);
  expect(lines[0]).toBe("paidAt,title,resourceId,amount,asset,network,txHash,payer");
  expect(lines).toHaveLength(2);
});

it("does not share when the chosen range has no receipts", async () => {
  const screen = renderWithProviders(<ReceiptExportButton receipts={[old]} />);

  fireEvent.press(screen.getByLabelText("This year"));
  expect(screen.getByText("No receipts to export")).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Export receipts"));
  });
  expect(shareSpy).not.toHaveBeenCalled();
});

it("reports a failed share instead of failing silently", async () => {
  shareSpy.mockRejectedValueOnce(new Error("Share unavailable"));
  const screen = renderWithProviders(<ReceiptExportButton receipts={[recent]} />);

  await act(async () => {
    fireEvent.press(screen.getByLabelText("Export receipts"));
  });

  expect(await screen.findByText("Unable to share receipts.")).toBeTruthy();
});
