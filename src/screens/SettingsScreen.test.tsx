import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { Alert, Share } from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SettingsScreen } from "./SettingsScreen";
import { getDefaultApiBaseUrl } from "../api/apiSettings";
import { getNetwork, resetNetworkForTests, setNetwork } from "../config/network";
import { RootNavigator, type RootStackParamList } from "../navigation";
import { AppLockProvider } from "../hooks/useAppLock";
import { ThemeProvider } from "../theme/ThemeProvider";
import { renderWithProviders, setupFetchMock } from "../test-utils";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([]),
}));

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
  resetNetworkForTests();
  setupFetchMock();
});

afterEach(() => {
  setDev(originalDev);
});

async function renderSettings() {
  const screen = renderWithProviders(
    <AppLockProvider>
      <SettingsScreen />
    </AppLockProvider>
  );
  await screen.findByDisplayValue(getDefaultApiBaseUrl());
  return screen;
}

async function routeNames() {
  const ref = createNavigationContainerRef<RootStackParamList>();
  render(
    <ThemeProvider>
      <NavigationContainer ref={ref}>
        <AppLockProvider>
          <RootNavigator showOnboarding={false} />
        </AppLockProvider>
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

describe("theme toggle", () => {
  it("persists the selected theme", async () => {
    const screen = await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByText("Dark"));
    });
    await waitFor(async () => {
      expect(await AsyncStorage.getItem("@mindvault_theme_mode")).toBe("dark");
    });
  });
});

describe("api base url", () => {
  it("validates, saves and resets the API URL", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = await renderSettings();
    const input = screen.getByLabelText("API Base URL");

    fireEvent.changeText(input, "ftp://bad-url");
    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });
    expect(alertSpy).toHaveBeenCalledWith("Invalid URL", expect.any(String));

    fireEvent.changeText(input, "https://api.example.com");
    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });
    await waitFor(async () => {
      expect(await AsyncStorage.getItem("mindvault_api_base_url")).toBe("https://api.example.com");
    });
    expect(alertSpy).toHaveBeenCalledWith("Saved", "API base URL updated successfully.");

    await act(async () => {
      fireEvent.press(screen.getByText("Reset to Default"));
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue(getDefaultApiBaseUrl())).toBeTruthy();
    });
    alertSpy.mockRestore();
  });
});

describe("stellar network", () => {
  it("switches between test networks without a restart", async () => {
    setNetwork("testnet");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = await renderSettings();

    fireEvent.press(screen.getByLabelText("Select futurenet"));

    expect(getNetwork()).toBe("futurenet");
    expect(screen.getByText("Current: Futurenet")).toBeTruthy();
    expect(screen.getByLabelText("Network: futurenet")).toBeTruthy();
    alertSpy.mockRestore();
  });

  it("requires typed MAINNET confirmation before switching to mainnet", async () => {
    setNetwork("testnet");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    let promptCallback: ((value?: string) => void) | undefined;
    const promptSpy = jest
      .spyOn(Alert, "prompt")
      .mockImplementation((_title, _message, callback) => {
        promptCallback = callback as ((value?: string) => void) | undefined;
      });
    const screen = await renderSettings();

    fireEvent.press(screen.getByLabelText("Select mainnet"));
    promptCallback?.("mainnet");
    expect(getNetwork()).toBe("testnet");

    fireEvent.press(screen.getByLabelText("Select mainnet"));
    promptCallback?.("MAINNET");
    expect(getNetwork()).toBe("mainnet");

    promptSpy.mockRestore();
    alertSpy.mockRestore();
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
    expect(screen.getByText(/Private keys/)).toBeTruthy();
  });

  it("links to the privacy policy next to the clear buttons", async () => {
    const open = WebBrowser.openBrowserAsync as jest.MockedFunction<
      typeof WebBrowser.openBrowserAsync
    >;
    open.mockResolvedValue({ type: "cancel" } as WebBrowser.WebBrowserResult);
    const screen = await renderSettings();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Open privacy policy"));
    });

    expect(open).toHaveBeenCalledWith(
      "https://github.com/mind-vault-1/mindvault_mobile/blob/main/docs/PRIVACY.md"
    );
  });
});

describe("haptics", () => {
  it("persists the haptic feedback toggle", async () => {
    const screen = await renderSettings();
    const toggle = screen.getByLabelText("Haptic feedback");
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));

    await act(async () => {
      fireEvent(toggle, "valueChange", false);
    });

    await waitFor(async () => {
      expect(await AsyncStorage.getItem("@mindvault_haptics_enabled")).toBe("false");
    });
  });
});

describe("spending guard", () => {
  it("saves the per-payment limit in the versioned preferences store", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = await renderSettings();
    const input = screen.getByLabelText("Per-payment limit in USDC");

    fireEvent.changeText(input, "7.5");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Save spending limit"));
    });

    await waitFor(async () => {
      expect(await AsyncStorage.getItem("@mindvault_preferences:v1")).toBe(
        JSON.stringify({ version: 1, perPaymentLimit: "7.50" })
      );
    });
    alertSpy.mockRestore();
  });

  it("rejects an invalid per-payment limit", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = await renderSettings();
    const input = screen.getByLabelText("Per-payment limit in USDC");

    fireEvent.changeText(input, "0");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Save spending limit"));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "Invalid limit",
      "Enter a USDC amount greater than 0."
    );
    alertSpy.mockRestore();
  });
});

describe("language", () => {
  afterEach(async () => {
    const { applyLanguagePreference } = await import("../i18n");
    applyLanguagePreference("system");
  });

  it("offers System, English and Français and persists the choice", async () => {
    const screen = await renderSettings();

    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Use System" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Use English" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Use Français" })).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Use Français" }));
    });

    expect(await screen.findByText("Langue")).toBeTruthy();
    await waitFor(async () => {
      expect(await AsyncStorage.getItem("@mindvault_language")).toBe("fr");
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Utiliser la langue du système" }));
    });
    expect(await screen.findByText("Language")).toBeTruthy();
  });

  it("keeps the new language for the session when saving it fails", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const setItem = jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk"));
    const screen = await renderSettings();

    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Use Français" }));
    });

    expect(await screen.findByText("Langue")).toBeTruthy();
    expect(alertSpy).toHaveBeenCalled();
    setItem.mockRestore();
    alertSpy.mockRestore();
  });
});

describe("referrals", () => {
  it("shows earned referral rewards with clear labels", async () => {
    const referrals = jest.requireActual("../services/referrals");
    const reward = {
      id: "a", role: "referred", label: referrals.REWARD_LABELS.referred, referrerCode: "ABCDEF12",
      buyerCode: "12345678", txHash: "t", grantedAt: "2026-01-02T00:00:00.000Z",
    };
    const spy = jest
      .spyOn(referrals, "getReferralState")
      .mockResolvedValue({ referrerCode: "ABCDEF12", attributedAt: null, rewards: [reward] });
    const screen = await renderSettings();
    expect(await screen.findByText(referrals.REWARD_LABELS.referred)).toBeTruthy();
    expect(screen.getByText("Set up a wallet to get your referral code.")).toBeTruthy();
    spy.mockRestore();
  });
});
