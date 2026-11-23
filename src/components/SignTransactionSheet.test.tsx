import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Account, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import * as ScreenCapture from "expo-screen-capture";
import { Linking, type EmitterSubscription } from "react-native";

import { signTransactionXdr } from "../api/resources";
import { authenticate, isAvailable } from "../services/biometrics";
import { getPublicKey, signWithBiometrics } from "../services/wallet";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SEP7_CALLBACK_URL } from "../utils/sep7";
import { SignTransactionSheet } from "./SignTransactionSheet";

jest.unmock("@stellar/stellar-sdk");

jest.mock("../api/resources", () => ({
  DEFAULT_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  signTransactionXdr: jest.fn(() => "signed-xdr"),
}));
jest.mock("../services/biometrics", () => ({
  authenticate: jest.fn(),
  isAvailable: jest.fn(),
}));
jest.mock("../services/wallet", () => ({
  getPublicKey: jest.fn(),
  signWithBiometrics: jest.fn(),
}));
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../utils/validateStellarSecret", () => ({
  validateStellarSecret: (value: string) =>
    value === "SCXZ7ZA2UUWX4SWVRPE3ENOZAOLG6A53YLBT6A43EFDE25N4MXZ75AAC"
      ? { isValid: true, errorMessage: null }
      : {
          isValid: false,
          errorMessage: value.startsWith("S")
            ? "Invalid secret key. Check the key and try again."
            : "Invalid secret key format. Stellar secret keys start with 'S'.",
        },
}));
jest.mock("../theme/ThemeProvider", () => {
  const colors = new Proxy({}, { get: () => "#000000" });
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    useAppTheme: () => ({
      colors,
      shared: { button: {}, buttonText: {} },
      typography: { heading: {} },
    }),
  };
});

const mockedSign = signTransactionXdr as jest.Mock;
const mockedAuthenticate = authenticate as jest.Mock;
const mockedIsAvailable = isAvailable as jest.Mock;
const mockedPreventCapture = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
const mockedAllowCapture = ScreenCapture.allowScreenCaptureAsync as jest.Mock;
const mockedGetPublicKey = getPublicKey as jest.Mock;
const mockedSignWithBiometrics = signWithBiometrics as jest.Mock;
const VALID_SECRET = "SCXZ7ZA2UUWX4SWVRPE3ENOZAOLG6A53YLBT6A43EFDE25N4MXZ75AAC";
const TESTNET = "Test SDF Network ; September 2015";
const LOCAL_KEYPAIR = Keypair.random();
let urlListener: ((event: { url: string }) => void) | undefined;

function buildTransactionXdr(source: string) {
  return new TransactionBuilder(new Account(source, "1"), {
    fee: "100",
    networkPassphrase: TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(30)
    .build()
    .toXDR();
}

function renderSheet(props: Partial<React.ComponentProps<typeof SignTransactionSheet>> = {}) {
  const onSigned = jest.fn();
  const onCancel = jest.fn();
  const screen = render(
    <ThemeProvider>
      <SignTransactionSheet
        visible
        unsignedXdr="unsigned-xdr"
        networkPassphrase="Test SDF Network ; September 2015"
        onSigned={onSigned}
        onCancel={onCancel}
        {...props}
      />
    </ThemeProvider>
  );
  return { ...screen, onSigned, onCancel };
}

beforeEach(() => {
  jest.clearAllMocks();
  urlListener = undefined;
  mockedAuthenticate.mockResolvedValue("success");
  mockedIsAvailable.mockResolvedValue(true);
  mockedGetPublicKey.mockResolvedValue(null);
  mockedSignWithBiometrics.mockResolvedValue("signed-local-xdr");
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  jest.spyOn(Linking, "getInitialURL").mockResolvedValue(null);
  jest.spyOn(Linking, "addEventListener").mockImplementation((_event, handler) => {
    urlListener = handler as (event: { url: string }) => void;
    return { remove: jest.fn() } as unknown as EmitterSubscription;
  });
});

it("shows the network, masks the secret, and submits only a signed XDR", async () => {
  const secret = VALID_SECRET;
  const screen = renderSheet();

  expect(screen.getByText(/Network passphrase: Test SDF Network/)).toBeTruthy();
  expect(screen.getByText(/Development\/test network/)).toBeTruthy();
  expect(screen.getByLabelText("Stellar secret key").props.secureTextEntry).toBe(true);

  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), secret);
  fireEvent.press(screen.getByText("Sign"));

  await waitFor(() => expect(screen.onSigned).toHaveBeenCalledWith("signed-xdr"));
  expect(mockedSign).toHaveBeenCalledWith(
    "unsigned-xdr",
    secret,
    "Test SDF Network ; September 2015"
  );
  expect(screen.onSigned).not.toHaveBeenCalledWith("unsigned-xdr");
  expect(screen.getByLabelText("Stellar secret key").props.value).toBe("");
});

