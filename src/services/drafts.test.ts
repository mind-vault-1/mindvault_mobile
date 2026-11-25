import AsyncStorage from "@react-native-async-storage/async-storage";

import { deleteServerDraft, listServerDrafts, saveServerDraft } from "../api/publish";
import { DRAFTS_KEY, deleteDraft, formatCountdown, listDrafts, saveDraft } from "./drafts";

jest.mock("../api/publish", () => ({
  listServerDrafts: jest.fn(),
  saveServerDraft: jest.fn(),
  deleteServerDraft: jest.fn(),
}));

const input = { title: "Guide", url: "https://e.com", price: "1", description: "" };

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.mocked(listServerDrafts).mockResolvedValue([]);
  jest.mocked(saveServerDraft).mockImplementation(async (d) => d);
  jest.mocked(deleteServerDraft).mockResolvedValue(undefined);
});

describe("drafts", () => {
  it("saves locally and mirrors to the server", async () => {
    const draft = await saveDraft(input);
    expect(saveServerDraft).toHaveBeenCalledWith(draft);
    expect(await listDrafts()).toEqual([draft]);
  });

  it("keeps the local copy when the server is unreachable", async () => {
    jest.mocked(saveServerDraft).mockRejectedValue(new Error("offline"));
    jest.mocked(listServerDrafts).mockRejectedValue(new Error("offline"));
    const draft = await saveDraft(input);
    expect(await listDrafts()).toEqual([draft]);
  });

  it("resumes drafts from another device, newest copy winning", async () => {
    await saveDraft(input, "shared", new Date("2026-01-01T00:00:00Z"));
    jest.mocked(listServerDrafts).mockResolvedValue([
      { id: "shared", input: { ...input, title: "Edited elsewhere" }, updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: "other", input: { ...input, title: "Remote only" }, updatedAt: "2025-12-31T00:00:00.000Z" },
    ]);
    const drafts = await listDrafts();
    expect(drafts.map((d) => d.input.title)).toEqual(["Edited elsewhere", "Remote only"]);
    expect(JSON.parse((await AsyncStorage.getItem(DRAFTS_KEY)) ?? "{}").drafts).toHaveLength(2);
  });

  it("updates in place and deletes everywhere on cancel", async () => {
    const first = await saveDraft(input);
    await saveDraft({ ...input, publishAt: "2026-12-01T09:00:00.000Z" }, first.id);
    expect(await listDrafts()).toHaveLength(1);
    await deleteDraft(first.id);
    expect(deleteServerDraft).toHaveBeenCalledWith(first.id);
    expect(await listDrafts()).toEqual([]);
  });

  it("only ever talks to the drafts endpoints, never the catalog", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await saveDraft(input);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  it("formats days, hours, minutes and past times", () => {
    expect(formatCountdown("2026-06-03T15:00:00.000Z", now)).toBe("2d 3h");
    expect(formatCountdown("2026-06-01T16:05:00.000Z", now)).toBe("4h 05m");
    expect(formatCountdown("2026-06-01T12:12:30.000Z", now)).toBe("12m 30s");
    expect(formatCountdown("2026-06-01T11:00:00.000Z", now)).toBe("Live now");
  });
});
