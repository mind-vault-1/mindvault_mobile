import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { setupFetchMock } from "./src/test-utils";

import App, { BOOT_TIMEOUT_MS, resetSplashForTests } from "./App";

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));

const SAVED_URL = "http://192.168.1.20:4021";

let mockLinkingProps: any;
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  const React = require("react");
  return {
    ...actual,
    NavigationContainer: (props: any) => {
      mockLinkingProps = props;
      return React.createElement(actual.NavigationContainer, props);
    },
  };
});

jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaInsetsContext: { Consumer: ({ children }: any) => children(inset) },
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// Background receipt sync is covered by its own tests; keep it out of App's.
jest.mock("./src/services/receiptSync", () => ({ requestReceiptSync: jest.fn() }));

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

const ONBOARDING_KEY = "@mindvault_catalog_filters:onboarding";

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(ONBOARDING_KEY, "true");
  mockLinkingProps = undefined;
  jest.clearAllMocks();
  resetSplashForTests();
  fetchMock = setupFetchMock();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("App boot", () => {
  it("renders the catalog without throwing (ThemeProvider is mounted)", async () => {
    const { findByText } = render(<App />);

    expect(await findByText("MindVault")).toBeTruthy();
  });

  it("uses the API base URL saved in Settings for the first request", async () => {
    await AsyncStorage.setItem("mindvault_api_base_url", SAVED_URL);

    const { findByText } = render(<App />);

    await findByText("MindVault");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url).startsWith(SAVED_URL)).toBe(true);
    }
  });

  it("passes a deep-linking config that resolves mindvault://resources/abc", async () => {
    const { findByText } = render(<App />);

    await findByText("MindVault");

    const linking = mockLinkingProps?.linking;
    expect(linking).toBeDefined();
    expect(linking.prefixes).toContain("mindvault://");

    // React Navigation strips the prefix before calling getStateFromPath.
    const state = linking.getStateFromPath("resources/abc");
    expect(state).toBeDefined();

    const route = state.routes[state.routes.length - 1];
    expect(route.name).toBe("ResourceDetail");
    expect(route.params).toEqual({ resourceId: "abc" });
  });

  it("keeps the splash visible until boot work completes, then hides it once", async () => {
    const { findByText } = render(<App />);

    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    await findByText("MindVault");
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1));
  });

  it("hides the splash after the boot timeout when startup hangs", async () => {
    jest.useFakeTimers();
    const getItem = jest.spyOn(AsyncStorage, "getItem").mockImplementation((key: string) =>
      key === "mindvault_api_base_url" ? new Promise<string | null>(() => undefined) : Promise.resolve("true")
    );

    try {
      render(<App />);
      expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(BOOT_TIMEOUT_MS);
      });
      expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    } finally {
      getItem.mockRestore();
      jest.useRealTimers();
    }
  });
});
