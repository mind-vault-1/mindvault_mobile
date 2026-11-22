/**
 * Bundle-size and dependency budgets for CI (the `bundle` job in .github/workflows/ci.yml).
 *
 * Runs after `npx expo export --platform android --platform ios --platform web`
 * and measures the exported JS bundle of each platform: the Hermes bytecode
 * (`.hbc`) for android and ios, and the minified `.js` for web, under
 * `dist/_expo/static/js/<platform>/`. It fails when a platform is over its
 * budget, or when package.json has more direct production `dependencies` than
 * the dependency budget.
 *
 * The budgets are the constants below. A PR that needs more room, or adds a
 * production dependency, raises them here in the same PR so the growth is
 * reviewed. Lower them when a change frees space.
 *
 * Usage:
 *   node --experimental-strip-types scripts/check-bundle-size.ts \
 *     [--baseline bundle-sizes.json] [--out bundle-sizes.json] [--report bundle-size.md]
 *
 * --baseline  sizes from main (written by --out on a main run); used for the delta.
 *             A missing or unreadable file means no delta.
 * --out       writes this run's sizes as JSON.
 * --report    writes the markdown table posted as the PR comment.
 */

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  exitCode?: number;
  /** Node 22.3+; used instead of `require`, which is undefined in ESM. */
  getBuiltinModule?: (id: string) => any;
};

export type Platform = "android" | "ios" | "web";
export type BundleSizes = Record<Platform, number>;

export const PLATFORMS: readonly Platform[] = ["android", "ios", "web"];

/** Bytes per platform. Measured 2026-11-22: android 7,392,767; ios 7,380,441; web 3,677,560. */
export const BUNDLE_BUDGETS: BundleSizes = {
  android: 7_800_000,
  ios: 7_800_000,
  web: 3_900_000,
};

/** Direct `dependencies` in package.json (devDependencies are not counted). */
export const MAX_PRODUCTION_DEPENDENCIES = 34;

export interface PlatformResult {
  platform: Platform;
  bytes: number;
  budget: number;
  /** Change against the baseline, or null when there is no baseline. */
  delta: number | null;
  overBudget: boolean;
}

export interface BudgetResult {
  platforms: PlatformResult[];
  dependencies: { count: number; budget: number; overBudget: boolean };
  ok: boolean;
}

/** Reads a sizes JSON written by --out. Anything else is treated as no baseline. */
export function parseBaseline(raw: unknown): BundleSizes | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const valid = PLATFORMS.every(
    (platform) => typeof record[platform] === "number" && Number.isFinite(record[platform])
  );
  return valid ? (Object.fromEntries(PLATFORMS.map((p) => [p, record[p]])) as BundleSizes) : null;
}

export function countProductionDependencies(pkg: { dependencies?: Record<string, string> }): number {
  return Object.keys(pkg.dependencies ?? {}).length;
}

export function evaluateBudgets(
  sizes: BundleSizes,
  dependencyCount: number,
  baseline: BundleSizes | null,
  budgets: BundleSizes = BUNDLE_BUDGETS,
  maxDependencies: number = MAX_PRODUCTION_DEPENDENCIES
): BudgetResult {
  const platforms = PLATFORMS.map((platform) => ({
    platform,
    bytes: sizes[platform],
    budget: budgets[platform],
    delta: baseline ? sizes[platform] - baseline[platform] : null,
    overBudget: sizes[platform] > budgets[platform],
  }));
  const dependencies = {
    count: dependencyCount,
    budget: maxDependencies,
    overBudget: dependencyCount > maxDependencies,
  };
  return {
    platforms,
    dependencies,
    ok: !dependencies.overBudget && platforms.every((row) => !row.overBudget),
  };
}

export function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? "-" : "";
  const value = Math.abs(bytes);
  if (value < 1024) return `${sign}${value} B`;
  if (value < 1024 * 1024) return `${sign}${(value / 1024).toFixed(1)} KB`;
  return `${sign}${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDelta(delta: number | null, current: number): string {
  if (delta === null) return "n/a";
  if (delta === 0) return "0 B";
  const previous = current - delta;
  const percent = previous > 0 ? ` (${((delta / previous) * 100).toFixed(1)}%)` : "";
  return `${delta > 0 ? "+" : ""}${formatBytes(delta)}${percent}`;
}

export function renderMarkdown(result: BudgetResult): string {
  const lines = [
    `### Bundle size ${result.ok ? "✅" : "❌"}`,
    "",
    "| Platform | Size | Change vs main | Budget | |",
    "| --- | ---: | ---: | ---: | --- |",
    ...result.platforms.map(
      (row) =>
        `| ${row.platform} | ${formatBytes(row.bytes)} | ${formatDelta(row.delta, row.bytes)} | ` +
        `${formatBytes(row.budget)} | ${row.overBudget ? "over budget" : "ok"} |`
    ),
    "",
    `Production dependencies: ${result.dependencies.count} of ${result.dependencies.budget}` +
      (result.dependencies.overBudget ? " (over budget)" : ""),
    "",
    "Budgets live in `scripts/check-bundle-size.ts`; raise them in the same PR that needs the room.",
  ];
  return `${lines.join("\n")}\n`;
}

function fsModule(): any {
  const getBuiltinModule = process.getBuiltinModule;
  if (!getBuiltinModule) {
    throw new Error("Node 22.3 or newer is required to run scripts/check-bundle-size.ts");
  }
  return getBuiltinModule("fs");
}

function measureBundles(distDir: string): BundleSizes {
  const fs = fsModule();
  const sizes = {} as BundleSizes;
  for (const platform of PLATFORMS) {
    const dir = `${distDir}/_expo/static/js/${platform}`;
    if (!fs.existsSync(dir)) {
      throw new Error(`No ${platform} bundle in ${dir}. Run expo export for every platform first.`);
    }
    sizes[platform] = (fs.readdirSync(dir) as string[])
      .filter((name) => name.endsWith(".js") || name.endsWith(".hbc"))
      .reduce((total, name) => total + fs.statSync(`${dir}/${name}`).size, 0);
  }
  return sizes;
}

function readBaseline(path: string | undefined): BundleSizes | null {
  if (!path) return null;
  try {
    return parseBaseline(JSON.parse(fsModule().readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function main(argv: string[]): void {
  const fs = fsModule();
  const baseline = readBaseline(flag(argv, "--baseline"));
  const sizes = measureBundles("dist");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const result = evaluateBudgets(sizes, countProductionDependencies(pkg), baseline);
  const markdown = renderMarkdown(result);

  const out = flag(argv, "--out");
  if (out) fs.writeFileSync(out, `${JSON.stringify(sizes, null, 2)}\n`);
  const report = flag(argv, "--report");
  if (report) fs.writeFileSync(report, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  process.stdout.write(markdown);

  for (const row of result.platforms.filter((r) => r.overBudget)) {
    process.stderr.write(
      `::error::${row.platform} bundle is ${formatBytes(row.bytes)}, over its ${formatBytes(row.budget)} budget.\n`
    );
  }
  if (result.dependencies.overBudget) {
    process.stderr.write(
      `::error::package.json has ${result.dependencies.count} production dependencies; the budget is ` +
        `${result.dependencies.budget}. Raise MAX_PRODUCTION_DEPENDENCIES in this PR if the addition is intended.\n`
    );
  }
  if (!result.ok) process.exitCode = 1;
}

if (String(process.argv[1] ?? "").endsWith("check-bundle-size.ts")) {
  main(process.argv.slice(2));
}