it("does not sign or submit an invalid secret", () => {
  const screen = renderSheet();
  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), "not-a-secret");
  fireEvent(screen.getByLabelText("Stellar secret key"), "blur");

  expect(screen.getByText(/Stellar secret keys start with/)).toBeTruthy();
  expect(screen.getByText("Sign").parent?.props.accessibilityState?.disabled).not.toBe(false);
  expect(mockedSign).not.toHaveBeenCalled();
  expect(screen.onSigned).not.toHaveBeenCalled();
});

it("clears the secret on cancel and when reopened", () => {
  const secret = VALID_SECRET;
  const screen = renderSheet();
  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), secret);
  fireEvent.press(screen.getByText("Cancel"));
  expect(screen.onCancel).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Stellar secret key").props.value).toBe("");

  screen.rerender(
    <ThemeProvider>
      <SignTransactionSheet
        visible={false}
        unsignedXdr="unsigned-xdr"
        onSigned={screen.onSigned}
        onCancel={screen.onCancel}
      />
    </ThemeProvider>
  );
  screen.rerender(
    <ThemeProvider>
      <SignTransactionSheet
        visible
        unsignedXdr="unsigned-xdr"
        onSigned={screen.onSigned}
        onCancel={screen.onCancel}
      />
    </ThemeProvider>
  );
  expect(screen.getByLabelText("Stellar secret key").props.value).toBe("");
});

it("shows an error in the sheet and does not submit when signing fails", async () => {
  mockedSign.mockImplementationOnce(() => {
    throw new Error("XDR Read Error: unknown ArmType");
  });
  const screen = renderSheet();

  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), VALID_SECRET);
  fireEvent.press(screen.getByText("Sign"));

  expect(await screen.findByText(/Couldn't sign this transaction/)).toBeTruthy();
  expect(screen.onSigned).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Stellar secret key").props.value).toBe("");
});

it("uses a custom signer when given one and shows its error message", async () => {
  const sign = jest
    .fn()
    .mockRejectedValueOnce(new Error("The payment simulation failed: insufficient balance"))
    .mockResolvedValueOnce("signed-payment-xdr");
  const screen = renderSheet({ unsignedXdr: "", sign });

  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), VALID_SECRET);
  fireEvent.press(screen.getByText("Sign"));
  expect(
    await screen.findByText("The payment simulation failed: insufficient balance")
  ).toBeTruthy();
  expect(screen.onSigned).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), VALID_SECRET);
  fireEvent.press(screen.getByText("Sign"));
  await waitFor(() => expect(screen.onSigned).toHaveBeenCalledWith("signed-payment-xdr"));
  expect(sign).toHaveBeenCalledWith(VALID_SECRET);
  expect(mockedSign).not.toHaveBeenCalled();
});

it("prompts for biometrics with the action-specific reason before signing", async () => {
  const screen = renderSheet({ action: "lease this resource" });

  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), VALID_SECRET);
  fireEvent.press(screen.getByText("Sign"));

  await waitFor(() => expect(screen.onSigned).toHaveBeenCalledWith("signed-xdr"));
  expect(mockedAuthenticate).toHaveBeenCalledWith("Authenticate to lease this resource");
});

it("does not sign when the user cancels the biometric prompt", async () => {
  mockedAuthenticate.mockResolvedValue("cancelled");
  const screen = renderSheet();

  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), VALID_SECRET);
  fireEvent.press(screen.getByText("Sign"));

  expect(await screen.findByText(/Biometric authentication was not completed/)).toBeTruthy();
  expect(mockedSign).not.toHaveBeenCalled();
  expect(screen.onSigned).not.toHaveBeenCalled();
});

