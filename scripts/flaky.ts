/**
 * Flaky test detection for CI (.github/workflows/ci.yml).
 *
 * CI runs the Jest suite twice and passes both `--json` reports here. A test
 * that failed in an earlier attempt and passed in the final one is flaky: it is
 * recorded in `.flaky/flaky-report.json` and `.flaky/flaky-report.md`.
 *
 * Every flaky test must be quarantined in `.github/flaky-quarantine.json` with
 * an owner and a tracked issue. Quarantined test files are excluded from the
 * required test job through `--ignore-list`, which prints a Jest
 * `--testPathIgnorePatterns` value. Nothing is ever quarantined silently: an
 * unowned flaky test or an incomplete manifest entry fails this script.
 *
 * Usage:
 *   node --experimental-strip-types scripts/flaky.ts --ignore-list
 *   node --experimental-strip-types scripts/flaky.ts \
 *     --reports .flaky/run-1.json .flaky/run-2.json
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

function fsModule(): any {
  const getBuiltinModule = process.getBuiltinModule;
  if (!getBuiltinModule) {
    throw new Error("Node 22.3 or newer is required to run scripts/flaky.ts");
  }
  return getBuiltinModule("fs");
}

export interface JestAssertionResult {
  title?: string;
  fullName?: string;
  status?: string;
  failureMessages?: string[];
}

export interface JestTestResultFile {
  name?: string;
  assertionResults?: JestAssertionResult[];
}

export interface JestReport {
  testResults?: JestTestResultFile[];
}

export type AttemptStatus = "passed" | "failed" | "pending" | "todo" | "disabled" | "unknown";

export interface FlakyTest {
  testPath: string;
  fullName: string;
  /** Status per run, in the order the reports were supplied. */
  attempts: AttemptStatus[];
  failureMessages: string[];
}

export interface QuarantineEntry {
  testPath: string;
  /** Full Jest test name, or "*" for every test in the file. */
  testName: string;
  owner: string;
  issue: string;
  quarantinedAt?: string;
  reason?: string;
}

export interface InvalidQuarantineEntry {
  entry: Partial<QuarantineEntry>;
  problems: string[];
}

export interface QuarantineManifest {
  entries: QuarantineEntry[];
  invalid: InvalidQuarantineEntry[];
}

export interface FlakyReport {
  generatedAt: string;
  runs: number;
  flaky: FlakyTest[];
  quarantined: QuarantineEntry[];
  unowned: FlakyTest[];
  invalidManifestEntries: InvalidQuarantineEntry[];
  ok: boolean;
}

