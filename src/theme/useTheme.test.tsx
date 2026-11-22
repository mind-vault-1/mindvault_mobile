import React from "react";
import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor } from "@testing-library/react-native";

import { useTheme } from "./index";

let mockSystemScheme: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockSystemScheme,
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSystemScheme = "light";
});

function Probe({ onTheme }: { onTheme: (theme: ReturnType<typeof useTheme>) => void }) {
  const theme = useTheme();
  onTheme(theme);
  return <Text>{theme.themeMode}</Text>;
}

it("loads and persists a saved theme mode", async () => {
  await AsyncStorage.setItem("@mindvault_theme_mode", "dark");
  let current!: ReturnType<typeof useTheme>;
  render(<Probe onTheme={(theme) => { current = theme; }} />);
  await waitFor(() => expect(current.isLoading).toBe(false));
  expect(current.themeMode).toBe("dark");
  expect(current.colorScheme).toBe("dark");

  await act(async () => { await current.setThemeMode("light"); });
  expect(current.themeMode).toBe("light");
  expect(await AsyncStorage.getItem("@mindvault_theme_mode")).toBe("light");
});

it("falls back to system mode when the saved value is invalid", async () => {
  await AsyncStorage.setItem("@mindvault_theme_mode", "sepia");
  mockSystemScheme = "dark";
  let current!: ReturnType<typeof useTheme>;
  render(<Probe onTheme={(theme) => { current = theme; }} />);
  await waitFor(() => expect(current.isLoading).toBe(false));
  expect(current.themeMode).toBe("system");
  expect(current.colorScheme).toBe("dark");
});

it("uses system mode when there is no saved preference", async () => {
  mockSystemScheme = "dark";
  let current!: ReturnType<typeof useTheme>;
  render(<Probe onTheme={(theme) => { current = theme; }} />);
  await waitFor(() => expect(current.isLoading).toBe(false));
  expect(current.themeMode).toBe("system");
  expect(current.colorScheme).toBe("dark");
});
