import {
  buildFlakyReport,
  buildIgnorePattern,
  detectFlakyTests,
  isFlaky,
  parseQuarantineManifest,
  quarantinedTestPaths,
  renderMarkdown,
  type JestReport,
  type QuarantineManifest,
} from "./flaky";

function report(
  results: { name: string; tests: { fullName: string; status: string; failureMessages?: string[] }[] }[]
): JestReport {
  return {
    testResults: results.map((file) => ({
      name: file.name,
      assertionResults: file.tests.map((test) => ({
        fullName: test.fullName,
        title: test.fullName,
        status: test.status,
        failureMessages: test.failureMessages,
      })),
    })),
  };
}

const file = "/repo/src/api/resources.test.ts";
const otherFile = "/repo/src/screens/CatalogScreen.test.tsx";

describe("isFlaky", () => {
  it("is flaky when a failed attempt is followed by a pass", () => {
    expect(isFlaky(["failed", "passed"])).toBe(true);
    expect(isFlaky(["failed", "failed", "passed"])).toBe(true);
  });

  it("is not flaky with a single attempt", () => {
    expect(isFlaky(["passed"])).toBe(false);
    expect(isFlaky(["failed"])).toBe(false);
  });

  it("is not flaky when the failures continue or come last", () => {
    expect(isFlaky(["passed", "failed"])).toBe(false);
    expect(isFlaky(["failed", "failed"])).toBe(false);
    expect(isFlaky(["passed", "passed"])).toBe(false);
  });
});

describe("detectFlakyTests", () => {
  it("records the attempt history of a test that failed then passed", () => {
    const runs = [
      report([{ name: file, tests: [{ fullName: "fetches data", status: "failed", failureMessages: ["Timeout"] }] }]),
      report([{ name: file, tests: [{ fullName: "fetches data", status: "passed" }] }]),
    ];

    expect(detectFlakyTests(runs)).toEqual([
      {
        testPath: file,
        fullName: "fetches data",
        attempts: ["failed", "passed"],
        failureMessages: ["Timeout"],
      },
    ]);
  });

  it("ignores stable passing and consistently failing tests", () => {
    const runs = [
      report([
        {
          name: file,
          tests: [
            { fullName: "stable", status: "passed" },
            { fullName: "broken", status: "failed" },
          ],
        },
      ]),
      report([
        {
          name: file,
          tests: [
            { fullName: "stable", status: "passed" },
            { fullName: "broken", status: "failed" },
          ],
        },
      ]),
    ];

    expect(detectFlakyTests(runs)).toEqual([]);
  });

  it("collects flaky tests from every file and sorts them", () => {
    const runs = [
      report([
        { name: otherFile, tests: [{ fullName: "renders", status: "failed" }] },
        { name: file, tests: [{ fullName: "fetches", status: "failed" }] },
      ]),
      report([
        { name: otherFile, tests: [{ fullName: "renders", status: "passed" }] },
        { name: file, tests: [{ fullName: "fetches", status: "passed" }] },
      ]),
    ];

    expect(detectFlakyTests(runs).map((test) => test.testPath)).toEqual([file, otherFile]);
  });

  it("tolerates an empty or malformed report", () => {
    expect(detectFlakyTests([{}, { testResults: undefined }])).toEqual([]);
  });
});

describe("parseQuarantineManifest", () => {
  it("accepts entries with an owner and a tracked issue", () => {
    const manifest = parseQuarantineManifest({
      quarantined: [
        { testPath: file, testName: "fetches data", owner: "@marvy", issue: "#280" },
        {
          testPath: otherFile,
          testName: "*",
          owner: "@marvy",
          issue: "https://github.com/mind-vault-1/mindvault_mobile/issues/280",
        },
      ],
    });

    expect(manifest.invalid).toEqual([]);
    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries[0].testName).toBe("fetches data");
  });

  it("rejects entries without an owner or a tracked issue", () => {
    const manifest = parseQuarantineManifest({
      quarantined: [
        { testPath: file, testName: "fetches data" },
        { testPath: file, testName: "other", owner: "@marvy", issue: "some issue" },
        { testPath: "", testName: "", owner: "", issue: "" },
        "not an entry",
      ],
    });

    expect(manifest.entries).toEqual([]);
    expect(manifest.invalid).toHaveLength(4);
    expect(manifest.invalid[0].problems).toEqual(
      expect.arrayContaining(["owner is required", "issue is required"])
    );
    expect(manifest.invalid[1].problems).toContain("issue must be #123 or a GitHub issue URL");
  });

  it("treats a malformed document as invalid instead of silently empty", () => {
    const manifest = parseQuarantineManifest({ entries: [] });

    expect(manifest.entries).toEqual([]);
    expect(manifest.invalid).toHaveLength(1);
  });

  it("accepts a bare array for backwards compatibility", () => {
    const manifest = parseQuarantineManifest([
      { testPath: file, testName: "*", owner: "@marvy", issue: "#280" },
    ]);

    expect(manifest.invalid).toEqual([]);
    expect(manifest.entries).toHaveLength(1);
  });
});

