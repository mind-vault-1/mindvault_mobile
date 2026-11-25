import { useEffect } from "react";
import { renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";

import { assertNoPendingTimersAfterUnmount } from "./useCleanupAudit";
import { useAppForeground } from "./useAppForeground";
import { useNetworkStatus } from "./useNetworkStatus";

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(),
}));

describe("cleanup audit", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("fails when a timer is left pending after unmount", () => {
    const { unmount } = renderHook(() => {
      useEffect(() => {
        setInterval(() => undefined, 1000);
      }, []);
    });

    expect(() =>
      assertNoPendingTimersAfterUnmount({
        unmount,
        getPendingTimerCount: () => jest.getTimerCount(),
      })
    ).toThrow("Expected no pending timers after unmount, found 1.");
  });

  it("cleans AppState listener on unmount", () => {
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove } as any);

    const { unmount } = renderHook(() => useAppForeground(() => undefined));

    assertNoPendingTimersAfterUnmount({
      unmount,
      getPendingTimerCount: () => jest.getTimerCount(),
      subscriptions: [remove],
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("cleans NetInfo subscription on unmount", () => {
    const unsubscribe = jest.fn();
    (NetInfo.addEventListener as jest.Mock).mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useNetworkStatus());

    assertNoPendingTimersAfterUnmount({
      unmount,
      getPendingTimerCount: () => jest.getTimerCount(),
      subscriptions: [unsubscribe],
    });
    expect(jest.getTimerCount()).toBe(0);
  });
});
