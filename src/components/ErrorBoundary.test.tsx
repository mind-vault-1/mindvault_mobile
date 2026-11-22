import * as Clipboard from "expo-clipboard";
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { ThemeProvider } from "../theme/ThemeProvider";
import { ErrorBoundary } from "./ErrorBoundary";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));

const SECRET = "SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ2345";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it("shows the fallback when a child throws and retry remounts it", () => {
  let shouldThrow = true;
  function Child() {
    if (shouldThrow) {
      shouldThrow = false;
      throw new Error("render failed");
    }
    return <Text>Recovered content</Text>;
  }

  const screen = render(
    <ThemeProvider>
      <ErrorBoundary><Child /></ErrorBoundary>
    </ThemeProvider>
  );
  expect(screen.getByText("Something went wrong")).toBeTruthy();

  fireEvent.press(screen.getByText("Try again"));
  expect(screen.getByText("Recovered content")).toBeTruthy();
});

it("copies only redacted error details", async () => {
  function ThrowingChild(): React.ReactElement {
    throw new Error(`secret=${SECRET}`);
  }
  const screen = render(
    <ThemeProvider>
      <ErrorBoundary><ThrowingChild /></ErrorBoundary>
    </ThemeProvider>
  );

  fireEvent.press(screen.getByText("Copy error details"));
  await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalled());
  const copied = (Clipboard.setStringAsync as jest.Mock).mock.calls[0][0] as string;
  expect(copied).toContain("[redacted]");
  expect(copied).not.toContain(SECRET);
});
