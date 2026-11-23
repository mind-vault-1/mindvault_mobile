import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

import { AppLockProvider, useAppLock } from "./useAppLock";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));
jest.mock("../theme/ThemeProvider", () => ({
  useAppTheme: () => ({
    colors: {
      background: "#fff",
      text: "#111",
      textMuted: "#555",
      danger: "#b00",
      primary: "#00f",
    },
  }),
}));

const stored = new Map<string, string>();
let emit: (state: AppStateStatus) => void;
let mockNow: jest.SpyInstance<number, []>;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AppLockProvider>{children}</AppLockProvider>;
}

describe("useAppLock", () => {
  beforeEach(() => {
    stored.clear();
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(
      async (key: string) => stored.get(key) ?? null,
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        stored.set(key, value);
      },
    );
    (AsyncStorage.multiRemove as jest.Mock).mockImplementation(
      async (keys: string[]) => keys.forEach((key) => stored.delete(key)),
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(
      async (key: string) => stored.delete(key),
    );
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _event: string,
      listener: (state: AppStateStatus) => void,
    ) => {
      emit = listener;
      return { remove: jest.fn() };
    }) as unknown as typeof AppState.addEventListener);
    (AppState as { currentState: AppStateStatus }).currentState = "active";
    mockNow = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  afterEach(() => jest.restoreAllMocks());

  it("locks on return only after the configured background timeout", async () => {
    stored.set("@mindvault_app_lock_enabled", "true");
    stored.set("@mindvault_app_lock_timeout_minutes", "1");
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    act(() => emit("background"));
    act(() => {
      mockNow.mockReturnValue(1_060_001);
      emit("active");
    });

    expect(result.current.isLocked).toBe(true);
    expect(stored.get("@mindvault_app_lock_required")).toBe("true");
  });

  it("keeps the session unlocked when the background interval is shorter", async () => {
    stored.set("@mindvault_app_lock_enabled", "true");
    stored.set("@mindvault_app_lock_timeout_minutes", "1");
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    act(() => emit("background"));
    act(() => {
      mockNow.mockReturnValue(1_059_999);
      emit("active");
    });

    expect(result.current.isLocked).toBe(false);
  });

  it("keeps the app locked when authentication is cancelled", async () => {
    stored.set("@mindvault_app_lock_enabled", "true");
    stored.set("@mindvault_app_lock_required", "true");
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: false,
    });
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.isLocked).toBe(true));

    await act(async () => {
      await result.current.unlock();
    });
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: "Unlock MindVault",
      disableDeviceFallback: false,
    });
    expect(result.current.isLocked).toBe(true);
  });

  it("clears the persisted lock only after successful device authentication", async () => {
    stored.set("@mindvault_app_lock_enabled", "true");
    stored.set("@mindvault_app_lock_required", "true");
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
      success: true,
    });
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.isLocked).toBe(true));

    await act(async () => {
      await result.current.unlock();
    });

    expect(result.current.isLocked).toBe(false);
    expect(stored.has("@mindvault_app_lock_required")).toBe(false);
  });

  it("refuses to enable the lock when device biometrics are unavailable", async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(false));

    await act(async () => {
      expect(await result.current.setEnabled(true)).toBe(false);
    });

    expect(result.current.error).toMatch(/Set up device biometrics/);
    expect(stored.has("@mindvault_app_lock_enabled")).toBe(false);
  });

  it("persists enable, timeout and disable changes", async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
    stored.set("@mindvault_app_lock_enabled", "true");
    stored.set("@mindvault_app_lock_required", "true");
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.isLocked).toBe(true));

    await act(async () => {
      expect(await result.current.setEnabled(true)).toBe(true);
      await result.current.setTimeoutMinutes(15);
    });
    expect(stored.get("@mindvault_app_lock_enabled")).toBe("true");
    expect(stored.get("@mindvault_app_lock_timeout_minutes")).toBe("15");
    expect(result.current.timeoutMinutes).toBe(15);

    await act(async () => {
      expect(await result.current.setEnabled(false)).toBe(true);
    });
    expect(stored.get("@mindvault_app_lock_enabled")).toBe("false");
    expect(stored.has("@mindvault_app_lock_required")).toBe(false);
    expect(result.current.isLocked).toBe(false);
  });

  it("rejects an unsupported timeout value", async () => {
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(false));

    await act(async () => {
      await expect(
        result.current.setTimeoutMinutes(2 as (typeof result.current)["timeoutMinutes"]),
      ).rejects.toThrow("Unsupported app lock timeout.");
    });
  });

  it("locks with an error when saved settings cannot be loaded", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("storage down"));
    const { result } = renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => expect(result.current.isLocked).toBe(true));
    expect(result.current.error).toBe("Could not load app lock settings.");
  });

  it("keeps the lock when device authentication throws", async () => {
    stored.set("@mindvault_app_lock_enabled", "true");
    stored.set("@mindvault_app_lock_required", "true");
    (LocalAuthentication.authenticateAsync as jest.Mock).mockRejectedValue(new Error("auth down"));
    const { result } = renderHook(() => useAppLock(), { wrapper });
    await waitFor(() => expect(result.current.isLocked).toBe(true));

    await act(async () => {
      await result.current.unlock();
    });

    expect(result.current.isLocked).toBe(true);
    expect(result.current.error).toMatch(/Device authentication failed/);
  });
});
