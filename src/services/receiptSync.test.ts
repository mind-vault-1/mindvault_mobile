import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  MAX_LOCAL_ONLY_ATTEMPTS,
  syncReceipts,
} from "./receiptSync";
import { listReceipts, saveReceipt, type PaymentReceipt } from "./receipts";

jest.mock("../api/resources", () => ({ getApiBaseUrl: () => "https://api.test" }));
jest.mock("../utils/errorLogger", () => ({ logError: jest.fn() }));

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const page = (receipts: PaymentReceipt[], nextCursor: string | null = null) =>
  mockResponse(200, { receipts, nextCursor });

const receipt = (txHash: string, title: string): PaymentReceipt => ({
  resourceId: `res-${txHash}`,
  title,
  amount: "15000000",
  asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  network: "testnet",
  txHash,
  payer: "GPAY",
  paidAt: "2026-01-01T12:00:00.000Z",
});

let fetchMock: jest.Mock;

beforeEach(async () => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  await AsyncStorage.clear();
});

it("converges: adds server-only receipts and keeps local-only ones for a while", async () => {
  await saveReceipt(receipt("tx-b", "B"));
  await saveReceipt(receipt("tx-c", "C"));

  fetchMock.mockResolvedValueOnce(page([receipt("tx-a", "A"), receipt("tx-b", "B")]));
  const first = await syncReceipts();

  expect(first).toEqual({ added: 1, pendingLocal: 1 });
  expect((await listReceipts()).map((row) => row.txHash).sort()).toEqual(["tx-a", "tx-b", "tx-c"]);

  // Once the server knows about tx-c too, both sides match.
  fetchMock.mockResolvedValueOnce(
    page([receipt("tx-a", "A"), receipt("tx-b", "B"), receipt("tx-c", "C")])
  );
  await expect(syncReceipts()).resolves.toEqual({ added: 0, pendingLocal: 0 });
});

it("leaves the local store untouched when a 5xx lands mid-sync and converges on the next run", async () => {
  await saveReceipt(receipt("tx-b", "B"));

  fetchMock
    .mockResolvedValueOnce(page([receipt("tx-a", "A")], "cursor-1"))
    .mockResolvedValueOnce(mockResponse(500, {}));
  await expect(syncReceipts()).rejects.toThrow(/500/);

  // Nothing from the half-finished run was applied.
  expect((await listReceipts()).map((row) => row.txHash)).toEqual(["tx-b"]);

  fetchMock.mockResolvedValueOnce(page([receipt("tx-a", "A"), receipt("tx-b", "B")]));
  await syncReceipts();
  expect((await listReceipts()).map((row) => row.txHash).sort()).toEqual(["tx-a", "tx-b"]);
});

it("never writes duplicate rows", async () => {
  const serverRows = [receipt("tx-a", "A"), receipt("tx-b", "B"), receipt("tx-c", "C")];
  fetchMock.mockResolvedValue(page(serverRows));

  await syncReceipts();
  await syncReceipts();
  await saveReceipt(receipt("tx-a", "A"));
  await syncReceipts();

  const rows = await listReceipts();
  expect(rows).toHaveLength(3);
  for (const row of serverRows) {
    expect(rows.filter((entry) => entry.txHash === row.txHash)).toHaveLength(1);
  }
});

it("pages through GET /receipts with a cursor", async () => {
  fetchMock
    .mockResolvedValueOnce(page([receipt("tx-a", "A")], "cursor-1"))
    .mockResolvedValueOnce(page([receipt("tx-b", "B")], null));

  await syncReceipts();

  expect(fetchMock.mock.calls[0][0]).toContain("limit=50");
  expect(fetchMock.mock.calls[0][0]).not.toContain("cursor=");
  expect(fetchMock.mock.calls[1][0]).toContain("cursor=cursor-1");
  expect((await listReceipts()).map((row) => row.txHash).sort()).toEqual(["tx-a", "tx-b"]);
});

it("retries local-only receipts for a limited number of attempts", async () => {
  await saveReceipt(receipt("tx-c", "C"));
  fetchMock.mockResolvedValue(page([]));

  for (let run = 0; run < MAX_LOCAL_ONLY_ATTEMPTS + 3; run++) {
    await syncReceipts();
  }

  const state = JSON.parse(
    (await AsyncStorage.getItem("@mindvault_receipt_sync")) as string
  ) as { attempts: Record<string, number> };
  expect(state.attempts["tx-c"]).toBe(MAX_LOCAL_ONLY_ATTEMPTS);
  expect((await listReceipts()).map((row) => row.txHash)).toEqual(["tx-c"]);
});
