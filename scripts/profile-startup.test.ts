import { median, p90, slowestTasks } from "./profile-startup-lib";

describe("profile-startup", () => {
  it("computes median and p90", () => {
    expect(median([100, 300, 200, 400, 500])).toBe(300);
    expect(p90([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])).toBe(900);
  });

  it("sorts slowest tasks descending", () => {
    expect(slowestTasks({ moduleLoadMs: 50, rootMountedMs: 120, firstInteractiveFrameMs: 300 })).toEqual([
      { name: "firstInteractiveFrameMs", ms: 300 },
      { name: "rootMountedMs", ms: 120 },
      { name: "moduleLoadMs", ms: 50 },
    ]);
  });
});
