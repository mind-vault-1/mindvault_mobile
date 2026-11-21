import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Share } from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SettingsScreen } from "./SettingsScreen";
import { getDefaultApiBaseUrl } from "../api/apiSettings";
import { RootNavigator, type RootStackParamList } from "../navigation";
import { ThemeProvider } from "../theme/ThemeProvider";
import { renderWithProviders, setupFetchMock } from "../test-utils";

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock("./CatalogScreen", () => ({ CatalogScreen: () => null }));

jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => inset,
    SafeAreaInsetsContext: {
      Consumer: ({ children }: { children: (value: typeof inset) => React.ReactNode }) =>
        children(inset),
    },
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

const originalDev = __DEV__;

function setDev(value: boolean) {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  setupFetchMock();
});

afterEach(() => {
  setDev(originalDev);
});

async function renderSettings() {
  const screen = renderWithProviders(<SettingsScreen />);
  await screen.findByDisplayValue(getDefaultApiBaseUrl());
  return screen;
}

async function routeNames() {
  const ref = createNavigationContainerRef<RootStackParamList>();
  render(
    <ThemeProvider>
      <NavigationContainer ref={ref}>
        <RootNavigator showOnboarding={false} />
      </NavigationContainer>
    </ThemeProvider>
  );
  await waitFor(() => expect(ref.isReady()).toBe(true));
  return ref.getRootState().routeNames;
}

describe("developer tools", () => {
  it("are hidden in production builds", async () => {
    setDev(false);

    const { queryByText } = await renderSettings();
    expect(queryByText("Developer Options")).toBeNull();
    expect(await routeNames()).not.toContain("DevSigner");
  });

  it("are available in development builds", async () => {
    setDev(true);

    const { getByText } = await renderSettings();
    expect(getByText("Developer Options")).toBeTruthy();
    expect(await routeNames()).toContain("DevSigner");
  });
});

describe("diagnostics", () => {
  it("shows the report for review before sharing it", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
    const screen = await renderSettings();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Share diagnostics"));
    });

    expect(screen.getByText("Review before sharing")).toBeTruthy();
    expect(screen.getByLabelText("Diagnostics report").props.children).toContain(
      "=== MindVault Diagnostics ==="
    );
    expect(share).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Share"));
    });
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("MindVault Diagnostics") })
    );
    share.mockRestore();
  });

  it("shares nothing when the preview is cancelled", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
    const screen = await renderSettings();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Share diagnostics"));
    });
    fireEvent.press(screen.getByLabelText("Cancel"));

    expect(screen.queryByText("Review before sharing")).toBeNull();
    expect(share).not.toHaveBeenCalled();
    share.mockRestore();
  });
});

describe("about section", () => {
  it("shows the app version, network, API URL and server status", async () => {
    const fetchMock = setupFetchMock();
    const screen = await renderSettings();

    expect(screen.getByText("About")).toBeTruthy();
    expect(screen.getByText("App version")).toBeTruthy();
    expect(screen.getByText("Network")).toBeTruthy();
    expect(screen.getByLabelText(`API URL: ${getDefaultApiBaseUrl()}`)).toBeTruthy();
    expect(await screen.findByText(/^Up \(\d+ ms\)$/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      `${getDefaultApiBaseUrl()}/health`,
      expect.anything()
    );
  });

  it("shows the server as down and re-checks on demand", async () => {
    const fetchMock = setupFetchMock();
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    const screen = await renderSettings();

    expect(await screen.findByText("Down — The server could not be reached.")).toBeTruthy();

    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    fireEvent.press(screen.getByRole("button", { name: "Check server status again" }));

    expect(await screen.findByText(/^Up \(\d+ ms\)$/)).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/health"))
    ).toHaveLength(2);
  });
});

describe("local data", () => {
  type AlertButton = { text: string; style?: string; onPress?: () => void };

  it("shows every group with its size and clears one after confirmation", async () => {
    await AsyncStorage.setItem("@mindvault_catalog_filters", '{"search":"x"}');
    await AsyncStorage.setItem("@mindvault_search_history", '["q"]');
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await renderSettings();

    expect(screen.getByText("Local Data")).toBeTruthy();
    for (const label of ["filters", "favourites", "history", "cache", "receipts"]) {
      expect(await screen.findByLabelText(new RegExp(`^Clear ${label}, `))).toBeTruthy();
    }
    expect(await screen.findByLabelText(/^Clear filters, \d+ B$/)).toBeTruthy();
    expect(screen.getByLabelText("Clear favourites, 0 B")).toBeTruthy();

    fireEvent.press(screen.getByLabelText(/^Clear filters, /));
    expect(alertSpy).toHaveBeenCalledWith(
      "Clear filters?",
      expect.stringMatching(/\d+ B from this device/),
      expect.any(Array)
    );
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    expect(buttons.map((b) => b.style)).toEqual(["cancel", "destructive"]);

    await act(async () => {
      buttons[1].onPress?.();
    });

    await waitFor(() => expect(screen.getByLabelText("Clear filters, 0 B")).toBeTruthy());
    expect(await AsyncStorage.getItem("@mindvault_catalog_filters")).toBeNull();
    expect(await AsyncStorage.getItem("@mindvault_search_history")).toBe('["q"]');
    alertSpy.mockRestore();
  });

  it("does nothing when the confirmation is cancelled", async () => {
    await AsyncStorage.setItem("@mindvault_recent_resources", "[]");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await renderSettings();

    fireEvent.press(await screen.findByLabelText(/^Clear history, /));
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    buttons[0].onPress?.();

    expect(await AsyncStorage.getItem("@mindvault_recent_resources")).toBe("[]");
    alertSpy.mockRestore();
  });

  it("explains that keys are handled by the wallet wipe only", async () => {
    const screen = await renderSettings();
    expect(screen.getByText(/Wallet and API keys are not affected here/)).toBeTruthy();
  });
});

describe("haptics", () => {
  it("persists the haptic feedback toggle", async () => {
    const screen = await renderSettings();
    const toggle = screen.getByLabelText("Haptic feedback");

    expect(toggle.props.value).toBe(true);

    await act(async () => {
      fireEvent(toggle, "valueChange", false);
    });

    await waitFor(async () =>
      expect(await AsyncStorage.getItem("@mindvault_haptics_enabled")).toBe("false")
    );
    expect(screen.getByLabelText("Haptic feedback").props.value).toBe(false);
  });
});
