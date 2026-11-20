/**
 * Called by .github/workflows/nightly.yml after both smoke jobs finish.
 *
 * On failure it opens one issue labelled `nightly-smoke`, or comments on the
 * open one, with the job results and a link to the run, whose artifacts hold
 * the Maestro logs, JUnit report and screenshots. On success it closes the
 * open issue. It makes at most three API calls per run.
 */

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const LABEL = "nightly-smoke";

export function buildReport(results: Record<string, string | undefined>, runUrl: string) {
  const failed = Object.values(results).some((result) => result !== "success");
  const lines = Object.entries(results).map(
    ([platform, result]) => `- ${platform}: ${result ?? "unknown"}`
  );
  const body = [
    failed ? "Nightly smoke test failed." : "Nightly smoke test passed.",
    "",
    ...lines,
    "",
    `Run, logs and screenshots: ${runUrl} (artifacts \`nightly-android\` and \`nightly-ios\`)`,
  ].join("\n");
  return { failed, body };
}

async function github(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.REPO}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`GitHub API ${path} returned ${res.status}`);
  return res.json();
}

async function main() {
  const { failed, body } = buildReport(
    { android: process.env.ANDROID_RESULT, ios: process.env.IOS_RESULT },
    process.env.RUN_URL ?? ""
  );
  const open = (await github(`/issues?state=open&labels=${LABEL}&per_page=1`)) as {
    number: number;
  }[];
  const existing = open[0];

  if (failed) {
    if (existing) {
      await github(`/issues/${existing.number}/comments`, { method: "POST", body: { body } });
    } else {
      await github("/issues", {
        method: "POST",
        body: { title: "Nightly smoke test failing", body, labels: [LABEL] },
      });
    }
    process.exitCode = 1;
  } else if (existing) {
    await github(`/issues/${existing.number}/comments`, { method: "POST", body: { body } });
    await github(`/issues/${existing.number}`, { method: "PATCH", body: { state: "closed" } });
  }
}

if (process.env.REPO) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
