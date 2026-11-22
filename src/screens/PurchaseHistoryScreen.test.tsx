import { act, fireEvent } from "@testing-library/react-native";

import { clearReceipts, listReceipts, type PaymentReceipt } from "../services/receipts";
import { renderWithProviders } from "../test-utils";
import { openExternalUrl } from "../utils/stellarExpert";
import { formatUsdc, PurchaseHistoryScreen } from "./PurchaseHistoryScreen";

jest.mock("../services/receipts", () => ({
  listReceipts: jest.fn(),
  clearReceipts: jest.fn(),
}));
jest.mock("../services/wallet", () => ({ getPublicKey: jest.fn().mockResolvedValue(null) }));
jest.mock("../api/payments", () => ({ fetchBuyerPayments: jest.fn() }));
jest.mock("../utils/stellarExpert", () => ({
  ...jest.requireActual("../utils/stellarExpert"),
  openExternalUrl: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("react-native-safe-area-context", () => require("../test-utils").safeAreaMock());
// The screen reloads on focus; in tests, run the effect once on mount instead.
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockedListReceipts = listReceipts as jest.MockedFunction<typeof listReceipts>;
const mockedClearReceipts = clearReceipts as jest.MockedFunction<typeof clearReceipts>;
const mockedOpenExternalUrl = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

const receipts: PaymentReceipt[] = [
  {
    resourceId: "res-1",
    title: "Stellar handbook",
    amount: "12500000",
    asset: "CASSET",
    network: "stellar:testnet",
    txHash: "tx-newest",
    payer: "GPAYER",
    paidAt: "2026-10-10T09:00:00.000Z",
  },
  {
    resourceId: "res-2",
    title: "Field guide",
    amount: "1000000",
    asset: "CASSET",
    network: "stellar:testnet",
    txHash: "tx-older",
    payer: "GPAYER",
    paidAt: "2026-09-01T09:00:00.000Z",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockedOpenExternalUrl.mockResolvedValue(undefined);
});

it.each([
  ["0", "0.00 USDC"],
  ["1", "0.0000001 USDC"],
  ["1000000", "0.10 USDC"],
  ["12500000", "1.25 USDC"],
  ["100000000", "10.00 USDC"],
])("formats %s base units as %s", (atomic, expected) => {
  expect(formatUsdc(atomic)).toBe(expected);
});

it("lists receipts in the order they are stored, with amounts and explorer links", async () => {
  mockedListReceipts.mockResolvedValue(receipts);
  const screen = renderWithProviders(<PurchaseHistoryScreen />);

  expect(await screen.findByText("Stellar handbook")).toBeTruthy();
  expect(screen.getByText("1.25 USDC")).toBeTruthy();
  expect(screen.getByText("0.10 USDC")).toBeTruthy();

  const links = screen.getAllByLabelText(/View transaction .* on Stellar Expert/);
  expect(links.map((link) => link.props.accessibilityLabel)).toEqual([
    "View transaction tx-newest on Stellar Expert",
    "View transaction tx-older on Stellar Expert",
  ]);

  await act(async () => {
    fireEvent.press(screen.getByLabelText("View transaction tx-newest on Stellar Expert"));
  });
  expect(mockedOpenExternalUrl).toHaveBeenCalledWith(
    "https://stellar.expert/explorer/testnet/tx/tx-newest"
  );
});

it("explains the empty state and hides the clear action", async () => {
  mockedListReceipts.mockResolvedValue([]);
  const screen = renderWithProviders(<PurchaseHistoryScreen />);

  expect(await screen.findByText("No purchases yet")).toBeTruthy();
  expect(screen.queryByLabelText("Clear history")).toBeNull();
});

it("filters by title and says when nothing matches", async () => {
  mockedListReceipts.mockResolvedValue(receipts);
  const screen = renderWithProviders(<PurchaseHistoryScreen />);
  await screen.findByText("Stellar handbook");

  fireEvent.changeText(screen.getByLabelText("Search purchases"), "FIELD");
  expect(screen.queryByText("Stellar handbook")).toBeNull();
  expect(screen.getByText("Field guide")).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText("Search purchases"), "zzz");
  expect(screen.getByText("No matching purchases")).toBeTruthy();
});

it("asks for confirmation before clearing and only clears when confirmed", async () => {
  mockedListReceipts.mockResolvedValueOnce(receipts).mockResolvedValue([]);
  mockedClearReceipts.mockResolvedValue(undefined);
  const screen = renderWithProviders(<PurchaseHistoryScreen />);
  await screen.findByText("Stellar handbook");

  fireEvent.press(screen.getByLabelText("Clear history"));
  expect(screen.getByText("Clear purchase history?")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Cancel"));
  expect(mockedClearReceipts).not.toHaveBeenCalled();

  fireEvent.press(screen.getByLabelText("Clear history"));
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Confirm clear history"));
  });

  expect(mockedClearReceipts).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("No purchases yet")).toBeTruthy();
});

it("shows the storage error instead of an empty list", async () => {
  mockedListReceipts.mockRejectedValue(new Error("The receipt store was created by a newer app version."));
  const screen = renderWithProviders(<PurchaseHistoryScreen />);

  expect(await screen.findByText("The receipt store was created by a newer app version.")).toBeTruthy();
});

const mockedGetPublicKey = require("../services/wallet").getPublicKey as jest.Mock;
const mockedFetchBuyerPayments = require("../api/payments").fetchBuyerPayments as jest.Mock;

it("merges on-chain payments with local receipts and de-duplicates by transaction hash", async () => {
  mockedListReceipts.mockResolvedValue(receipts);
  mockedGetPublicKey.mockResolvedValue("Gbuyer");
  mockedFetchBuyerPayments.mockResolvedValue({
    payments: [
      {
        txHash: "tx-newest",
        resourceId: "res-1",
        resourceTitle: "Duplicate title",
        amount: "12500000",
        asset: "CASSET",
        network: "stellar:testnet",
        payer: "GPAYER",
        paidAt: "2026-10-10T09:00:00.000Z",
      },
      {
        txHash: "tx-chain",
        resourceId: "res-3",
        resourceTitle: "On-chain purchase",
        amount: "2000000",
        asset: "CASSET",
        network: "stellar:testnet",
        payer: "Gbuyer",
        paidAt: "2026-10-11T09:00:00.000Z",
      },
    ],
    nextOffset: 20,
  });

  const screen = renderWithProviders(<PurchaseHistoryScreen />);
  expect(await screen.findByText("On-chain purchase")).toBeTruthy();
  expect(screen.getAllByText("Saved on this device")).toHaveLength(2);
  expect(screen.getByText("On-chain payment")).toBeTruthy();
  expect(screen.getAllByLabelText("View transaction tx-newest on Stellar Expert")).toHaveLength(1);
  expect(mockedFetchBuyerPayments).toHaveBeenCalledWith("Gbuyer", { limit: 20, offset: 0 });
});

it("keeps local history available without a wallet", async () => {
  mockedListReceipts.mockResolvedValue(receipts);
  mockedGetPublicKey.mockResolvedValue(null);
  const screen = renderWithProviders(<PurchaseHistoryScreen />);
  expect(await screen.findByText("Stellar handbook")).toBeTruthy();
  expect(mockedFetchBuyerPayments).not.toHaveBeenCalled();
  expect(screen.queryByText("On-chain payment")).toBeNull();
});
