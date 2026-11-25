#!/usr/bin/env npx ts-node
/**
 * Repeatable startup profiler for first interactive frame on iOS/Android.
 *
 * Usage:
 *   npx ts-node scripts/profile-startup.ts --platform ios --runs 5
 *   npx ts-node scripts/profile-startup.ts --platform android --runs 5 --warn-ms 2500 --hard-ms 4000
 *
 * The script reads `[startup] first interactive frame {...}` logs emitted by App.tsx.
 * It reports median and p90 per platform and the slowest startup milestone gaps.
 */
import { spawnSync } from "node:child_process";
import { median, p90, slowestTasks as slowestTasksFromMilestones } from "./profile-startup-lib";

type Platform = "ios" | "android";

interface Args {
  platform: Platform;
  runs: number;
  warnMs: number;
  hardMs: number;
}

interface RunSample {
  durationMs: number;
  milestones: Record<string, number>;
}

function readArg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function parseArgs(): Args {
  const platform = (readArg("--platform", "ios") as Platform);
  if (platform !== "ios" && platform !== "android") {
    throw new Error("--platform must be ios or android");
  }
  const runs = Number(readArg("--runs", "5"));
  const warnMs = Number(readArg("--warn-ms", "2500"));
  const hardMs = Number(readArg("--hard-ms", "4000"));
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be >= 1");
  return { platform, runs, warnMs, hardMs };
}


function parseStartupLine(line: string): RunSample | null {
  const marker = "[startup] first interactive frame ";
  const i = line.indexOf(marker);
  if (i === -1) return null;
  const payload = JSON.parse(line.slice(i + marker.length));
  const durationMs = Number(payload.durationMs);
  if (!Number.isFinite(durationMs)) return null;
  const milestones: Record<string, number> = {
    firstInteractiveFrameMs: durationMs,
  };
  if (Number.isFinite(payload.moduleLoadMs)) milestones.moduleLoadMs = Number(payload.moduleLoadMs);
  if (Number.isFinite(payload.rootMountedMs)) milestones.rootMountedMs = Number(payload.rootMountedMs);
  return { durationMs, milestones };
}

function collectRun(platform: Platform): RunSample {
  const cmd = platform === "ios" ? "xcrun" : "adb";
  const args = platform === "ios"
    ? ["simctl", "spawn", "booted", "log", "show", "--last", "2m", "--predicate", "eventMessage CONTAINS '[startup]'"]
    : ["logcat", "-d", "-s", "ReactNativeJS:I"];
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  const lines = `${res.stdout}\n${res.stderr}`.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const sample = parseStartupLine(lines[i]);
      if (sample) return sample;
    } catch {
      // ignore malformed log lines
    }
  }
  throw new Error(
    `No startup marker found for ${platform}. Launch the app and ensure [startup] logs are emitted.`
  );
}

function slowestTasks(samples: RunSample[]): { name: string; ms: number }[] {
  return slowestTasksFromMilestones(samples[samples.length - 1].milestones as any);
}

function main() {
  const args = parseArgs();
  const samples: RunSample[] = [];
  for (let i = 0; i < args.runs; i++) {
    samples.push(collectRun(args.platform));
  }
  const durations = samples.map((s) => s.durationMs);
  const med = median(durations);
  const p90v = p90(durations);
  const tasks = slowestTasks(samples);

  process.stdout.write(`${JSON.stringify({ platform: args.platform, runs: args.runs, medianMs: med, p90Ms: p90v, durations, slowestTasks: tasks }, null, 2)}\n`);

  if (p90v > args.hardMs) {
    process.stderr.write(`FAIL: p90 ${p90v}ms exceeds hard limit ${args.hardMs}ms\n`);
    process.exit(1);
  }
  if (p90v > args.warnMs) {
    process.stderr.write(`WARN: p90 ${p90v}ms exceeds warning threshold ${args.warnMs}ms\n`);
  }
}

main();
