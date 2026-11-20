import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearReceipts, getReceipt, listReceipts, MAX_RECEIPTS, RECEIPTS_STORAGE_KEY, saveReceipt, type PaymentReceipt } from "./receipts";

function receipt(index = 0): PaymentReceipt {
  return {
    resourceId: `r${index}`, title: "Handbook", amount: "12500000", asset: "USDC-contract",
    network: "stellar:testnet", txHash: `tx-${index}`, payer: "public-address",
    paidAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
  };
}

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

it("persists public fields, lists newest first and gets by transaction hash", async () => {
  await saveReceipt(receipt(2));
  await saveReceipt({ ...receipt(1), secret: "must-not-persist", transaction: "signed-xdr" } as PaymentReceipt);
  expect(await listReceipts()).toEqual([receipt(2), receipt(1)]);
  expect(await getReceipt("tx-1")).toEqual(receipt(1));
  expect(await getReceipt("missing")).toBeNull();
  const stored = await AsyncStorage.getItem(RECEIPTS_STORAGE_KEY);
  expect(stored).not.toContain("must-not-persist");
  expect(stored).not.toContain("signed-xdr");
});

it("caps at the newest 200 receipts without losing simultaneous saves", async () => {
  await Promise.all(Array.from({ length: MAX_RECEIPTS + 2 }, (_, index) => saveReceipt(receipt(index))));
  const saved = await listReceipts();
  expect(saved).toHaveLength(MAX_RECEIPTS);
  expect(saved[0]).toEqual(receipt(MAX_RECEIPTS + 1));
  expect(saved[saved.length - 1]).toEqual(receipt(2));
});

it("deduplicates by transaction hash", async () => {
  await saveReceipt(receipt());
  await saveReceipt({ ...receipt(), title: "Updated title" });
  expect(await listReceipts()).toEqual([{ ...receipt(), title: "Updated title" }]);
});

it("clears receipts in order even with pending saves", async () => {
  const saved = saveReceipt(receipt());
  const cleared = clearReceipts();
  await Promise.all([saved, cleared]);
  expect(await listReceipts()).toEqual([]);
});

it.each([null, "[]", JSON.stringify({ version: 0, receipts: [] }), "bad json"])("migrates an empty or unreadable store (%s)", async (raw) => {
  if (raw !== null) await AsyncStorage.setItem(RECEIPTS_STORAGE_KEY, raw);
  expect(await listReceipts()).toEqual([]);
  expect(JSON.parse((await AsyncStorage.getItem(RECEIPTS_STORAGE_KEY))!)).toEqual({ version: 1, receipts: [] });
});

it.each([
  () => [receipt(1), receipt(2), { nonsense: true }],
  () => ({ version: 0, receipts: [receipt(1), receipt(2)] }),
  () => ({ receipts: [receipt(1), receipt(2)] }),
])("migrates old receipts without discarding valid public data", async (oldData) => {
  await AsyncStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(oldData()));
  expect(await listReceipts()).toEqual([receipt(2), receipt(1)]);
  expect(JSON.parse((await AsyncStorage.getItem(RECEIPTS_STORAGE_KEY))!).version).toBe(1);
});

it("does not overwrite a future version", async () => {
  const raw = JSON.stringify({ version: 2, receipts: [receipt()] });
  await AsyncStorage.setItem(RECEIPTS_STORAGE_KEY, raw);
  await expect(saveReceipt(receipt(1))).rejects.toThrow("newer app version");
  expect(await AsyncStorage.getItem(RECEIPTS_STORAGE_KEY)).toBe(raw);
});

it("recovers the queue after a failed write", async () => {
  await listReceipts();
  jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("Storage full"));
  await expect(saveReceipt(receipt(1))).rejects.toThrow("Storage full");
  await saveReceipt(receipt(2));
  expect(await listReceipts()).toEqual([receipt(2)]);
});

describe("migration, cap and clear", () => {
  it("migrates a version 0 array and drops rows with bad amounts or dates", async () => {
    await AsyncStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify([
      receipt(1),
      { ...receipt(2), amount: "1.5" },
      { ...receipt(3), paidAt: "not-a-date" },
      { ...receipt(4), txHash: "" },
      { ...receipt(5), resourceId: 42 },
    ]));
    expect(await listReceipts()).toEqual([receipt(1)]);
    expect(JSON.parse((await AsyncStorage.getItem(RECEIPTS_STORAGE_KEY))!)).toEqual({ version: 1, receipts: [receipt(1)] });
  });

  it("caps an oversized migrated store to the newest receipts", async () => {
    const old = Array.from({ length: MAX_RECEIPTS + 5 }, (_, index) => receipt(index));
    await AsyncStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify(old));
    const saved = await listReceipts();
    expect(saved).toHaveLength(MAX_RECEIPTS);
    expect(saved[0].txHash).toBe(`tx-${MAX_RECEIPTS + 4}`);
    expect(saved.some((row) => row.txHash === "tx-0")).toBe(false);
  });

  it("clears to an empty versioned envelope", async () => {
    await saveReceipt(receipt(1));
    await clearReceipts();
    expect(JSON.parse((await AsyncStorage.getItem(RECEIPTS_STORAGE_KEY))!)).toEqual({ version: 1, receipts: [] });
    expect(await getReceipt("tx-1")).toBeNull();
  });
});

describe("merge with on-chain history", () => {
  // Shape the purchase history maps on-chain payments into before merging.
  function fromChain(index: number, overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
    return { ...receipt(index), title: "From chain", ...overrides };
  }

  it("keeps one row per transaction hash when a local receipt matches an on-chain one", async () => {
    await saveReceipt(receipt(1));
    await saveReceipt(fromChain(1));
    await saveReceipt(fromChain(2));
    const saved = await listReceipts();
    expect(saved.map((row) => row.txHash)).toEqual(["tx-2", "tx-1"]);
    expect(saved.find((row) => row.txHash === "tx-1")?.title).toBe("From chain");
  });

  it("de-duplicates repeated hashes in old data, keeping the newest row", async () => {
    await AsyncStorage.setItem(RECEIPTS_STORAGE_KEY, JSON.stringify({
      version: 1,
      receipts: [receipt(1), { ...receipt(1), title: "Newer", paidAt: new Date(Date.UTC(2026, 9, 2)).toISOString() }],
    }));
    const saved = await listReceipts();
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe("Newer");
  });

  it("sorts merged local and on-chain rows newest first", async () => {
    await saveReceipt(fromChain(5));
    await saveReceipt(receipt(3));
    await saveReceipt(fromChain(4));
    expect((await listReceipts()).map((row) => row.txHash)).toEqual(["tx-5", "tx-4", "tx-3"]);
  });
});