const FLAKY_STATUSES = new Set(["passed", "failed", "pending", "todo", "disabled"]);
const ISSUE_PATTERN = /^(#\d+|https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+)$/;

function normalizeStatus(status: string | undefined): AttemptStatus {
  return status && FLAKY_STATUSES.has(status) ? (status as AttemptStatus) : "unknown";
}

/** A test is flaky when an earlier attempt failed and the final attempt passed. */
export function isFlaky(attempts: AttemptStatus[]): boolean {
  if (attempts.length < 2) return false;
  return attempts[attempts.length - 1] === "passed" && attempts.slice(0, -1).includes("failed");
}

/**
 * Builds one record per test across all attempts. Tests that only appear in
 * some runs still keep their attempt history, aligned to those runs.
 */
export function detectFlakyTests(reports: JestReport[]): FlakyTest[] {
  const byTest = new Map<string, FlakyTest>();

  reports.forEach((report) => {
    const files = Array.isArray(report?.testResults) ? report.testResults : [];
    for (const file of files) {
      const testPath = (file.name ?? "").trim();
      if (!testPath) continue;
      const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
      for (const assertion of assertions) {
        const fullName = (assertion.fullName ?? assertion.title ?? "").trim();
        if (!fullName) continue;
        const key = `${testPath}\u0000${fullName}`;
        const existing = byTest.get(key) ?? {
          testPath,
          fullName,
          attempts: [],
          failureMessages: [],
        };
        const status = normalizeStatus(assertion.status);
        existing.attempts.push(status);
        if (status === "failed") {
          for (const message of assertion.failureMessages ?? []) {
            if (message) existing.failureMessages.push(message);
          }
        }
        byTest.set(key, existing);
      }
    }
  });

  return Array.from(byTest.values())
    .filter((test) => isFlaky(test.attempts))
    .sort((a, b) =>
      a.testPath === b.testPath
        ? a.fullName.localeCompare(b.fullName)
        : a.testPath.localeCompare(b.testPath)
    );
}

function validateEntry(raw: unknown): { entry?: QuarantineEntry; problems: string[] } {
  if (!raw || typeof raw !== "object") {
    return { problems: ["entry must be an object"] };
  }
  const value = raw as Record<string, unknown>;
  const problems: string[] = [];
  const testPath = typeof value.testPath === "string" ? value.testPath.trim() : "";
  const testName = typeof value.testName === "string" ? value.testName.trim() : "";
  const owner = typeof value.owner === "string" ? value.owner.trim() : "";
  const issue = typeof value.issue === "string" ? value.issue.trim() : "";

  if (!testPath) problems.push("testPath is required");
  if (!testName) problems.push("testName is required (use \"*\" for a whole file)");
  if (!owner) problems.push("owner is required");
  if (!issue) problems.push("issue is required");
  else if (!ISSUE_PATTERN.test(issue)) problems.push("issue must be #123 or a GitHub issue URL");

  if (problems.length > 0) return { problems };

  const entry: QuarantineEntry = {
    testPath,
    testName,
    owner,
    issue,
    quarantinedAt: typeof value.quarantinedAt === "string" ? value.quarantinedAt : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
  };
  return { entry, problems };
}

/** Accepts `{ "quarantined": [...] }` (preferred) or a bare array. */
export function parseQuarantineManifest(raw: unknown): QuarantineManifest {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { quarantined?: unknown }).quarantined)
      ? ((raw as { quarantined: unknown[] }).quarantined)
      : null;

  if (!list) {
    return {
      entries: [],
      invalid: [{ entry: {}, problems: ["manifest must contain a quarantined array"] }],
    };
  }

  const entries: QuarantineEntry[] = [];
  const invalid: InvalidQuarantineEntry[] = [];
  for (const item of list) {
    const result = validateEntry(item);
    if (result.entry) entries.push(result.entry);
    else invalid.push({ entry: (item ?? {}) as Partial<QuarantineEntry>, problems: result.problems });
  }
  return { entries, invalid };
}

export function quarantineMatches(entry: QuarantineEntry, test: FlakyTest): boolean {
  return entry.testPath === test.testPath && (entry.testName === "*" || entry.testName === test.fullName);
}

export function buildFlakyReport(
  flaky: FlakyTest[],
  manifest: QuarantineManifest,
  runs: number,
  generatedAt: string = new Date().toISOString()
): FlakyReport {
  const quarantined: QuarantineEntry[] = [];
  const unowned: FlakyTest[] = [];

  for (const test of flaky) {
    const match = manifest.entries.find((entry) => quarantineMatches(entry, test));
    if (match) quarantined.push(match);
    else unowned.push(test);
  }

  return {
    generatedAt,
    runs,
    flaky,
    quarantined,
    unowned,
    invalidManifestEntries: manifest.invalid,
    ok: unowned.length === 0 && manifest.invalid.length === 0,
  };
}

/** Sorted, de-duplicated test files for Jest's --testPathIgnorePatterns. */
export function quarantinedTestPaths(manifest: QuarantineManifest): string[] {
  return Array.from(new Set(manifest.entries.map((entry) => entry.testPath))).sort();
}

