import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import App from "./App";

const SAVED_URL = "http://192.168.1.20:4021";

// Captures the props App hands to NavigationContainer so the deep-linking
// config can be asserted.
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

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockLinkingProps = undefined;
  fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [],
    text: async () => "[]",
    headers: { get: () => "application/json" },
  });
  global.fetch = fetchMock as unknown as typeof global.fetch;
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
});
