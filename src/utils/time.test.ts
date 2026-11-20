import { getRelativeTimeString } from "./time";

describe("getRelativeTimeString", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-20T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("formats seconds ago", () => {
    const date = new Date("2026-11-20T11:59:30Z");
    const result = getRelativeTimeString(date);
    expect(result).toMatch(/\d+ second/);
  });

  it("formats minutes ago", () => {
    const date = new Date("2026-11-20T11:50:00Z");
    const result = getRelativeTimeString(date);
    expect(result).toMatch(/\d+ minute/);
  });

  it("formats hours ago", () => {
    const date = new Date("2026-11-20T08:00:00Z");
    const result = getRelativeTimeString(date);
    expect(result).toMatch(/\d+ hour/);
  });

  it("formats days ago", () => {
    const date = new Date("2026-11-19T12:00:00Z");
    const result = getRelativeTimeString(date);
    expect(result).toMatch(/yesterday|day/);
  });

  it("formats weeks ago", () => {
    const date = new Date("2026-11-13T12:00:00Z");
    const result = getRelativeTimeString(date);
    expect(result).toMatch(/last week|week/);
  });

  it("formats future times", () => {
    const date = new Date("2026-11-20T13:00:00Z");
    const result = getRelativeTimeString(date);
    expect(result).toMatch(/in.*hour/);
  });
});
