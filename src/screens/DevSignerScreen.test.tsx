import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ScreenCapture from "expo-screen-capture";

import { ThemeProvider } from "../theme/ThemeProvider";
import { DevSignerScreen } from "./DevSignerScreen";

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useFocusEffect: jest.fn((effect: () => (() => void) | void) => effect()),
}));
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../components/ToastProvider", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock("@stellar/stellar-sdk", () => ({
  Account: jest.fn(),
  Keypair: { fromSecret: jest.fn() },
  TransactionBuilder: jest.fn(),
  Networks: { TESTNET: "Test SDF Network ; September 2015" },
  Asset: { native: jest.fn() },
  Operation: { payment: jest.fn() },
  StrKey: { isValidEd25519SecretSeed: jest.fn().mockReturnValue(true) },
}));

const mockedUseFocusEffect = useFocusEffect as jest.Mock;
const mockedPrevent = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
const mockedAllow = ScreenCapture.allowScreenCaptureAsync as jest.Mock;

function renderScreen() {
  return render(
    <ThemeProvider>
      <DevSignerScreen />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("blocks screen capture while the secret input is focused", () => {
  renderScreen();
  expect(mockedPrevent).toHaveBeenCalledWith("mindvault-dev-signer");
  expect(mockedAllow).not.toHaveBeenCalled();
});

it("releases the block and clears the secret when the screen loses focus", () => {
  const screen = renderScreen();
  const input = screen.getByPlaceholderText("S...");
  fireEvent.changeText(input, "S-super-secret");

  const cleanup: (() => void) | undefined = mockedUseFocusEffect.mock.results[0]?.value;
  expect(typeof cleanup).toBe("function");
  act(() => cleanup?.());

  expect(mockedAllow).toHaveBeenCalledWith("mindvault-dev-signer");
  expect(input.props.value).toBe("");
});
