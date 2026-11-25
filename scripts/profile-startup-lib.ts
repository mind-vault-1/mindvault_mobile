export interface StartupMilestones {
  moduleLoadMs?: number;
  rootMountedMs?: number;
  firstInteractiveFrameMs: number;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function p90(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1);
  return sorted[idx];
}

export function slowestTasks(milestones: StartupMilestones): { name: string; ms: number }[] {
  return Object.entries(milestones)
    .filter(([, ms]) => typeof ms === "number" && Number.isFinite(ms))
    .map(([name, ms]) => ({ name, ms: ms as number }))
    .sort((a, b) => b.ms - a.ms);
}
