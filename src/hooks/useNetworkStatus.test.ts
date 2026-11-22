import { renderHook, waitFor } from "@testing-library/react-native";
import NetInfo from "@react-native-community/netinfo";
import type { NetInfoState } from "@react-native-community/netinfo";

import { useNetworkStatus } from "./useNetworkStatus";

describe("useNetworkStatus", () => {
  it("returns offline when isConnected is false", async () => {
    (NetInfo.addEventListener as jest.MockedFunction<typeof NetInfo.addEventListener>).mockImplementation((listener) => {
      listener({
        type: "none",
        isConnected: false,
        isInternetReachable: false,
        details: null,
      } as NetInfoState);
      return jest.fn();
    });

    const { result } = renderHook(() => useNetworkStatus());

    await waitFor(() => {
      expect(result.current.isOffline).toBe(true);
    });
  });

  it("returns online when isConnected is true", async () => {
    (NetInfo.addEventListener as jest.MockedFunction<typeof NetInfo.addEventListener>).mockImplementation((listener) => {
      listener({
        type: "wifi",
        isConnected: true,
        isInternetReachable: true,
        details: {
          isConnectionExpensive: false,
        },
      } as NetInfoState);
      return jest.fn();
    });

    const { result } = renderHook(() => useNetworkStatus());

    await waitFor(() => {
      expect(result.current.isOffline).toBe(false);
    });
  });

  it("fires onReconnect once when connectivity returns", async () => {
    const onReconnect = jest.fn();
    let listener: ((state: NetInfoState) => void) | null = null;

    (NetInfo.addEventListener as jest.MockedFunction<typeof NetInfo.addEventListener>).mockImplementation((cb) => {
      listener = cb as (state: NetInfoState) => void;
      // Start online
      cb({
        type: "wifi",
        isConnected: true,
        isInternetReachable: true,
        details: {
          isConnectionExpensive: false,
        },
      } as NetInfoState);
      return jest.fn();
    });

    renderHook(() => useNetworkStatus({ onReconnect }));

    expect(onReconnect).not.toHaveBeenCalled();

    // Go offline
    expect(listener).toBeDefined();
    listener!({
      type: "none",
      isConnected: false,
      isInternetReachable: false,
      details: null,
    } as NetInfoState);
    await waitFor(() => expect(onReconnect).not.toHaveBeenCalled());

    // Come back online
    listener!({
      type: "wifi",
      isConnected: true,
      isInternetReachable: true,
      details: {
        isConnectionExpensive: false,
      },
    } as NetInfoState);
    await waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(1));

    // Stays online – onReconnect shouldn't fire again
    listener!({
      type: "wifi",
      isConnected: true,
      isInternetReachable: true,
      details: {
        isConnectionExpensive: false,
      },
    } as NetInfoState);
    await waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(1));
  });

  it("does not fire onReconnect on first mount when already online", async () => {
    const onReconnect = jest.fn();

    (NetInfo.addEventListener as jest.MockedFunction<typeof NetInfo.addEventListener>).mockImplementation((listener) => {
      listener({
        type: "wifi",
        isConnected: true,
        isInternetReachable: true,
        details: {
          isConnectionExpensive: false,
        },
      } as NetInfoState);
      return jest.fn();
    });

    renderHook(() => useNetworkStatus({ onReconnect }));

    await waitFor(() => expect(onReconnect).not.toHaveBeenCalled());
  });
});
