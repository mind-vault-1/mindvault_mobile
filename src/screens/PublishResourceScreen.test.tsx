import * as Clipboard from "expo-clipboard";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { publishLink } from "../api/publish";
import { signPaymentTransaction } from "../api/payment";
import { ToastProvider } from "../components/ToastProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { PublishResourceScreen } from "./PublishResourceScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () =>
  require("../test-utils").navigationMock({
    navigate: (...args: unknown[]) => mockNavigate(...args),
  })
);
jest.mock("react-native-safe-area-context", () =>
  require("../test-utils").safeAreaMock()
);
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

jest.mock("../api/publish", () => ({
  ...jest.requireActual("../api/publish"),
  publishLink: jest.fn(),
}));
jest.mock("../api/payment", () => ({
  signPaymentTransaction: jest.fn(),
  sorobanRpcUrl: jest.fn(() => "https://rpc.example.com"),
}));

// The real sheet is covered by its own tests; this stub signs with a fixed secret.
jest.mock("../components/SignTransactionSheet", () => {
  const { Pressable, Text } = require("react-native");
  return {
    SignTransactionSheet: ({
      sign,
      onSigned,
    }: {
      sign: (secret: string) => Promise<string>;
      onSigned: (xdr: string) => Promise<void>;
    }) => (
      <Pressable accessibilityRole="button" onPress={async () => onSigned(await sign("SECRET"))}>
        <Text>Sign</Text>
      </Pressable>
    ),
  };
});

const mockedPublishLink = publishLink as jest.MockedFunction<typeof publishLink>;
const mockedSign = signPaymentTransaction as jest.MockedFunction<typeof signPaymentTransaction>;

const resource = {
  id: "res-1",
  title: "Stellar handbook",
  price: "1.5",
  resourceType: "link",
  walletAddress: "GABC",
  verificationStatus: "pending" as const,
  onchainStatus: "none" as const,
  listed: true,
  accessUrl: "https://api.example.com/resources/res-1",
};

const challenge = {
  x402Version: 2,
  accepted: {
    scheme: "exact",
    network: "stellar:testnet",
    asset: "CASSET",
    amount: "5000000",
    payTo: "GPAY",
    maxTimeoutSeconds: 60,
    extra: { areFeesSponsored: true },
  },
  resource: {},
};

async function renderScreen() {
  const screen = render(
    <ThemeProvider>
      <ToastProvider>
        <PublishResourceScreen />
      </ToastProvider>
    </ThemeProvider>
  );
  await act(async () => {});
  return screen;
}

function fillForm(screen: Awaited<ReturnType<typeof renderScreen>>) {
  fireEvent.changeText(screen.getByLabelText("Title"), "Stellar handbook");
  fireEvent.changeText(screen.getByLabelText("URL"), "https://example.com/handbook");
  fireEvent.changeText(screen.getByLabelText("Price (USDC)"), "1.5");
  fireEvent.changeText(screen.getByLabelText("Description (optional)"), "A guide");
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("shows validation errors and does not submit an invalid form", async () => {
  const screen = await renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(screen.getByText("Title is required.")).toBeTruthy();
  expect(screen.getByText("URL is required.")).toBeTruthy();
  expect(screen.getByText("Price is required.")).toBeTruthy();
  expect(mockedPublishLink).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText("Title"), "Fixed");
  expect(screen.queryByText("Title is required.")).toBeNull();
});

it("publishes and shows the new resource with its access URL", async () => {
  mockedPublishLink.mockResolvedValue({ type: "published", resource });
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText("Stellar handbook")).toBeTruthy();
  expect(screen.getByText(resource.accessUrl)).toBeTruthy();
  expect(mockedPublishLink).toHaveBeenCalledWith(
    {
      title: "Stellar handbook",
      url: "https://example.com/handbook",
      price: "1.5",
      description: "A guide",
    },
    undefined
  );

  fireEvent.press(screen.getByRole("button", { name: "Copy access URL" }));
  await waitFor(() =>
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(resource.accessUrl)
  );

  fireEvent.press(screen.getByRole("button", { name: "View resource" }));
  expect(mockNavigate).toHaveBeenCalledWith("ResourceDetail", { resourceId: "res-1" });
});

it("pays the verification fee and then publishes", async () => {
  mockedPublishLink
    .mockResolvedValueOnce({ type: "payment", challenge, fee: "0.5" })
    .mockResolvedValueOnce({ type: "published", resource });
  mockedSign.mockResolvedValue("signed-xdr");
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText(/one-time fee of 0.5 USDC/)).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Pay 0.5 USDC and publish" }));
  fireEvent.press(await screen.findByText("Sign"));

  expect(await screen.findByText(resource.accessUrl)).toBeTruthy();
  expect(mockedSign).toHaveBeenCalledWith(challenge, "SECRET", "https://rpc.example.com");
  expect(mockedPublishLink).toHaveBeenLastCalledWith(expect.any(Object), {
    challenge,
    transaction: "signed-xdr",
  });
});

it("shows a server error and keeps the form", async () => {
  mockedPublishLink.mockRejectedValue(new Error("Unauthorized: Invalid API key"));
  const screen = await renderScreen();

  fillForm(screen);
  fireEvent.press(screen.getByRole("button", { name: "Publish resource" }));

  expect(await screen.findByText("Unauthorized: Invalid API key")).toBeTruthy();
  expect(screen.getByDisplayValue("Stellar handbook")).toBeTruthy();
});
