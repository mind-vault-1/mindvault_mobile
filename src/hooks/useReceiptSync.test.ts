import { act, renderHook } from "@testing-library/react-native";

import { requestReceiptSync } from "../services/receiptSync";
import { saveReceipt } from "../services/receipts";
import { useAppForeground } from "./useAppForeground";
import { useReceiptSync } from "./useReceiptSync";

jest.mock("../services/receiptSync", () => ({ requestReceiptSync: jest.fn() }));
jest.mock("./useAppForeground", () => ({ useAppForeground: jest.fn() }));

const mockedRequestSync = requestReceiptSync as jest.MockedFunction<typeof requestReceiptSync>;
const mockedUseAppForeground = useAppForeground as jest.MockedFunction<typeof useAppForeground>;

beforeEach(() => {
  jest.clearAllMocks();
});

it("syncs on mount, on app foreground and after a successful payment", async () => {
  renderHook(() => useReceiptSync());
  expect(mockedRequestSync).toHaveBeenCalledTimes(1);

  mockedUseAppForeground.mock.calls[0][0]();
  expect(mockedRequestSync).toHaveBeenCalledTimes(2);

  // A saved receipt is a successful payment: the sync must be requested again.
  await act(async () => {
    await saveReceipt({
      resourceId: "res-1",
      title: "Stellar handbook",
      amount: "15000000",
      asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      network: "testnet",
      txHash: "tx-1",
      payer: "GPAY",
      paidAt: "2026-01-01T12:00:00.000Z",
    });
  });
  expect(mockedRequestSync).toHaveBeenCalledTimes(3);
});

it("stays quiet until it is enabled", () => {
  renderHook(() => useReceiptSync(false));

  expect(mockedRequestSync).not.toHaveBeenCalled();
  mockedUseAppForeground.mock.calls[0][0]();
  expect(mockedRequestSync).not.toHaveBeenCalled();
});
