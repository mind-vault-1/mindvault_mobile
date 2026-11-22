import {
  BUNDLE_BUDGETS,
  MAX_PRODUCTION_DEPENDENCIES,
  countProductionDependencies,
  evaluateBudgets,
  formatBytes,
  parseBaseline,
  renderMarkdown,
  type BundleSizes,
} from "./check-bundle-size";

const budgets: BundleSizes = { android: 4_000_000, ios: 4_000_000, web: 2_000_000 };
const sizes: BundleSizes = { android: 3_900_000, ios: 3_800_000, web: 1_900_000 };

describe("evaluateBudgets", () => {
  it("passes when every platform and the dependency count are within budget", () => {
    const result = evaluateBudgets(sizes, 10, null, budgets, 10);

    expect(result.ok).toBe(true);
    expect(result.platforms.map((row) => row.overBudget)).toEqual([false, false, false]);
    expect(result.platforms.every((row) => row.delta === null)).toBe(true);
  });

  it("fails when one platform is over its budget", () => {
    const result = evaluateBudgets({ ...sizes, web: 2_000_001 }, 10, null, budgets, 10);

    expect(result.ok).toBe(false);
    expect(result.platforms.find((row) => row.platform === "web")?.overBudget).toBe(true);
    expect(result.platforms.find((row) => row.platform === "android")?.overBudget).toBe(false);
  });

  it("fails when a production dependency is added without raising the budget", () => {
    const result = evaluateBudgets(sizes, 11, null, budgets, 10);

    expect(result.ok).toBe(false);
    expect(result.dependencies).toEqual({ count: 11, budget: 10, overBudget: true });
  });

  it("reports the change against the baseline", () => {
    const baseline: BundleSizes = { android: 3_800_000, ios: 3_800_000, web: 2_000_000 };
    const result = evaluateBudgets(sizes, 10, baseline, budgets, 10);

    expect(result.platforms.map((row) => row.delta)).toEqual([100_000, 0, -100_000]);
  });

  it("defaults to the documented budgets", () => {
    const result = evaluateBudgets(BUNDLE_BUDGETS, MAX_PRODUCTION_DEPENDENCIES, null);

    expect(result.ok).toBe(true);
    expect(evaluateBudgets(BUNDLE_BUDGETS, MAX_PRODUCTION_DEPENDENCIES + 1, null).ok).toBe(false);
  });
});

describe("parseBaseline", () => {
  it("accepts a sizes file written by --out", () => {
    expect(parseBaseline({ android: 1, ios: 2, web: 3, extra: "ignored" })).toEqual({
      android: 1,
      ios: 2,
      web: 3,
    });
  });

  it.each([null, "sizes", [], { android: 1, ios: 2 }, { android: 1, ios: "2", web: 3 }])(
    "treats %p as no baseline",
    (raw) => {
      expect(parseBaseline(raw)).toBeNull();
    }
  );
});

describe("countProductionDependencies", () => {
  it("counts dependencies only", () => {
    expect(
      countProductionDependencies({ dependencies: { expo: "~52.0.0", react: "18.3.1" } })
    ).toBe(2);
    expect(countProductionDependencies({})).toBe(0);
  });
});

describe("renderMarkdown", () => {
  it("shows each platform's size, change and budget, and the dependency count", () => {
    const baseline: BundleSizes = { android: 3_800_000, ios: 3_800_000, web: 1_900_000 };
    const markdown = renderMarkdown(evaluateBudgets(sizes, 10, baseline, budgets, 10));

    expect(markdown).toContain("### Bundle size ✅");
    expect(markdown).toContain("| android | 3.72 MB | +97.7 KB (2.6%) | 3.81 MB | ok |");
    expect(markdown).toContain("| ios | 3.62 MB | 0 B | 3.81 MB | ok |");
    expect(markdown).toContain("Production dependencies: 10 of 10");
  });

  it("marks budget breaches and a missing baseline", () => {
    const markdown = renderMarkdown(evaluateBudgets({ ...sizes, web: 2_100_000 }, 11, null, budgets, 10));

    expect(markdown).toContain("### Bundle size ❌");
    expect(markdown).toContain("| web | 2.00 MB | n/a | 1.91 MB | over budget |");
    expect(markdown).toContain("Production dependencies: 11 of 10 (over budget)");
  });
});

describe("formatBytes", () => {
  it.each([
    [512, "512 B"],
    [2048, "2.0 KB"],
    [-2048, "-2.0 KB"],
    [3 * 1024 * 1024, "3.00 MB"],
  ])("formats %p as %p", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
