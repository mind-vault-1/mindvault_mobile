import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";

import { ScannerScreen } from "./ScannerScreen";
import { renderWithProviders } from "../test-utils";

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn().mockResolvedValue(""),
}));

jest.mock("react-native-safe-area-context", () =>
  require("../test-utils").safeAreaMock()
);

describe("ScannerScreen paste flow", () => {
  const navigation = {
    replace: jest.fn(),
    goBack: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderScreen() {
    return renderWithProviders(<ScannerScreen navigation={navigation} />);
  }

  it("opens the paste modal", () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText("Paste Link Instead"));

    expect(screen.getByText("Enter Resource Link")).toBeTruthy();
    expect(screen.getByPlaceholderText("https://mindvault.app/resources/…")).toBeTruthy();
  });

  it("navigates for a valid resource link", async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText("Paste Link Instead"));
    fireEvent.changeText(
      screen.getByPlaceholderText("https://mindvault.app/resources/…"),
      "mindvault://resources/abc",
    );
    fireEvent.press(screen.getByText("Go"));

    expect(navigation.replace).toHaveBeenCalledWith("ResourceDetail", { resourceId: "abc" });
    await waitFor(() =>
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light)
    );
  });

  it("shows an error for an invalid resource link", () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText("Paste Link Instead"));
    fireEvent.changeText(
      screen.getByPlaceholderText("https://mindvault.app/resources/…"),
      "not-a-resource-link",
    );
    fireEvent.press(screen.getByText("Go"));

    expect(screen.getByText("This doesn't look like a valid MindVault resource URL.")).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
