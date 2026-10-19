import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { signTransactionXdr } from "../api/resources";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SignTransactionSheet } from "./SignTransactionSheet";

jest.mock("../api/resources", () => ({
  DEFAULT_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  signTransactionXdr: jest.fn(() => "signed-xdr"),
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
const VALID_SECRET = "SCXZ7ZA2UUWX4SWVRPE3ENOZAOLG6A53YLBT6A43EFDE25N4MXZ75AAC";

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

beforeEach(() => jest.clearAllMocks());

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
