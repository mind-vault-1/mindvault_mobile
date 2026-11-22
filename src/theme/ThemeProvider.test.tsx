import React, { memo } from "react";
import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor } from "@testing-library/react-native";

import { darkColors, getNavigationTheme, lightColors } from "./index";
import { ThemeProvider, useAppTheme } from "./ThemeProvider";

let mockScheme: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockScheme,
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  mockScheme = "light";
});

it("keeps context and style references stable on unrelated provider renders and updates consumers on theme changes", async () => {
  const renderConsumer = jest.fn();
  let theme!: ReturnType<typeof useAppTheme>;
  const Consumer = memo(function Consumer() {
    theme = useAppTheme();
    renderConsumer();
    return <Text>{theme.themeMode}</Text>;
  });
  const screen = render(<ThemeProvider><Consumer /></ThemeProvider>);
  await waitFor(() => expect(theme.isLoading).toBe(false));
  const initial = theme;
  const renderCount = renderConsumer.mock.calls.length;

  screen.rerender(<ThemeProvider><Consumer /></ThemeProvider>);
  expect(renderConsumer).toHaveBeenCalledTimes(renderCount);
  expect(theme).toBe(initial);

  await act(async () => { await theme.setThemeMode("dark"); });
  expect(renderConsumer.mock.calls.length).toBeGreaterThan(renderCount);
  expect(theme.colors).toBe(darkColors);
  expect(theme.typography.heading).toEqual({ fontSize: 20, lineHeight: 28, fontWeight: "700", color: darkColors.text });
  expect(theme.shared.screen).toEqual({ flex: 1, backgroundColor: darkColors.background });

  const dark = theme;
  screen.rerender(<ThemeProvider><Consumer /></ThemeProvider>);
  expect(theme.typography).toBe(dark.typography);
  expect(theme.shared).toBe(dark.shared);
  expect(theme.setThemeMode).toBe(initial.setThemeMode);
  expect(await AsyncStorage.getItem("@mindvault_theme_mode")).toBe("dark");
});

it("preserves light, dark and system values and native font scaling", async () => {
  let theme!: ReturnType<typeof useAppTheme>;
  function Consumer() {
    theme = useAppTheme();
    return null;
  }
  const screen = render(<ThemeProvider><Consumer /></ThemeProvider>);
  await waitFor(() => expect(theme.isLoading).toBe(false));
  expect(theme.colors).toBe(lightColors);
  expect(theme.typography.body).toEqual({ fontSize: 14, lineHeight: 20, color: lightColors.textMuted });

  mockScheme = "dark";
  screen.rerender(<ThemeProvider><Consumer /></ThemeProvider>);
  expect(theme.colors).toBe(darkColors);
  expect(theme.colorScheme).toBe("dark");
  await act(async () => { await theme.setThemeMode("light"); });
  expect(theme.colors).toBe(lightColors);
  expect(theme.colorScheme).toBe("light");
  // RN applies the user's font scale natively; memoisation must not scale twice.
  expect(theme.typography.body.fontSize).toBe(14);
  expect(theme.typography.body.lineHeight).toBe(20);
});

it("reuses navigation themes for unchanged colors and schemes", () => {
  const light = getNavigationTheme(lightColors, "light");
  expect(getNavigationTheme(lightColors, "light")).toBe(light);
  expect(light.colors.background).toBe(lightColors.background);
  const dark = getNavigationTheme(darkColors, "dark");
  expect(dark).not.toBe(light);
  expect(dark.dark).toBe(true);
  expect(dark.colors.text).toBe(darkColors.text);
});
