import { AppState, type AppStateStatus } from "react-native";
import { renderHook } from "@testing-library/react-native";

import { useAppForeground } from "./useAppForeground";

describe("useAppForeground", () => {
  let emit: (state: AppStateStatus) => void;
  const remove = jest.fn();

  beforeEach(() => {
    remove.mockClear();
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, handler: (s: AppStateStatus) => void) => {
      emit = handler;
      return { remove };
    }) as unknown as typeof AppState.addEventListener);
    (AppState as { currentState: AppStateStatus }).currentState = "active";
  });

  afterEach(() => jest.restoreAllMocks());

  it("fires when returning to active from background", () => {
    const onForeground = jest.fn();
    renderHook(() => useAppForeground(onForeground));

    emit("background");
    expect(onForeground).not.toHaveBeenCalled();
    emit("active");
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it("fires when returning from inactive but not on repeated active events", () => {
    const onForeground = jest.fn();
    renderHook(() => useAppForeground(onForeground));

    emit("inactive");
    emit("active");
    emit("active");
    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it("uses the latest callback without resubscribing", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => useAppForeground(cb), {
      initialProps: { cb: first },
    });
    const subscriptions = (AppState.addEventListener as jest.Mock).mock.calls.length;
    rerender({ cb: second });

    emit("background");
    emit("active");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(subscriptions);
  });

  it("removes the listener on unmount", () => {
    const { unmount } = renderHook(() => useAppForeground(jest.fn()));
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
