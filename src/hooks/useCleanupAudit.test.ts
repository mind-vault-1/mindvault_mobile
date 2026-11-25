import { useEffect } from "react";
import { renderHook } from "@testing-library/react-native";

import { assertNoPendingTimersAfterUnmount } from "./useCleanupAudit";

describe("cleanup audit", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("passes when a hook clears its interval on unmount", () => {
    const { unmount } = renderHook(() => {
      useEffect(() => {
        const timer = setInterval(() => undefined, 1000);
        return () => clearInterval(timer);
      }, []);
    });

    expect(() =>
      assertNoPendingTimersAfterUnmount(unmount, () => jest.getTimerCount())
    ).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("reports an interval left running after unmount", () => {
    const { unmount } = renderHook(() => {
      useEffect(() => {
        setInterval(() => undefined, 1000);
      }, []);
    });

    expect(() =>
      assertNoPendingTimersAfterUnmount(unmount, () => jest.getTimerCount())
    ).toThrow("Expected no pending timers after unmount, found 1.");
    jest.clearAllTimers();
  });
});