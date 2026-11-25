import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Resource } from "../types";
import {
  dismissChecklist,
  getPublisherChecklist,
  isChecklistComplete,
  isChecklistDismissed,
} from "./onboarding";

function resource(overrides: Partial<Resource>): Resource {
  return {
    id: "r1",
    title: "R",
    price: "1",
    resourceType: "link",
    walletAddress: "G",
    verificationStatus: "pending",
    onchainStatus: "none",
    listed: true,
    accessUrl: "https://e.com",
    ...overrides,
  };
}

const done = (input: Parameters<typeof getPublisherChecklist>[0]) =>
  getPublisherChecklist(input).filter((s) => s.done).map((s) => s.id);

describe("getPublisherChecklist", () => {
  it("starts with nothing done", () => {
    expect(done({ hasApiKey: false, resources: [] })).toEqual([]);
  });

  it("ticks signup, publish, verification and registration from existing state", () => {
    expect(done({ hasApiKey: true, resources: [] })).toEqual(["signup"]);
    expect(done({ hasApiKey: true, resources: [resource({})] })).toEqual(["signup", "publish"]);
    expect(done({ hasApiKey: true, resources: [resource({ verificationStatus: "verified" })] })).toEqual([
      "signup",
      "publish",
      "verify",
    ]);
    const all = getPublisherChecklist({
      hasApiKey: true,
      resources: [resource({ verificationStatus: "verified", onchainStatus: "registered" })],
    });
    expect(isChecklistComplete(all)).toBe(true);
  });

  it("points open steps at the resource that needs them", () => {
    const pending = resource({ id: "p" });
    const verified = resource({ id: "v", verificationStatus: "verified" });
    const steps = getPublisherChecklist({ hasApiKey: true, resources: [pending, verified] });
    expect(steps.find((s) => s.id === "register")?.resource?.id).toBe("v");
  });
});

describe("dismissal", () => {
  beforeEach(() => AsyncStorage.clear());

  it("persists across reads", async () => {
    expect(await isChecklistDismissed()).toBe(false);
    await dismissChecklist();
    expect(await isChecklistDismissed()).toBe(true);
  });
});