it("does not sign when biometric authentication fails", async () => {
  mockedAuthenticate.mockResolvedValue("failed");
  const screen = renderSheet();

  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), VALID_SECRET);
  fireEvent.press(screen.getByText("Sign"));

  expect(await screen.findByText(/Biometric authentication failed/)).toBeTruthy();
  expect(mockedSign).not.toHaveBeenCalled();
  expect(screen.onSigned).not.toHaveBeenCalled();
});

it("blocks screen capture while visible and releases it when closed", () => {
  const screen = renderSheet();

  expect(mockedPreventCapture).toHaveBeenCalledWith("mindvault-sign-transaction-sheet");
  expect(mockedAllowCapture).not.toHaveBeenCalled();

  screen.rerender(
    <ThemeProvider>
      <SignTransactionSheet
        visible={false}
        unsignedXdr="unsigned-xdr"
        onSigned={screen.onSigned}
        onCancel={screen.onCancel}
      />
    </ThemeProvider>
  );

  expect(mockedAllowCapture).toHaveBeenCalledWith("mindvault-sign-transaction-sheet");
});

it("falls back to the secret-entry flow with an explanation when biometrics are unavailable", async () => {
  mockedIsAvailable.mockResolvedValue(false);
  mockedAuthenticate.mockResolvedValue("unavailable");
  const screen = renderSheet();

  expect(
    await screen.findByText(/Biometric authentication is unavailable on this device/)
  ).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText("Stellar secret key"), VALID_SECRET);
  fireEvent.press(screen.getByText("Sign"));

  await waitFor(() => expect(screen.onSigned).toHaveBeenCalledWith("signed-xdr"));
  expect(mockedSign).toHaveBeenCalled();
});

it("opens a SEP-7 request and submits the signed XDR returned by the wallet", async () => {
  const screen = renderSheet();

  fireEvent.press(screen.getByLabelText("Open wallet app (SEP-7)"));
  await waitFor(() =>
    expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining("web+stellar:tx?xdr=unsigned-xdr"))
  );

  await act(async () => {
    urlListener?.({ url: `${SEP7_CALLBACK_URL}?result=signed&xdr=signed-in-wallet` });
  });

  await waitFor(() => expect(screen.onSigned).toHaveBeenCalledWith("signed-in-wallet"));
  expect(await screen.findByText(/Signed in your wallet/)).toBeTruthy();
  expect(mockedSign).not.toHaveBeenCalled();
});

it("explains when a wallet declines the SEP-7 request", async () => {
  const screen = renderSheet();

  await act(async () => {
    urlListener?.({ url: `${SEP7_CALLBACK_URL}?result=rejected` });
  });

  expect(await screen.findByText(/Signing was declined/)).toBeTruthy();
  expect(screen.onSigned).not.toHaveBeenCalled();
});

it("shows the source account and fee before signing with the local wallet", async () => {
  const xdr = buildTransactionXdr(LOCAL_KEYPAIR.publicKey());
  mockedGetPublicKey.mockResolvedValue(LOCAL_KEYPAIR.publicKey());
  const screen = renderSheet({ unsignedXdr: xdr });

  expect(await screen.findByLabelText("Local wallet signing")).toBeTruthy();
  expect(screen.getByText(new RegExp(`Source account: ${LOCAL_KEYPAIR.publicKey()}`))).toBeTruthy();
  expect(screen.getByText(/Fee: 0\.0000100 XLM/)).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Sign with this device's wallet"));

  await waitFor(() =>
    expect(mockedSignWithBiometrics).toHaveBeenCalledWith(xdr, TESTNET)
  );
  await waitFor(() => expect(screen.onSigned).toHaveBeenCalledWith("signed-local-xdr"));
});

it("does not submit when local-wallet biometric confirmation fails", async () => {
  const xdr = buildTransactionXdr(LOCAL_KEYPAIR.publicKey());
  mockedGetPublicKey.mockResolvedValue(LOCAL_KEYPAIR.publicKey());
  mockedSignWithBiometrics.mockRejectedValueOnce(
    new Error("Biometric authentication was not completed.")
  );
  const screen = renderSheet({ unsignedXdr: xdr });

  fireEvent.press(await screen.findByLabelText("Sign with this device's wallet"));

  expect(await screen.findByText(/Biometric authentication was not completed/)).toBeTruthy();
  expect(screen.onSigned).not.toHaveBeenCalled();
});
