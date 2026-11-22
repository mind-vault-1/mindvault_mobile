import React from "react";
import { Alert, Linking } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";

import { ScannerScreen } from "./ScannerScreen";
import { ThemeProvider } from "../theme/ThemeProvider";

type ScanHandler = ((event: { data: string }) => void) | undefined;

// The camera is replaced by a stub that exposes its current scan handler, so
// tests can "scan" a code and check whether scanning is paused (no handler).
let mockOnBarcodeScanned: ScanHandler;
let mockPermission: { granted: boolean } | null;
const mockRequestPermission = jest.fn();

jest.mock("expo-camera", () => ({
  CameraView: (props: { onBarcodeScanned: ScanHandler }) => {
    mockOnBarcodeScanned = props.onBarcodeScanned;
    return null;
  },
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
}));

jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const navigation = {
  replace: jest.fn(),
  goBack: jest.fn(),
} as unknown as React.ComponentProps<typeof ScannerScreen>["navigation"];

const RETRY_MS = 2500;
const PLACEHOLDER = "https://mindvault.app/resources/…";

let alertSpy: jest.SpyInstance;
let openURLSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  mockOnBarcodeScanned = undefined;
  mockPermission = { granted: true };
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  openURLSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

async function renderScreen() {
  const screen = render(
    <ThemeProvider>
      <ScannerScreen navigation={navigation} />
    </ThemeProvider>
  );
  // Let ThemeProvider finish loading the saved theme inside act().
  await act(async () => {});
  return screen;
}

function scan(data: string) {
  expect(mockOnBarcodeScanned).toBeDefined();
  act(() => mockOnBarcodeScanned?.({ data }));
}

/** Presses one of the buttons passed to the most recent Alert.alert call. */
function pressAlertButton(text: string) {
  const buttons = alertSpy.mock.lastCall?.[2] as { text: string; onPress?: () => void }[];
  act(() => buttons.find((button) => button.text === text)?.onPress?.());
}

describe("ScannerScreen permission states", () => {
  it("shows a waiting message while the permission is unknown", async () => {
    mockPermission = null;
    const screen = await renderScreen();

    expect(screen.getByText("Requesting camera permission…")).toBeTruthy();
    expect(mockOnBarcodeScanned).toBeUndefined();
  });

  it("asks for camera access when the permission is denied", async () => {
    mockPermission = { granted: false };
    const screen = await renderScreen();

    expect(screen.getByText("Camera access is required")).toBeTruthy();
    fireEvent.press(screen.getByText("Grant Permission"));
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("ScannerScreen scanning", () => {
  it("navigates to the resource for a valid code and stops scanning", async () => {
    await renderScreen();

    scan("https://api.example.com/resources/abc%20123");

    expect(navigation.replace).toHaveBeenCalledWith("ResourceDetail", { resourceId: "abc 123" });
    expect(mockOnBarcodeScanned).toBeUndefined();
  });

  it("shows an inline error for an unknown code, then resumes after the retry timer", async () => {
    const screen = await renderScreen();

    scan("just some text");

    expect(screen.getByText("Unrecognized QR code. Point at a MindVault resource code.")).toBeTruthy();
    expect(mockOnBarcodeScanned).toBeUndefined();

    act(() => jest.advanceTimersByTime(RETRY_MS - 1));
    expect(screen.queryByText(/Unrecognized QR code/)).toBeTruthy();

    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText(/Unrecognized QR code/)).toBeNull();
    expect(mockOnBarcodeScanned).toBeDefined();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("clears the retry timer on unmount", async () => {
    const screen = await renderScreen();

    scan("just some text");
    expect(jest.getTimerCount()).toBe(1);

    screen.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("asks before opening an external URL and opens it on confirm", async () => {
    await renderScreen();

    scan("https://example.com/page");

    expect(alertSpy).toHaveBeenCalledWith("Open URL", "https://example.com/page", expect.any(Array));
    pressAlertButton("Open");
    expect(openURLSpy).toHaveBeenCalledWith("https://example.com/page");
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("resumes scanning when the external URL prompt is cancelled", async () => {
    await renderScreen();

    scan("https://example.com/page");
    expect(mockOnBarcodeScanned).toBeUndefined();

    pressAlertButton("Cancel");
    expect(mockOnBarcodeScanned).toBeDefined();
    expect(openURLSpy).not.toHaveBeenCalled();
  });
});

describe("ScannerScreen paste flow", () => {
  it("fills the field from the clipboard and navigates on Go", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue("  mindvault://resources/xyz  ");
    const screen = await renderScreen();

    fireEvent.press(screen.getByText("Paste Link Instead"));
    await act(async () => {
      fireEvent.press(screen.getByText("Paste from Clipboard"));
    });

    expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe("mindvault://resources/xyz");
    fireEvent.press(screen.getByText("Go"));
    expect(navigation.replace).toHaveBeenCalledWith("ResourceDetail", { resourceId: "xyz" });
  });

  it("keeps Go disabled until something is entered", async () => {
    const screen = await renderScreen();

    fireEvent.press(screen.getByText("Paste Link Instead"));
    fireEvent.press(screen.getByText("Go"));

    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Enter or paste a MindVault resource URL.")).toBeNull();
  });

  it("closes the modal and prompts before opening a pasted external URL", async () => {
    const screen = await renderScreen();

    fireEvent.press(screen.getByText("Paste Link Instead"));
    fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "https://example.com/page");
    fireEvent.press(screen.getByText("Go"));

    expect(alertSpy).toHaveBeenCalledWith("Open URL", "https://example.com/page", expect.any(Array));
    pressAlertButton("Open");
    expect(openURLSpy).toHaveBeenCalledWith("https://example.com/page");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("clears the typed value when the modal is cancelled", async () => {
    const screen = await renderScreen();

    fireEvent.press(screen.getByText("Paste Link Instead"));
    fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "draft");
    fireEvent.press(screen.getByText("Cancel"));
    fireEvent.press(screen.getByText("Paste Link Instead"));

    expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe("");
  });
});
