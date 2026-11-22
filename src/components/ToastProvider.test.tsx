import { act, fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo, Pressable, Text } from "react-native";

import { TOAST_DURATION_MS, ToastProvider, useToast, type ToastVariant } from "./ToastProvider";
import { ThemeProvider } from "../theme/ThemeProvider";

jest.mock("react-native-safe-area-context", () =>
  require("../test-utils").safeAreaMock()
);

function Trigger({ message, variant }: { message: string; variant?: ToastVariant }) {
  const toast = useToast();
  return (
    <Pressable accessibilityRole="button" onPress={() => toast.show(message, variant)}>
      <Text>{`show ${message}`}</Text>
    </Pressable>
  );
}

function renderWithToasts(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("shows a toast and hides it after the duration", async () => {
  const screen = renderWithToasts(<Trigger message="Saved" />);
  await act(async () => {});

  fireEvent.press(screen.getByText("show Saved"));
  expect(screen.getByText("Saved")).toBeTruthy();

  act(() => jest.advanceTimersByTime(TOAST_DURATION_MS));
  expect(screen.queryByText("Saved")).toBeNull();
});

it("queues toasts and shows them one at a time", async () => {
  const screen = renderWithToasts(
    <>
      <Trigger message="First" />
      <Trigger message="Second" />
    </>
  );
  await act(async () => {});

  fireEvent.press(screen.getByText("show First"));
  fireEvent.press(screen.getByText("show Second"));
  expect(screen.getByText("First")).toBeTruthy();
  expect(screen.queryByText("Second")).toBeNull();

  act(() => jest.advanceTimersByTime(TOAST_DURATION_MS));
  expect(screen.queryByText("First")).toBeNull();
  expect(screen.getByText("Second")).toBeTruthy();

  act(() => jest.advanceTimersByTime(TOAST_DURATION_MS));
  expect(screen.queryByTestId("toast")).toBeNull();
});

it("announces toasts and marks errors as assertive alerts", async () => {
  const screen = renderWithToasts(<Trigger message="Failed" variant="error" />);
  await act(async () => {});

  fireEvent.press(screen.getByText("show Failed"));

  const toast = screen.getByTestId("toast");
  expect(toast.props.accessibilityLiveRegion).toBe("assertive");
  expect(toast.props.accessibilityRole).toBe("alert");
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith("Failed");
});

it("uses a polite live region for success and info toasts", async () => {
  const screen = renderWithToasts(<Trigger message="Done" variant="success" />);
  await act(async () => {});

  fireEvent.press(screen.getByText("show Done"));

  expect(screen.getByTestId("toast").props.accessibilityLiveRegion).toBe("polite");
});

it("throws when useToast is used outside a provider", () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Trigger message="x" />)).toThrow(
    "useToast must be used inside a ToastProvider"
  );
});