export function buildIgnorePattern(paths: string[]): string {
  return paths
    .map((path) => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

function quote(value: string): string {
  return `\`${value.replace(/\|/g, "\\|")}\``;
}

export function renderMarkdown(report: FlakyReport): string {
  const lines = [
    "# Flaky test report",
    "",
    `Runs compared: ${report.runs} · Flaky tests: ${report.flaky.length} · ` +
      `Quarantined: ${report.quarantined.length} · Unowned: ${report.unowned.length}`,
    "",
  ];

  if (report.flaky.length === 0) {
    lines.push("No flaky tests detected.");
  } else {
    lines.push(
      "| Test | File | Attempts | Quarantine |",
      "| --- | --- | --- | --- |"
    );
    for (const test of report.flaky) {
      const entry = report.quarantined.find((candidate) => quarantineMatches(candidate, test));
      const quarantine = entry
        ? `${entry.owner} (${entry.issue})`
        : "**UNOWNED — add an owner and tracked issue**";
      lines.push(
        `| ${quote(test.fullName)} | ${quote(test.testPath)} | ${test.attempts.join(" → ")} | ${quarantine} |`
      );
    }
    lines.push(
      "",
      "Quarantined test files are excluded from the required test job. Each entry in " +
        "`.github/flaky-quarantine.json` needs an `owner` and an `issue`, and should be " +
        "removed once the flake is fixed."
    );
  }

  if (report.invalidManifestEntries.length > 0) {
    lines.push("", "## Invalid quarantine entries", "");
    for (const invalid of report.invalidManifestEntries) {
      lines.push(`- ${quote(invalid.entry.testPath ?? "(no path)")}: ${invalid.problems.join("; ")}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function readJson(path: string): unknown {
  const fs = fsModule();
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readManifest(path: string): QuarantineManifest {
  const fs = fsModule();
  if (!fs.existsSync(path)) return { entries: [], invalid: [] };
  return parseQuarantineManifest(readJson(path));
}

function collectFailureDetails(report: FlakyReport): string {
  const testsWithMessages = report.flaky.filter((test) => test.failureMessages.length > 0);
  if (testsWithMessages.length === 0) return "";
  return testsWithMessages
    .map((test) => {
      const message = test.failureMessages[0].split("\n").slice(0, 3).join("\n").slice(0, 500);
      return `${test.fullName}\n${message}`;
    })
    .join("\n\n");
}

function runReports(reports: string[], manifestPath: string): void {
  const fs = fsModule();
  const missing = reports.filter((path) => !fs.existsSync(path));
  if (missing.length > 0) {
    process.stderr.write(`Missing Jest report(s): ${missing.join(", ")}\n`);
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(manifestPath);
  const detected = detectFlakyTests(reports.map((path) => readJson(path) as JestReport));
  const report = buildFlakyReport(detected, manifest, reports.length);

  fs.mkdirSync(".flaky", { recursive: true });
  fs.writeFileSync(".flaky/flaky-report.json", `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(".flaky/flaky-report.md", renderMarkdown(report));
  process.stdout.write(renderMarkdown(report));

  if (report.unowned.length > 0) {
    process.stderr.write(
      `\n::error::${report.unowned.length} flaky test(s) have no quarantine entry. ` +
        "Add each one to .github/flaky-quarantine.json with an owner and a tracked issue.\n"
    );
  }
  if (report.invalidManifestEntries.length > 0) {
    process.stderr.write(
      `::error::${report.invalidManifestEntries.length} invalid entry(ies) in .github/flaky-quarantine.json.\n`
    );
  }
  const details = collectFailureDetails(report);
  if (details) process.stderr.write(`\nFirst failures:\n${details}\n`);
  if (!report.ok) process.exitCode = 1;
}

function runIgnoreList(manifestPath: string): void {
  const manifest = readManifest(manifestPath);
  if (manifest.invalid.length > 0) {
    process.stderr.write("::error::Invalid entries in .github/flaky-quarantine.json:\n");
    for (const invalid of manifest.invalid) {
      process.stderr.write(`  ${invalid.entry.testPath ?? "(no path)"}: ${invalid.problems.join("; ")}\n`);
    }
    process.exitCode = 1;
  }
  process.stdout.write(buildIgnorePattern(quarantinedTestPaths(manifest)));
}

function main(argv: string[]): void {
  const manifestIndex = argv.indexOf("--manifest");
  const manifestPath =
    manifestIndex >= 0 && argv[manifestIndex + 1]
      ? argv[manifestIndex + 1]
      : ".github/flaky-quarantine.json";

  if (argv.includes("--ignore-list")) {
    runIgnoreList(manifestPath);
    return;
  }

  const reportsIndex = argv.indexOf("--reports");
  if (reportsIndex >= 0) {
    const reports = argv.slice(reportsIndex + 1).filter((arg) => !arg.startsWith("--"));
    if (reports.length === 0) {
      process.stderr.write("Usage: flaky.ts --reports <jest-json> [more...]\n");
      process.exitCode = 1;
      return;
    }
    runReports(reports, manifestPath);
    return;
  }

  process.stderr.write(
    "Usage: flaky.ts --ignore-list | --reports <jest-json> [more...] [--manifest <path>]\n"
  );
  process.exitCode = 1;
}

if (String(process.argv[1] ?? "").endsWith("flaky.ts")) {
  main(process.argv.slice(2));
}
