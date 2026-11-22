import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { initiateTip, submitTip } from "../api/tips";
import { signPaymentTransaction } from "../api/payment";
import { ThemeProvider } from "../theme/ThemeProvider";
import { TipSheet } from "./TipSheet";

jest.mock("../api/tips", () => ({
  TIP_PRESETS: ["1.00", "5.00", "10.00", "25.00"],
  initiateTip: jest.fn(),
  submitTip: jest.fn(),
}));
jest.mock("../api/payment", () => ({
  signPaymentTransaction: jest.fn(() => "signed-xdr"),
}));
jest.mock("../theme/ThemeProvider", () => {
  const colors = new Proxy({}, { get: () => "#000000" });
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    useAppTheme: () => ({ colors }),
  };
});

const mockedInitiateTip = initiateTip as jest.Mock;
const mockedSubmitTip = submitTip as jest.Mock;
const mockedSign = signPaymentTransaction as jest.Mock;

const CHALLENGE = {
  challenge: "challenge-id",
  amount: "1.00",
  networkPassphrase: "Test SDF Network ; September 2015",
  assetCode: "USDC",
  assetIssuer: "GTEST",
  destination: "GDEST",
} as never;

function renderSheet(props: Partial<React.ComponentProps<typeof TipSheet>> = {}) {
  const onTipSent = jest.fn();
  const onDismiss = jest.fn();
  const screen = render(
    <ThemeProvider>
      <TipSheet
        publisherId="publisher-1"
        resourceId="resource-1"
        resourceTitle="A great resource"
        onTipSent={onTipSent}
        onDismiss={onDismiss}
        {...props}
      />
    </ThemeProvider>
  );
  return { ...screen, onTipSent, onDismiss };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedInitiateTip.mockResolvedValue(CHALLENGE);
  mockedSubmitTip.mockResolvedValue({ tipId: "tip-1" });
});

it("renders the tip title and preset amounts", () => {
  const screen = renderSheet();
  expect(screen.getByText("Send a Tip")).toBeTruthy();
  expect(screen.getByText(/A great resource/)).toBeTruthy();
  for (const amount of ["$1.00", "$5.00", "$10.00", "$25.00"]) {
    expect(screen.getByText(amount)).toBeTruthy();
  }
});

it("shows a validation error when no amount is selected", async () => {
  const screen = renderSheet();
  fireEvent.press(screen.getByText("Continue"));
  await waitFor(() => expect(screen.getByText(/Please enter a tip amount/)).toBeTruthy());
  expect(mockedInitiateTip).not.toHaveBeenCalled();
});

it("initiates a tip with a preset amount and optional note", async () => {
  const screen = renderSheet();
  fireEvent.press(screen.getByText("$5.00"));
  fireEvent.changeText(screen.getByPlaceholderText("Thank you for this amazing content!"), "Great work");
  fireEvent.press(screen.getByText("Continue"));

  await waitFor(() =>
    expect(mockedInitiateTip).toHaveBeenCalledWith({
      publisherId: "publisher-1",
      resourceId: "resource-1",
      amount: "5.00",
      note: "Great work",
    })
  );
  await waitFor(() => expect(screen.getByText("Secret key (to sign tip)")).toBeTruthy());
});

it("initiates a tip with a custom amount and clears the preset selection", async () => {
  const screen = renderSheet();
  fireEvent.press(screen.getByText("$1.00"));
  fireEvent.changeText(screen.getByPlaceholderText("0.00"), "7.50");
  fireEvent.press(screen.getByText("Continue"));

  await waitFor(() => expect(mockedInitiateTip).toHaveBeenCalledWith(
    expect.objectContaining({ amount: "7.50", note: undefined })
  ));
});

it("shows an error when initiating the tip fails", async () => {
  mockedInitiateTip.mockRejectedValueOnce(new Error("Network unavailable"));
  const screen = renderSheet();
  fireEvent.press(screen.getByText("$1.00"));
  fireEvent.press(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("Network unavailable")).toBeTruthy());
  expect(screen.getByText("Continue")).toBeTruthy();
});

it("requires a secret key before sending", async () => {
  const screen = renderSheet();
  fireEvent.press(screen.getByText("$1.00"));
  fireEvent.press(screen.getByText("Continue"));
  await waitFor(() => expect(screen.getByText("Send Tip")).toBeTruthy());

  fireEvent.press(screen.getByText("Send Tip"));
  await waitFor(() => expect(screen.getByText(/Enter your secret key/)).toBeTruthy());
  expect(mockedSubmitTip).not.toHaveBeenCalled();
});

it("signs and submits the tip, notifies the caller and dismisses", async () => {
  const screen = renderSheet();
  fireEvent.press(screen.getByText("$10.00"));
  fireEvent.press(screen.getByText("Continue"));
  await waitFor(() => expect(screen.getByText("Send Tip")).toBeTruthy());

  fireEvent.changeText(screen.getByPlaceholderText("S..."), "SSECRET");
  fireEvent.press(screen.getByText("Send Tip"));

  await waitFor(() => expect(mockedSign).toHaveBeenCalledWith(CHALLENGE, "SSECRET"));
  await waitFor(() => expect(mockedSubmitTip).toHaveBeenCalledWith(CHALLENGE, "signed-xdr", { note: undefined }));
  await waitFor(() => expect(screen.onTipSent).toHaveBeenCalledWith("10.00"));
  expect(screen.onDismiss).toHaveBeenCalledTimes(1);
});

it("shows an error when signing or submitting fails", async () => {
  mockedSign.mockRejectedValueOnce(new Error("Signing failed"));
  const screen = renderSheet();
  fireEvent.press(screen.getByText("$1.00"));
  fireEvent.press(screen.getByText("Continue"));
  await waitFor(() => expect(screen.getByText("Send Tip")).toBeTruthy());

  fireEvent.changeText(screen.getByPlaceholderText("S..."), "SSECRET");
  fireEvent.press(screen.getByText("Send Tip"));

  await waitFor(() => expect(screen.getByText("Signing failed")).toBeTruthy());
  expect(screen.onDismiss).not.toHaveBeenCalled();
});

it("dismisses when cancel is pressed", () => {
  const screen = renderSheet();
  fireEvent.press(screen.getByText("Cancel"));
  expect(screen.onDismiss).toHaveBeenCalledTimes(1);
});