describe("buildFlakyReport", () => {
  const manifest: QuarantineManifest = {
    entries: [{ testPath: file, testName: "fetches data", owner: "@marvy", issue: "#280" }],
    invalid: [],
  };

  const flaky = [
    {
      testPath: file,
      fullName: "fetches data",
      attempts: ["failed", "passed"] as ("failed" | "passed")[],
      failureMessages: ["Timeout"],
    },
    {
      testPath: otherFile,
      fullName: "renders",
      attempts: ["failed", "passed"] as ("failed" | "passed")[],
      failureMessages: [],
    },
  ];

  it("marks only quarantined flaky tests as owned", () => {
    const result = buildFlakyReport(flaky, manifest, 2, "2026-11-20T00:00:00.000Z");

    expect(result.ok).toBe(false);
    expect(result.quarantined).toEqual([manifest.entries[0]]);
    expect(result.unowned.map((test) => test.fullName)).toEqual(["renders"]);
  });

  it("is ok when every flaky test is quarantined", () => {
    const result = buildFlakyReport([flaky[0]], manifest, 2);
    expect(result.ok).toBe(true);
    expect(result.unowned).toEqual([]);
  });

  it("is not ok when the manifest has invalid entries", () => {
    const result = buildFlakyReport([flaky[0]], {
      entries: manifest.entries,
      invalid: [{ entry: { testPath: file }, problems: ["owner is required"] }],
    }, 2);

    expect(result.ok).toBe(false);
  });

  it("matches a whole-file quarantine", () => {
    const result = buildFlakyReport([flaky[1]], {
      entries: [{ testPath: otherFile, testName: "*", owner: "@marvy", issue: "#280" }],
      invalid: [],
    }, 2);

    expect(result.ok).toBe(true);
    expect(result.quarantined).toHaveLength(1);
  });
});

describe("quarantine paths", () => {
  const manifest: QuarantineManifest = {
    entries: [
      { testPath: file, testName: "a", owner: "@marvy", issue: "#280" },
      { testPath: file, testName: "b", owner: "@marvy", issue: "#280" },
      { testPath: otherFile, testName: "*", owner: "@marvy", issue: "#280" },
    ],
    invalid: [],
  };

  it("de-duplicates and sorts quarantined files", () => {
    expect(quarantinedTestPaths(manifest)).toEqual([file, otherFile]);
  });

  it("escapes regex characters so Jest ignores the exact path", () => {
    expect(buildIgnorePattern(["/repo/src/(legacy).test.ts", "/repo/src/a+b.test.ts"])).toBe(
      "/repo/src/\\(legacy\\)\\.test\\.ts|/repo/src/a\\+b\\.test\\.ts"
    );
  });
});

describe("renderMarkdown", () => {
  it("shows the owner and issue for quarantined tests", () => {
    const manifest: QuarantineManifest = {
      entries: [{ testPath: file, testName: "fetches data", owner: "@marvy", issue: "#280" }],
      invalid: [],
    };
    const report = buildFlakyReport(
      [
        {
          testPath: file,
          fullName: "fetches data",
          attempts: ["failed", "passed"],
          failureMessages: ["Timeout"],
        },
      ],
      manifest,
      2,
      "2026-11-20T00:00:00.000Z"
    );

    const markdown = renderMarkdown(report);
    expect(markdown).toContain("failed → passed");
    expect(markdown).toContain("@marvy (#280)");
    expect(markdown).not.toContain("UNOWNED");
  });

  it("flags unowned flaky tests and invalid manifest entries", () => {
    const report = buildFlakyReport(
      [
        {
          testPath: file,
          fullName: "fetches data",
          attempts: ["failed", "passed"],
          failureMessages: ["Timeout"],
        },
      ],
      { entries: [], invalid: [{ entry: { testPath: file }, problems: ["owner is required"] }] },
      2
    );

    const markdown = renderMarkdown(report);
    expect(markdown).toContain("UNOWNED");
    expect(markdown).toContain("owner is required");
  });

  it("says so when nothing is flaky", () => {
    expect(renderMarkdown(buildFlakyReport([], { entries: [], invalid: [] }, 2))).toContain(
      "No flaky tests detected."
    );
  });
});
