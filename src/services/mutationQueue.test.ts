import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError } from "../api/client";
import {
  describeMutation,
  enqueueMutation,
  flushMutations,
  listMutations,
  resetMutationRunners,
  retryMutation,
  setMutationRunner,
  type QueuedMutation,
} from "./mutationQueue";

jest.mock("../utils/errorLogger", () => ({ logError: jest.fn() }));

beforeEach(async () => {
  jest.clearAllMocks();
  resetMutationRunners();
  await AsyncStorage.clear();
});

const publish = (title: string) => ({
  kind: "publish" as const,
  payload: {
    title,
    input: { title, url: "https://example.com/r", price: "1.00", description: "" },
  },
  idempotencyKey: `publish:${title}`,
});

const lease = (title: string) => ({
  kind: "lease" as const,
  payload: { resourceId: `res-${title}`, tier: 1 as const, title },
  idempotencyKey: `lease:res-${title}:1`,
});

const delist = (title: string) => ({
  kind: "delist" as const,
  payload: { resourceId: `res-${title}`, title },
  idempotencyKey: `delist:res-${title}`,
});

it("persists a queued action with a stable id, payload and idempotency key", async () => {
  const entry = await enqueueMutation(publish("Stellar handbook"));

  const raw = await AsyncStorage.getItem("@mindvault_mutation_queue");
  expect(raw).toBeTruthy();
  const stored = JSON.parse(raw as string) as { mutations: QueuedMutation[] };
  expect(stored.mutations).toHaveLength(1);
  expect(stored.mutations[0]).toMatchObject({
    id: entry.id,
    kind: "publish",
    idempotencyKey: "publish:Stellar handbook",
    status: "pending",
  });
  expect(stored.mutations[0].payload).toMatchObject({ title: "Stellar handbook" });

  // The id is stable across reads.
  expect((await listMutations())[0].id).toBe(entry.id);
});

it("deduplicates by idempotency key", async () => {
  const first = await enqueueMutation(publish("Stellar handbook"));
  const second = await enqueueMutation(publish("Stellar handbook"));

  expect(second.id).toBe(first.id);
  expect(await listMutations()).toHaveLength(1);
});

it("replays queued actions in FIFO order and removes successful entries", async () => {
  const order: string[] = [];
  const completed: string[] = [];
  for (const kind of ["publish", "lease", "delist"] as const) {
    setMutationRunner(kind, async (mutation) => {
      order.push(`${mutation.kind}:${describeMutation(mutation)}`);
    });
  }

  await enqueueMutation(publish("A"));
  await enqueueMutation(lease("B"));
  await enqueueMutation(delist("C"));

  const result = await flushMutations({
    onCompleted: (mutation) => completed.push(describeMutation(mutation)),
  });

  expect(order).toEqual(['publish:Publish "A"', "lease:Lease \"B\"", 'delist:Delist "C"']);
  expect(completed).toEqual(['Publish "A"', 'Lease "B"', 'Delist "C"']);
  expect(result.completed).toHaveLength(3);
  expect(await listMutations()).toHaveLength(0);
});

it("keeps permanent failures in the queue with a retry action and continues the drain", async () => {
  setMutationRunner("publish", async (mutation) => {
    if (mutation.payload.title === "B") throw new Error("Server rejected the title.");
  });

  await enqueueMutation(publish("A"));
  await enqueueMutation(publish("B"));
  await enqueueMutation(publish("C"));

  const result = await flushMutations();

  expect(result.completed.map((entry) => entry.payload.title)).toEqual(["A", "C"]);
  expect(result.failed.map((entry) => entry.payload.title)).toEqual(["B"]);

  const remaining = await listMutations();
  expect(remaining).toHaveLength(1);
  expect(remaining[0]).toMatchObject({
    status: "failed",
    attempts: 1,
    lastError: "Server rejected the title.",
    payload: { title: "B" },
  });

  // The retry action re-runs the failed entry and clears it on success.
  setMutationRunner("publish", async () => {});
  await retryMutation(remaining[0].id);
  expect(await listMutations()).toHaveLength(0);
});

it("leaves transient failures pending so the next drain retries them", async () => {
  setMutationRunner(
    "delist",
    async () => {
      throw new ApiError("network", "Network error. Please check your connection.");
    }
  );
  await enqueueMutation(delist("Offline paper"));

  const result = await flushMutations();

  expect(result.completed).toHaveLength(0);
  const remaining = await listMutations();
  expect(remaining[0]).toMatchObject({ status: "pending", attempts: 1 });
});

it("runs entries of every kind through their own runner", async () => {
  const calls: string[] = [];
  setMutationRunner("publish", async () => {
    calls.push("publish");
  });
  setMutationRunner("lease", async () => {
    calls.push("lease");
  });
  setMutationRunner("delist", async () => {
    calls.push("delist");
  });

  await enqueueMutation(lease("B"));
  await enqueueMutation(delist("C"));
  await enqueueMutation(publish("A"));
  await flushMutations();

  // FIFO by enqueue time, not by kind.
  expect(calls).toEqual(["lease", "delist", "publish"]);
});

it("keeps a queued lease as a permanent failure because purchases need the buyer's signature", async () => {
  await enqueueMutation(lease("Book"));

  const result = await flushMutations();

  expect(result.completed).toHaveLength(0);
  const remaining = await listMutations();
  expect(remaining[0].status).toBe("failed");
  expect(remaining[0].lastError).toMatch(/needs your confirmation/);
});
